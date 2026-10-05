import { registry as defaultRegistry, type ComponentRegistry } from '@atrium/component-registry';
import type { PrismaClient } from '@atrium/db';
import type { AIProvider } from '@atrium/providers';
import { loadDraft, persistDraft } from '@atrium/site-store';
import { GENERATION_STEPS, generateSite, type GenerationStep } from './generate-site';
import { createDemoProvider, isDemoMode } from './demo-provider';
import { AiLimitError, assertModelAllowed, Llm } from './llm';
import type { SiteBrief } from './plan';
import { aiFeatureEnabled, draftFingerprint, loadAiOrgPolicy, recordUsage, reserveAiRequests } from './quota';

export { recordUsage } from './quota';

export interface AiResolver {
  ai(args: { organizationId: string; websiteId?: string; providerId?: string | null }): Promise<AIProvider>;
}

export interface ProgressEntry {
  step: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  at?: string;
  detail?: string;
}

/** Permissions the requesting user must STILL hold when the job starts. */
export const SITE_GENERATION_PERMISSIONS = ['ai.use', 'website.create'] as const;
/** Default overall deadline for one site generation. */
export const SITE_GENERATION_DEADLINE_MS = 10 * 60_000;
/** A generation that waited this long for its organization's turn fails instead of waiting forever. */
const MAX_QUEUE_WAIT_MS = 30 * 60_000;

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Raised when a queued generation must not run (permanent; the row is marked FAILED). */
export class GenerationPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationPreflightError';
  }
}

type GenRow = Awaited<ReturnType<PrismaClient['aiGeneration']['findUniqueOrThrow']>>;

/**
 * Re-validate a queued generation at job start: time passes between enqueue and
 * execution (members get removed, roles change, sites get deleted, plans change).
 */
export async function preflightSiteGeneration(prisma: PrismaClient, gen: GenRow): Promise<void> {
  if (gen.kind !== 'SITE') throw new GenerationPreflightError('Not a site generation');
  if (!gen.websiteId) throw new GenerationPreflightError('Generation has no target website');
  const site = await prisma.website.findFirst({ where: { id: gen.websiteId, organizationId: gen.organizationId, deletedAt: null }, select: { id: true } });
  if (!site) throw new GenerationPreflightError('The target website no longer exists');
  const policy = await loadAiOrgPolicy(prisma, gen.organizationId);
  if (policy.suspended) throw new GenerationPreflightError('The organization is suspended');
  if (!aiFeatureEnabled(policy)) throw new GenerationPreflightError('Your plan does not include the AI builder');
  const user = await prisma.user.findUnique({ where: { id: gen.userId }, select: { isSuperAdmin: true, disabledAt: true } });
  if (!user || user.disabledAt) throw new GenerationPreflightError('The requesting user is no longer active');
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: gen.organizationId, userId: gen.userId } },
    select: { role: { select: { permissions: { select: { permissionKey: true } } } } },
  });
  if (!member) {
    if (user.isSuperAdmin) return;
    throw new GenerationPreflightError('The requesting user is no longer a member of this organization');
  }
  const granted = new Set(member.role.permissions.map((p) => p.permissionKey));
  const missing = SITE_GENERATION_PERMISSIONS.filter((p) => !granted.has(p) && !granted.has('*'));
  if (missing.length) throw new GenerationPreflightError(`The requesting user no longer has permission: ${missing.join(', ')}`);
}

/**
 * Background job: generate a full website for an AiGeneration row created by the API
 * (`kind: 'SITE'`, `result.brief`, `websiteId` pointing at a placeholder draft) and
 * persist it through the same draft pipeline as human edits.
 *
 * Returns `{ skipped }` when the row is no longer PENDING (duplicate delivery, already
 * running elsewhere, cancelled) — exactly one runner can claim a generation — and
 * `{ deferred: true }` when the organization already has a generation running (the
 * caller should retry later).
 */
export async function runSiteGeneration(opts: { prisma: PrismaClient; resolver: AiResolver; generationId: string; registry?: ComponentRegistry; onProgress?: (p: ProgressEntry[]) => void; signal?: AbortSignal; deadlineMs?: number }) {
  const { prisma, generationId } = opts;
  const registry = opts.registry ?? defaultRegistry;
  const gen = await prisma.aiGeneration.findUniqueOrThrow({ where: { id: generationId } });
  if (gen.status !== 'PENDING') return { skipped: `generation is ${gen.status}` };

  // Per-org fairness: one tenant can't monopolize the AI workers. The caller re-enqueues with a delay.
  const running = await prisma.aiGeneration.count({ where: { organizationId: gen.organizationId, kind: 'SITE', status: 'RUNNING', id: { not: gen.id }, createdAt: { gte: new Date(Date.now() - 20 * 60_000) } } });
  if (running >= envInt('AI_MAX_RUNNING_SITE_GENERATIONS_PER_ORG', 1)) {
    if (Date.now() - gen.createdAt.getTime() > MAX_QUEUE_WAIT_MS) {
      await prisma.aiGeneration.updateMany({ where: { id: generationId, status: 'PENDING' }, data: { status: 'FAILED', error: 'Timed out waiting for another generation in this organization to finish', finishedAt: new Date() } });
      throw new GenerationPreflightError('Timed out waiting for another generation in this organization to finish');
    }
    return { deferred: true as const };
  }

  const fail = async (message: string, extra: Record<string, unknown> = {}) => {
    await prisma.aiGeneration.updateMany({ where: { id: generationId, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'FAILED', error: message.slice(0, 2000), finishedAt: new Date(), ...extra } });
  };

  try {
    await preflightSiteGeneration(prisma, gen);
  } catch (err) {
    await fail((err as Error).message);
    throw err;
  }
  const meta = (gen.result ?? {}) as { brief?: SiteBrief; prompt?: string; integrationId?: string };
  if (!meta.brief) {
    await fail('Generation has no brief');
    throw new GenerationPreflightError('Generation has no brief');
  }

  const progress: ProgressEntry[] = GENERATION_STEPS.map((s) => ({ step: s.step, label: s.label, status: 'pending' }));
  // Atomic claim: only one runner moves PENDING → RUNNING.
  const claimed = await prisma.aiGeneration.updateMany({ where: { id: generationId, status: 'PENDING' }, data: { status: 'RUNNING', progress: progress as object[] } });
  if (claimed.count === 0) return { skipped: 'generation was claimed by another runner' };

  let lastWrite = 0;
  const save = async (force = false) => {
    opts.onProgress?.(progress);
    if (!force && Date.now() - lastWrite < 400) return;
    lastWrite = Date.now();
    await prisma.aiGeneration.update({ where: { id: generationId }, data: { progress: progress as object[] } });
  };

  const deadline = AbortSignal.timeout(opts.deadlineMs ?? envInt('AI_SITE_DEADLINE_MS', SITE_GENERATION_DEADLINE_MS));
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  const websiteId = gen.websiteId!;
  let llm: Llm | null = null;
  try {
    const policy = await loadAiOrgPolicy(prisma, gen.organizationId);
    const provider = isDemoMode() ? createDemoProvider() : await opts.resolver.ai({ organizationId: gen.organizationId, websiteId, providerId: meta.integrationId ?? null });
    const model = isDemoMode() ? undefined : assertModelAllowed(provider, gen.model);
    llm = new Llm(provider, model, {
      signal,
      maxTotalTokens: envInt('AI_SITE_TOKEN_BUDGET', 2_000_000),
      maxRequests: envInt('AI_SITE_MAX_CALLS', 60),
      beforeCall: () => reserveAiRequests(prisma, gen.organizationId, policy.limits),
    });
    const result = await generateSite({
      llm,
      registry,
      brief: meta.brief,
      prompt: meta.prompt ?? gen.prompt,
      onProgress: async (step: GenerationStep, status, detail) => {
        const entry = progress.find((p) => p.step === step)!;
        entry.status = status;
        entry.at = new Date().toISOString();
        if (detail) entry.detail = detail;
        await save(status !== 'running');
      },
    });
    if (signal.aborted) throw new AiLimitError('Site generation exceeded its time limit', 'deadline');

    const persisted = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${websiteId}))`;
        const { definition: before } = await loadDraft(tx, websiteId);
        const after = { ...result.definition, settings: { ...result.definition.settings } };
        const res = await persistDraft(tx, websiteId, before, after, { userId: gen.userId, versionSource: 'AI', versionMessage: 'Before AI generation', aiGenerationId: generationId });
        const { definition: stored } = await loadDraft(tx, websiteId);
        return { res, before, fingerprint: draftFingerprint(stored, { all: true }) };
      },
      { timeout: 60_000 },
    );

    const preview = progress.find((p) => p.step === 'preview')!;
    preview.status = 'done';
    preview.at = new Date().toISOString();
    await prisma.aiGeneration.update({
      where: { id: generationId },
      data: {
        status: 'SUCCEEDED',
        progress: progress as object[],
        model: llm.modelId,
        provider: provider.driver,
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        costUsd: llm.usage.costUsd,
        result: { ...meta, plan: { siteName: result.plan.siteName, tagline: result.plan.tagline, pages: result.plan.pages.map((p) => p.title), theme: result.plan.themePreset }, issues: result.issues.length, report: { ok: result.report.ok, errors: result.report.errors, warnings: result.report.warnings } } as object,
        rollback: { definition: persisted.before, pageVersions: persisted.res.pageVersions, afterFingerprint: persisted.fingerprint, appliedAt: new Date().toISOString() } as object,
        finishedAt: new Date(),
      },
    });
    await recordUsage(prisma, gen.organizationId, llm.usage);
    await prisma.auditLog.create({ data: { organizationId: gen.organizationId, websiteId, actorType: 'AI', actorName: `AI (${llm.modelId})`, action: 'ai.site_generated', resourceType: 'website', resourceId: websiteId, summary: `AI generated ${result.definition.pages.length} pages`, metadata: { generationId } } });
    return { websiteId, definition: result.definition };
  } catch (err) {
    const running = progress.find((p) => p.status === 'running');
    if (running) running.status = 'failed';
    const message = signal.aborted && !(err instanceof AiLimitError) ? 'Site generation exceeded its time limit' : (err as Error).message;
    await fail(message, { progress: progress as object[], inputTokens: llm?.usage.inputTokens ?? 0, outputTokens: llm?.usage.outputTokens ?? 0, costUsd: llm?.usage.costUsd ?? 0 });
    if (llm) await recordUsage(prisma, gen.organizationId, llm.usage).catch(() => undefined);
    throw err;
  }
}
