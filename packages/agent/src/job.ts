import { registry as defaultRegistry, type ComponentRegistry } from '@atrium/component-registry';
import type { PrismaClient } from '@atrium/db';
import type { AIProvider } from '@atrium/providers';
import { loadDraft, persistDraft } from '@atrium/site-store';
import { GENERATION_STEPS, generateSite, type GenerationStep } from './generate-site';
import { Llm } from './llm';
import type { SiteBrief } from './plan';

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

export async function recordUsage(prisma: PrismaClient, organizationId: string, usage: { requests: number; inputTokens: number; outputTokens: number; costUsd: number }) {
  const period = new Date().toISOString().slice(0, 7);
  await prisma.aiUsage.upsert({
    where: { organizationId_period: { organizationId, period } },
    create: { organizationId, period, requests: usage.requests, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd },
    update: { requests: { increment: usage.requests }, inputTokens: { increment: usage.inputTokens }, outputTokens: { increment: usage.outputTokens }, costUsd: { increment: usage.costUsd } },
  });
}

/**
 * Background job: generate a full website for an AiGeneration row created by the API
 * (`kind: 'SITE'`, `result.brief`, `websiteId` pointing at a placeholder draft) and
 * persist it through the same draft pipeline as human edits.
 */
export async function runSiteGeneration(opts: { prisma: PrismaClient; resolver: AiResolver; generationId: string; registry?: ComponentRegistry; onProgress?: (p: ProgressEntry[]) => void; signal?: AbortSignal }) {
  const { prisma, generationId } = opts;
  const registry = opts.registry ?? defaultRegistry;
  const gen = await prisma.aiGeneration.findUniqueOrThrow({ where: { id: generationId } });
  if (!gen.websiteId) throw new Error('Generation has no target website');
  const meta = (gen.result ?? {}) as { brief?: SiteBrief; prompt?: string; integrationId?: string };
  if (!meta.brief) throw new Error('Generation has no brief');

  const progress: ProgressEntry[] = GENERATION_STEPS.map((s) => ({ step: s.step, label: s.label, status: 'pending' }));
  let lastWrite = 0;
  const save = async (force = false) => {
    opts.onProgress?.(progress);
    if (!force && Date.now() - lastWrite < 400) return;
    lastWrite = Date.now();
    await prisma.aiGeneration.update({ where: { id: generationId }, data: { progress: progress as object[] } });
  };
  await prisma.aiGeneration.update({ where: { id: generationId }, data: { status: 'RUNNING', progress: progress as object[] } });

  let llm: Llm | null = null;
  try {
    const provider = await opts.resolver.ai({ organizationId: gen.organizationId, websiteId: gen.websiteId, providerId: meta.integrationId ?? null });
    llm = new Llm(provider, gen.model && gen.model !== 'default' ? gen.model : undefined, opts.signal);
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

    const websiteId = gen.websiteId;
    const persisted = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${websiteId}))`;
        const { definition: before } = await loadDraft(tx, websiteId);
        const after = { ...result.definition, settings: { ...result.definition.settings } };
        const res = await persistDraft(tx, websiteId, before, after, { userId: gen.userId, versionSource: 'AI', versionMessage: 'Before AI generation', aiGenerationId: generationId });
        return { res, before };
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
        rollback: { definition: persisted.before, pageVersions: persisted.res.pageVersions } as object,
        finishedAt: new Date(),
      },
    });
    await recordUsage(prisma, gen.organizationId, llm.usage);
    await prisma.auditLog.create({ data: { organizationId: gen.organizationId, websiteId, actorType: 'AI', actorName: `AI (${llm.modelId})`, action: 'ai.site_generated', resourceType: 'website', resourceId: websiteId, summary: `AI generated ${result.definition.pages.length} pages`, metadata: { generationId } } });
    return { websiteId, definition: result.definition };
  } catch (err) {
    const running = progress.find((p) => p.status === 'running');
    if (running) running.status = 'failed';
    await prisma.aiGeneration.update({
      where: { id: generationId },
      data: { status: 'FAILED', error: (err as Error).message.slice(0, 2000), progress: progress as object[], finishedAt: new Date(), inputTokens: llm?.usage.inputTokens ?? 0, outputTokens: llm?.usage.outputTokens ?? 0, costUsd: llm?.usage.costUsd ?? 0 },
    });
    if (llm) await recordUsage(prisma, gen.organizationId, llm.usage).catch(() => undefined);
    throw err;
  }
}
