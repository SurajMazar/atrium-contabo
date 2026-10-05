import { Injectable, Logger } from '@nestjs/common';
import { Llm, proposeEdit, recordUsage, rewriteText, runSiteGeneration, seoRecommendations, type RewriteMode, type SiteBrief } from '@atrium/agent';
import type { SiteOperation } from '@atrium/builder-core';
import { getDriver, listDrivers } from '@atrium/providers';
import type { WebsiteDefinition } from '@atrium/schema';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, limitExceeded, notConfigured, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ResolverService } from '../providers/resolver.service';
import { blankWebsite } from '../websites/blank';
import { DraftService } from '../websites/draft.service';
import { WebsitesService } from '../websites/websites.service';

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
    });
  }

  private async assertQuota(orgId: string) {
    const limits = await this.orgs.limits(orgId);
    const usage = await this.db.aiUsage.findUnique({ where: { organizationId_period: { organizationId: orgId, period: new Date().toISOString().slice(0, 7) } } });
    if (limits.aiRequestsPerMonth !== undefined && (usage?.requests ?? 0) >= limits.aiRequestsPerMonth) throw limitExceeded('Monthly AI request limit reached for your plan');
    if (limits.aiTokensPerMonth !== undefined && (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) >= limits.aiTokensPerMonth) throw limitExceeded('Monthly AI token limit reached for your plan');
  }

  private async llm(orgId: string, websiteId: string | undefined, opts: { provider?: string; model?: string; integrationId?: string } = {}) {
    let provider;
    try {
      provider = await this.resolver.resolver.ai({ organizationId: orgId, websiteId, providerId: opts.integrationId ?? null, driver: opts.provider } as never);
    } catch (err) {
      throw notConfigured(`No AI provider is configured. Connect Claude, OpenAI or Gemini in Integrations. (${(err as Error).message})`);
    }
    return new Llm(provider, opts.model);
  }

  generationDto(g: { id: string; kind: string; prompt: string; provider: string; model: string; status: string; inputTokens: number; outputTokens: number; costUsd: unknown; createdAt: Date; progress?: unknown; result?: unknown; error?: string | null; websiteId: string | null; userId?: string }, full = false) {
    return {
      id: g.id, kind: g.kind, prompt: g.prompt, provider: g.provider, model: g.model, status: g.status, inputTokens: g.inputTokens, outputTokens: g.outputTokens, costUsd: Number(g.costUsd), createdAt: g.createdAt.toISOString(), websiteId: g.websiteId,
      ...(full ? { progress: g.progress ?? [], result: g.result ?? null, error: g.error ?? null } : {}),
    };
  }

  // ── Site generation ──
  async generateSite(orgId: string, body: { brief: SiteBrief; prompt?: string; provider?: string; model?: string; integrationId?: string }, user: AuthUser) {
    await this.assertQuota(orgId);
    const name = body.brief.businessName.trim();
    const website = await this.websites.createFromInput(orgId, name, blankWebsite(name), user);
    const gen = await this.db.aiGeneration.create({
      data: {
        organizationId: orgId, websiteId: website.id, userId: user.id, kind: 'SITE', prompt: body.prompt ?? `${body.brief.businessType}: ${body.brief.description}`.slice(0, 4000),
        provider: body.provider ?? env().AI_DEFAULT_PROVIDER, model: body.model ?? 'default', status: 'PENDING',
        result: { brief: body.brief, prompt: body.prompt, integrationId: body.integrationId } as object,
      },
    });
    await this.audit.log({ organizationId: orgId, websiteId: website.id, actor: user, action: 'ai.generation_started', resourceType: 'aiGeneration', resourceId: gen.id, summary: `${user.name} asked AI to generate ${name}` });
    if (env().DISABLE_QUEUES) {
      // In-process fallback for local development without a worker.
      void runSiteGeneration({ prisma: this.db, resolver: this.resolver.resolver as never, generationId: gen.id }).catch((err) => this.logger.warn(`inline generation failed: ${(err as Error).message}`));
    } else {
      await this.queues.add('ai', 'ai.generate-site', { generationId: gen.id }, { attempts: 1, jobId: `gen-${gen.id}` });
    }
    return { generationId: gen.id, websiteId: website.id };
  }

  async generation(id: string) {
    return this.generationDto(await this.db.aiGeneration.findUniqueOrThrow({ where: { id } }), true);
  }

  // ── Edit / page / section proposals ──
  async propose(websiteId: string, body: { prompt: string; pageId?: string; nodeId?: string; index?: number; provider?: string; model?: string }, mode: 'edit' | 'page' | 'section', user: AuthUser) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    await this.assertQuota(site.organizationId);
    const llm = await this.llm(site.organizationId, websiteId, body);
    const { definition } = await this.drafts.load(websiteId);
    if (body.pageId && !definition.pages.some((p) => p.id === body.pageId)) throw badRequest('Page not found');
    let proposal;
    try {
      proposal = await proposeEdit({ llm, registry: this.drafts.registry, definition, prompt: body.prompt, pageId: body.pageId, nodeId: body.nodeId, mode, insertIndex: body.index });
    } finally {
      await recordUsage(this.db, site.organizationId, llm.usage).catch(() => undefined);
    }
    const gen = await this.db.aiGeneration.create({
      data: {
        organizationId: site.organizationId, websiteId, pageId: body.pageId, userId: user.id, kind: mode === 'edit' ? 'EDIT' : mode === 'page' ? 'PAGE' : 'SECTION', prompt: body.prompt.slice(0, 4000),
        provider: llm.provider.driver, model: llm.modelId, status: 'SUCCEEDED', inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: llm.usage.costUsd,
        operations: proposal.operations as object[], result: { summary: proposal.summary, changes: proposal.changes, warnings: proposal.warnings, applied: false } as object, finishedAt: new Date(),
      },
    });
    const removes = proposal.changes.filter((c) => c.kind === 'removed').length;
    return {
      generationId: gen.id, summary: proposal.summary, operations: proposal.operations, changes: proposal.changes, warnings: proposal.warnings,
      requiresConfirmation: removes > 0 || proposal.changes.length > 3 || mode !== 'edit' || proposal.changes.some((c) => c.scope === 'theme' || c.scope === 'page'),
      usage: { inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: Math.round(llm.usage.costUsd * 10_000) / 10_000 },
    };
  }

  /** Apply a stored proposal as ONE versioned change; keeps what's needed to revert it. */
  async apply(id: string, user: AuthUser) {
    const gen = await this.db.aiGeneration.findUniqueOrThrow({ where: { id } });
    const result = (gen.result ?? {}) as { applied?: boolean };
    if (!gen.websiteId) throw badRequest('Nothing to apply');
    if (result.applied) throw badRequest('This change was already applied');
    const ops = (gen.operations ?? []) as unknown as SiteOperation[];
    if (!ops.length) throw badRequest('This proposal contains no changes');
    const res = await this.drafts.applyOperations(gen.websiteId, ops, { userId: user.id, versionSource: 'AI', versionMessage: `Before AI: ${gen.prompt.slice(0, 80)}`, aiGenerationId: id });
    const rollback = { before: res.before, changed: res.changed, createdPages: res.createdPages, deletedPages: res.deletedPages, pageVersions: res.pageVersions };
    await this.db.aiGeneration.update({ where: { id }, data: { result: { ...result, applied: true, appliedAt: new Date().toISOString() } as object, rollback: rollback as object } });
    await this.audit.log({ organizationId: gen.organizationId, websiteId: gen.websiteId, actor: user, actorType: 'AI', action: 'ai.changes_applied', resourceType: 'aiGeneration', resourceId: id, summary: `AI ${gen.kind === 'PAGE' ? 'created a page' : 'edited the site'}: ${gen.prompt.slice(0, 80)}`, metadata: { operations: ops.length } });
    return { revisions: res.revisions };
  }

  /** Restore the units an AI change touched to their pre-change state. */
  async revert(id: string, user: AuthUser) {
    const gen = await this.db.aiGeneration.findUniqueOrThrow({ where: { id } });
    if (!gen.websiteId) throw badRequest('Nothing to revert');
    if (gen.revertedAt) throw badRequest('Already reverted');
    const rb = gen.rollback as { before?: WebsiteDefinition; definition?: WebsiteDefinition; changed?: { site: boolean; theme: boolean; pages: string[]; forms: string[]; redirects: boolean }; createdPages?: string[]; deletedPages?: string[] } | null;
    if (!rb) throw badRequest('This change has not been applied');
    const before = rb.before ?? rb.definition!;
    const res = await this.drafts.transform(
      gen.websiteId,
      (d) => {
        if (!rb.changed) {
          Object.assign(d, before); // whole-site generation: restore everything
          return;
        }
        if (rb.changed.site) Object.assign(d, { settings: before.settings, navigation: before.navigation, header: before.header, footer: before.footer, customCss: before.customCss });
        if (rb.changed.theme) d.theme = before.theme;
        if (rb.changed.redirects) d.redirects = before.redirects;
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
    );
    await this.db.aiGeneration.update({ where: { id }, data: { status: 'REVERTED', revertedAt: new Date() } });
    await this.audit.log({ organizationId: gen.organizationId, websiteId: gen.websiteId, actor: user, action: 'ai.changes_reverted', resourceType: 'aiGeneration', resourceId: id, summary: `${user.name} reverted an AI change` });
    return { revisions: res.revisions };
  }

  async rewrite(websiteId: string, body: { text: string; mode: RewriteMode; locale?: string; context?: string }) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    await this.assertQuota(site.organizationId);
    const llm = await this.llm(site.organizationId, websiteId);
    const { definition } = await this.drafts.load(websiteId);
    try {
      return { text: await rewriteText(llm, { ...body, voice: definition.settings.business.tagline }) };
    } finally {
      await recordUsage(this.db, site.organizationId, llm.usage).catch(() => undefined);
    }
  }

  async seo(websiteId: string, pageId: string) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    await this.assertQuota(site.organizationId);
    const llm = await this.llm(site.organizationId, websiteId);
    const { definition } = await this.drafts.load(websiteId);
    const page = definition.pages.find((p) => p.id === pageId);
    if (!page) throw notFound('Page');
    try {
      return await seoRecommendations(llm, definition, page);
    } finally {
      await recordUsage(this.db, site.organizationId, llm.usage).catch(() => undefined);
    }
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
