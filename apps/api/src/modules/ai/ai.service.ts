import { Injectable, Logger } from '@nestjs/common';
import {
  aiChangeViolations, aiFeatureEnabled, assertModelAllowed, createDemoProvider, draftFingerprint, isDemoMode, Llm, loadAiOrgPolicy, proposeEdit,
  recordUsage, reserveAiRequests, rewriteText, runSiteGeneration, seoRecommendations, type AiOrgPolicy, type LlmOptions, type RewriteMode, type SiteBrief,
} from '@atrium/agent';
import { applyOperation, type SiteOperation } from '@atrium/builder-core';
import { getDriver, listDrivers } from '@atrium/providers';
import type { WebsiteDefinition } from '@atrium/schema';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AccessContext, AuthUser } from '../../common/decorators';
import { badRequest, conflict, forbidden, limitExceeded, notConfigured, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ResolverService } from '../providers/resolver.service';
import { blankWebsite } from '../websites/blank';
import { DraftService } from '../websites/draft.service';
import { WebsitesService } from '../websites/websites.service';
import { AiLimiter, AI_LIMITS, tooManyAiRequests } from './ai-limits';
import { confirmationReasons, confirmationRequired, mapAiError, modeOfKind, revertStale, touchedUnits } from './ai-policy';

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Per-request bounds for interactive AI calls. */
export const AI_REQUEST_LIMITS = {
  proposeDeadlineMs: () => envInt('AI_PROPOSE_DEADLINE_MS', 120_000),
  proposeTokenBudget: () => envInt('AI_PROPOSE_TOKEN_BUDGET', 400_000),
  proposeMaxCalls: () => envInt('AI_PROPOSE_MAX_CALLS', 16),
  assistDeadlineMs: () => envInt('AI_ASSIST_DEADLINE_MS', 60_000),
  assistTokenBudget: () => envInt('AI_ASSIST_TOKEN_BUDGET', 60_000),
};

type Rollback = {
  before?: WebsiteDefinition;
  definition?: WebsiteDefinition;
  changed?: { site: boolean; theme: boolean; pages: string[]; forms: string[]; redirects: boolean; globalSections?: string[] };
  createdPages?: string[];
  deletedPages?: string[];
  afterFingerprint?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger('AI');
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly drafts: DraftService,
    private readonly websites: WebsitesService,
    private readonly orgs: OrganizationsService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
    private readonly limiter: AiLimiter,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  models() {
    return listDrivers('ai').map((d) => {
      let models: Array<{ id: string; label: string; default?: boolean }> = [];
      try {
        const inst = d.create(d.configSchema.parse({}) as never, { apiKey: 'probe' } as never) as { models?: typeof models };
        models = (inst.models ?? []).map((m) => ({ id: m.id, label: m.label, default: m.default }));
      } catch {
        models = [];
      }
      const envKey = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }[d.id];
      return { provider: d.id, name: d.name, configured: !!(envKey && process.env[envKey]), models };
    }).concat(isDemoMode() ? [{ provider: 'demo', name: 'Atrium demo (offline)', configured: true, models: [{ id: 'atrium-demo', label: 'Atrium demo (offline)', default: true }] }] : []);
  }

  /**
   * Is AI usable for this organization, and where does the key come from? Lets the UI offer to
   * connect a provider (integration.manage) or point super admins at Platform providers.
   */
  async status(orgId: string, access: AccessContext, user: AuthUser) {
    const canConfigure = access.permissions.has('*') || access.permissions.has('integration.manage');
    const base = { canConfigure, canConfigurePlatform: user.isSuperAdmin, demoMode: isDemoMode() };
    if (isDemoMode()) return { ...base, ready: true, source: 'demo' as const, provider: { driver: 'demo', name: 'Atrium demo (offline)' } };
    try {
      const p = await this.resolver.resolver.ai({ organizationId: orgId });
      return { ...base, ready: true, source: p.source, provider: { driver: p.driver, name: p.name } };
    } catch {
      return { ...base, ready: false, source: null, provider: null };
    }
  }

  /** Plan gate: the org's plan (with super-admin feature flag overrides) must include `aiBuilder`. */
  async assertAiEnabled(orgId: string): Promise<AiOrgPolicy> {
    const policy = await loadAiOrgPolicy(this.db, orgId).catch(() => {
      throw notFound('Organization');
    });
    if (policy.suspended) throw forbidden('This organization is suspended');
    if (!aiFeatureEnabled(policy)) throw forbidden('Your plan does not include the AI builder', { feature: 'aiBuilder' });
    return policy;
  }

  /** Fast pre-check (the authoritative check is the atomic per-call reservation). */
  private async assertQuota(orgId: string, policy: AiOrgPolicy) {
    const { limits } = policy;
    const usage = await this.db.aiUsage.findUnique({ where: { organizationId_period: { organizationId: orgId, period: new Date().toISOString().slice(0, 7) } } });
    if (limits.aiRequestsPerMonth !== undefined && (usage?.requests ?? 0) >= limits.aiRequestsPerMonth) throw limitExceeded('Monthly AI request limit reached for your plan');
    if (limits.aiTokensPerMonth !== undefined && (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) >= limits.aiTokensPerMonth) throw limitExceeded('Monthly AI token limit reached for your plan');
  }

  /** Model ids are allowlisted against the provider catalog. */
  private assertKnownModel(provider: string | undefined, model: string | undefined) {
    if (!model || model === 'default' || isDemoMode()) return;
    const catalogs = this.models().filter((m) => !provider || m.provider === provider);
    if (!catalogs.some((c) => c.models.some((m) => m.id === model))) throw badRequest(`Unknown model "${model.slice(0, 80)}"${provider ? ` for provider ${provider}` : ''}`);
  }

  private async llm(orgId: string, websiteId: string | undefined, opts: { provider?: string; model?: string; integrationId?: string }, policy: AiOrgPolicy, limits: Omit<LlmOptions, 'beforeCall'>) {
    const options: LlmOptions = { ...limits, beforeCall: () => reserveAiRequests(this.db, orgId, policy.limits) };
    if (isDemoMode()) return new Llm(createDemoProvider(), undefined, options);
    if (opts.provider && !getDriver('ai', opts.provider)) throw badRequest(`Unknown AI provider "${opts.provider.slice(0, 40)}"`);
    let provider;
    try {
      provider = await this.resolver.resolver.ai({ organizationId: orgId, websiteId, providerId: opts.integrationId ?? null, driver: opts.provider } as never);
    } catch (err) {
      throw notConfigured(`No AI provider is configured. Connect Claude, OpenAI or Gemini in Integrations. (${(err as Error).message})`);
    }
    let model: string | undefined;
    try {
      model = assertModelAllowed(provider, opts.model);
    } catch (err) {
      mapAiError(err);
    }
    return new Llm(provider, model, options);
  }

  generationDto(g: { id: string; kind: string; prompt: string; provider: string; model: string; status: string; inputTokens: number; outputTokens: number; costUsd: unknown; createdAt: Date; progress?: unknown; result?: unknown; error?: string | null; websiteId: string | null; userId?: string }, full = false) {
    return {
      id: g.id, kind: g.kind, prompt: g.prompt, provider: g.provider, model: g.model, status: g.status, inputTokens: g.inputTokens, outputTokens: g.outputTokens, costUsd: Number(g.costUsd), createdAt: g.createdAt.toISOString(), websiteId: g.websiteId,
      ...(full ? { progress: g.progress ?? [], result: g.result ?? null, error: g.error ?? null } : {}),
    };
  }

  // ── Site generation ──
  async generateSite(orgId: string, body: { brief: SiteBrief; prompt?: string; provider?: string; model?: string; integrationId?: string }, user: AuthUser) {
    const policy = await this.assertAiEnabled(orgId);
    await this.assertQuota(orgId, policy);
    if (body.provider && !isDemoMode() && !getDriver('ai', body.provider)) throw badRequest(`Unknown AI provider "${body.provider.slice(0, 40)}"`);
    this.assertKnownModel(body.provider ?? (body.integrationId ? undefined : env().AI_DEFAULT_PROVIDER), body.model);
    const name = body.brief.businessName.trim();
    // Fairness: bounded number of queued/running site generations per organization (admission is serialized per org).
    return this.limiter.withLock(`site-gen:${orgId}`, 15_000, async () => {
      const active = await this.db.aiGeneration.count({ where: { organizationId: orgId, kind: 'SITE', status: { in: ['PENDING', 'RUNNING'] }, createdAt: { gte: new Date(Date.now() - 20 * 60_000) } } });
      if (active >= AI_LIMITS.siteGenerationsPerOrg()) throw tooManyAiRequests('A website is already being generated for your organization. Wait for it to finish before starting another.');
      const website = await this.websites.createFromInput(orgId, name, blankWebsite(name), user);
      const gen = await this.db.aiGeneration.create({
        data: {
          organizationId: orgId, websiteId: website.id, userId: user.id, kind: 'SITE', prompt: body.prompt ?? `${body.brief.businessType}: ${body.brief.description}`.slice(0, 4000),
          provider: isDemoMode() ? 'demo' : (body.provider ?? env().AI_DEFAULT_PROVIDER), model: isDemoMode() ? 'atrium-demo' : (body.model ?? 'default'), status: 'PENDING',
          result: { brief: body.brief, prompt: body.prompt, integrationId: body.integrationId } as object,
        },
      });
      await this.audit.log({ organizationId: orgId, websiteId: website.id, actor: user, action: 'ai.generation_started', resourceType: 'aiGeneration', resourceId: gen.id, summary: `${user.name} asked AI to generate ${name}` });
      if (env().DISABLE_QUEUES) {
        // In-process fallback for local development without a worker (same preflight + deadline as the worker).
        this.runInline(gen.id);
      } else {
        await this.queues.add('ai', 'ai.generate-site', { generationId: gen.id }, { attempts: 1, jobId: `gen-${gen.id}` });
      }
      return { generationId: gen.id, websiteId: website.id };
    }, () => tooManyAiRequests('Another website generation is being started for your organization. Try again in a moment.'));
  }

  /** DISABLE_QUEUES fallback: run in-process, retrying while the org's fairness slot is busy. */
  private runInline(generationId: string, attempt = 0) {
    void runSiteGeneration({ prisma: this.db, resolver: this.resolver.resolver as never, generationId })
      .then((r) => {
        if ((r as { deferred?: boolean }).deferred && attempt < 60) setTimeout(() => this.runInline(generationId, attempt + 1), 30_000).unref();
      })
      .catch((err) => this.logger.warn(`inline generation failed: ${(err as Error).message}`));
  }

  async generation(id: string) {
    return this.generationDto(await this.db.aiGeneration.findUniqueOrThrow({ where: { id } }), true);
  }

  // ── Edit / page / section proposals ──
  async propose(websiteId: string, body: { prompt: string; pageId?: string; nodeId?: string; index?: number; provider?: string; model?: string }, mode: 'edit' | 'page' | 'section', user: AuthUser, access: AccessContext) {
    const site = await this.db.website.findFirst({ where: { id: websiteId, deletedAt: null } });
    if (!site) throw notFound('Website');
    const policy = await this.assertAiEnabled(site.organizationId);
    await this.assertQuota(site.organizationId, policy);
    return this.limiter.runAiRequest(site.organizationId, user.id, async () => {
      const llm = await this.llm(site.organizationId, websiteId, body, policy, {
        signal: AbortSignal.timeout(AI_REQUEST_LIMITS.proposeDeadlineMs()),
        maxTotalTokens: AI_REQUEST_LIMITS.proposeTokenBudget(),
        maxRequests: AI_REQUEST_LIMITS.proposeMaxCalls(),
      });
      const { definition } = await this.drafts.load(websiteId);
      if (body.pageId && !definition.pages.some((p) => p.id === body.pageId)) throw badRequest('Page not found');
      let proposal;
      try {
        proposal = await proposeEdit({ llm, registry: this.drafts.registry, definition, prompt: body.prompt, pageId: body.pageId, nodeId: body.nodeId, mode, insertIndex: body.index, granted: access.permissions });
      } catch (err) {
        mapAiError(err);
      } finally {
        await recordUsage(this.db, site.organizationId, llm.usage).catch(() => undefined);
      }
      const reasons = confirmationReasons(proposal, mode);
      const requiresConfirmation = reasons.length > 0;
      const gen = await this.db.aiGeneration.create({
        data: {
          organizationId: site.organizationId, websiteId, pageId: body.pageId, userId: user.id, kind: mode === 'edit' ? 'EDIT' : mode === 'page' ? 'PAGE' : 'SECTION', prompt: body.prompt.slice(0, 4000),
          provider: llm.provider.driver, model: llm.modelId, status: 'SUCCEEDED', inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: llm.usage.costUsd,
          operations: proposal.operations as object[],
          result: { summary: proposal.summary, changes: proposal.changes, warnings: proposal.warnings, rejected: proposal.rejected, applied: false, requiresConfirmation, confirmationReasons: reasons } as object,
          finishedAt: new Date(),
        },
      });
      return {
        generationId: gen.id, summary: proposal.summary, operations: proposal.operations, changes: proposal.changes, warnings: proposal.warnings, rejected: proposal.rejected,
        requiresConfirmation, confirmationReasons: reasons,
        usage: { inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: Math.round(llm.usage.costUsd * 10_000) / 10_000 },
      };
    });
  }

  /** Apply a stored proposal as ONE versioned change; keeps what's needed to revert it. */
  async apply(id: string, user: AuthUser, access: AccessContext, body: { confirm?: boolean } = {}) {
    return this.limiter.withLock(`gen:${id}`, 60_000, async () => {
      const gen = await this.db.aiGeneration.findUniqueOrThrow({ where: { id } });
      const result = (gen.result ?? {}) as { applied?: boolean; requiresConfirmation?: boolean; confirmationReasons?: string[] };
      if (!gen.websiteId || gen.kind === 'SITE' || gen.status !== 'SUCCEEDED') throw badRequest('Nothing to apply');
      if (result.applied) throw badRequest('This change was already applied');
      if (gen.revertedAt) throw badRequest('This change was reverted');
      await this.assertAiEnabled(gen.organizationId);
      if (result.requiresConfirmation && body.confirm !== true) throw confirmationRequired(result.confirmationReasons ?? ['This change needs confirmation']);
      const ops = (gen.operations ?? []) as unknown as SiteOperation[];
      if (!ops.length) throw badRequest('This proposal contains no changes');
      const mode = modeOfKind(gen.kind);
      // AI output is untrusted: re-check the AI policy on the change as it applies to the CURRENT draft,
      // then DraftService authorizes the resulting diff exactly like a manual edit by this user.
      const res = await this.drafts.transform(
        gen.websiteId,
        (d, before) => {
          for (const op of ops) applyOperation(d, op, this.drafts.registry);
          const violations = aiChangeViolations(before, d, { mode, targetPageId: gen.pageId ?? undefined });
          if (violations.length) throw forbidden(`This AI change is not allowed: ${violations.join('; ')}`);
        },
        { userId: user.id, versionSource: 'AI', versionMessage: `Before AI: ${gen.prompt.slice(0, 80)}`, aiGenerationId: id },
        { access },
      );
      const { definition: stored } = await this.drafts.load(gen.websiteId);
      const afterFingerprint = draftFingerprint(stored, touchedUnits(res.changed, res.createdPages, res.deletedPages));
      const rollback = { before: res.before, changed: res.changed, createdPages: res.createdPages, deletedPages: res.deletedPages, pageVersions: res.pageVersions, afterFingerprint, appliedRevisions: res.revisions };
      await this.db.aiGeneration.update({ where: { id }, data: { result: { ...result, applied: true, appliedAt: new Date().toISOString(), appliedBy: user.id } as object, rollback: rollback as object } });
      await this.audit.log({ organizationId: gen.organizationId, websiteId: gen.websiteId, actor: user, actorType: 'AI', action: 'ai.changes_applied', resourceType: 'aiGeneration', resourceId: id, summary: `AI ${gen.kind === 'PAGE' ? 'created a page' : 'edited the site'}: ${gen.prompt.slice(0, 80)}`, metadata: { operations: ops.length, confirmed: body.confirm === true } });
      return { revisions: res.revisions };
    }, () => conflict('This AI change is already being applied or reverted'));
  }

  /** Restore the units an AI change touched to their pre-change state. */
  async revert(id: string, user: AuthUser, access: AccessContext, body: { force?: boolean } = {}) {
    return this.limiter.withLock(`gen:${id}`, 60_000, async () => {
      const gen = await this.db.aiGeneration.findUniqueOrThrow({ where: { id } });
      if (!gen.websiteId) throw badRequest('Nothing to revert');
      if (gen.revertedAt) throw badRequest('Already reverted');
      const rb = gen.rollback as Rollback | null;
      if (!rb) throw badRequest('This change has not been applied');
      const wholeSite = !rb.changed;
      const canUpdateSite = this.can(access, 'website.update');
      // Restoring a whole generated site replaces settings, theme, navigation, forms… → website.update.
      if (wholeSite && !canUpdateSite) throw forbidden('Missing permission: website.update (required to revert a generated website)');
      if (body.force && !canUpdateSite) throw forbidden('Missing permission: website.update (required to force a revert)');
      // Legacy rows applied before fingerprints were recorded: whole-site reverts need an explicit force.
      if (!rb.afterFingerprint && wholeSite && !body.force) throw revertStale();
      const before = rb.before ?? rb.definition!;
      const units = wholeSite ? { all: true } : touchedUnits(rb.changed!, rb.createdPages, rb.deletedPages);
      const res = await this.drafts.transform(
        gen.websiteId,
        (d, current) => {
          if (rb.afterFingerprint && !body.force && draftFingerprint(current, units) !== rb.afterFingerprint) throw revertStale();
          if (!rb.changed) {
            Object.assign(d, before); // whole-site generation: restore everything
            return;
          }
          if (rb.changed.site) Object.assign(d, { settings: before.settings, navigation: before.navigation, header: before.header, footer: before.footer, customCss: before.customCss });
          if (rb.changed.theme) d.theme = before.theme;
          if (rb.changed.redirects) d.redirects = before.redirects;
          if (rb.changed.globalSections?.length) d.globalSections = before.globalSections;
          d.pages = d.pages.filter((p) => !rb.createdPages?.includes(p.id));
          for (const pid of rb.changed.pages) {
            const prev = before.pages.find((p) => p.id === pid);
            const i = d.pages.findIndex((p) => p.id === pid);
            if (prev && i >= 0) d.pages[i] = prev;
          }
          for (const pid of rb.deletedPages ?? []) {
            const prev = before.pages.find((p) => p.id === pid);
            if (prev && !d.pages.some((p) => p.id === pid || p.slug === prev.slug)) d.pages.push(prev);
          }
          for (const fid of rb.changed.forms) {
            const prev = before.forms.find((f) => f.id === fid);
            d.forms = prev ? d.forms.map((f) => (f.id === fid ? prev : f)) : d.forms.filter((f) => f.id !== fid);
          }
        },
        { userId: user.id, versionSource: 'RESTORE', versionMessage: 'Before reverting AI change' },
        { access },
      );
      await this.db.aiGeneration.update({ where: { id }, data: { status: 'REVERTED', revertedAt: new Date() } });
      await this.audit.log({ organizationId: gen.organizationId, websiteId: gen.websiteId, actor: user, action: 'ai.changes_reverted', resourceType: 'aiGeneration', resourceId: id, summary: `${user.name} reverted an AI change${body.force ? ' (forced)' : ''}`, metadata: { forced: !!body.force } });
      return { revisions: res.revisions };
    }, () => conflict('This AI change is already being applied or reverted'));
  }

  private can(access: AccessContext, permission: string) {
    return access.permissions.has('*') || access.permissions.has(permission);
  }

  /** Short single-call helpers (rewrite / SEO) share the plan gate, quota reservation, slots and deadline. */
  private async assist<T>(websiteId: string, user: AuthUser, fn: (llm: Llm, definition: WebsiteDefinition) => Promise<T>): Promise<T> {
    const site = await this.db.website.findFirst({ where: { id: websiteId, deletedAt: null } });
    if (!site) throw notFound('Website');
    const policy = await this.assertAiEnabled(site.organizationId);
    await this.assertQuota(site.organizationId, policy);
    return this.limiter.runAiRequest(site.organizationId, user.id, async () => {
      const llm = await this.llm(site.organizationId, websiteId, {}, policy, { signal: AbortSignal.timeout(AI_REQUEST_LIMITS.assistDeadlineMs()), maxTotalTokens: AI_REQUEST_LIMITS.assistTokenBudget(), maxRequests: 2 });
      const { definition } = await this.drafts.load(websiteId);
      try {
        return await fn(llm, definition);
      } catch (err) {
        mapAiError(err);
      } finally {
        await recordUsage(this.db, site.organizationId, llm.usage).catch(() => undefined);
      }
    });
  }

  async rewrite(websiteId: string, body: { text: string; mode: RewriteMode; locale?: string; context?: string }, user: AuthUser) {
    return this.assist(websiteId, user, async (llm, definition) => ({ text: await rewriteText(llm, { ...body, voice: definition.settings.business.tagline }) }));
  }

  async seo(websiteId: string, pageId: string, user: AuthUser) {
    return this.assist(websiteId, user, async (llm, definition) => {
      const page = definition.pages.find((p) => p.id === pageId);
      if (!page) throw notFound('Page');
      return seoRecommendations(llm, definition, page);
    });
  }

  async history(websiteId: string) {
    const rows = await this.db.aiGeneration.findMany({ where: { websiteId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const users = new Map((await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...this.generationDto(r), user: users.get(r.userId) }));
  }

  async usage(orgId: string) {
    const period = new Date().toISOString().slice(0, 7);
    const u = await this.db.aiUsage.findUnique({ where: { organizationId_period: { organizationId: orgId, period } } });
    const limits = await this.orgs.limits(orgId);
    return { period, requests: u?.requests ?? 0, inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, costUsd: Number(u?.costUsd ?? 0), limit: { requests: limits.aiRequestsPerMonth, tokens: limits.aiTokensPerMonth } };
  }

  driverExists(id: string) {
    return !!getDriver('ai', id);
  }
}

