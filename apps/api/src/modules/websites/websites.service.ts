import { Injectable } from '@nestjs/common';
import { analyzePageSeo, normalizeWebsite } from '@atrium/builder-core';
import { slugify, type Node, type SiteSettings, type ThemeTokens, type WebsiteDefinition, type WebsiteInput } from '@atrium/schema';
import { createWebsiteFromDefinition, loadDraft } from '@atrium/site-store';
import { env, platformUrl } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AccessContext, AuthUser } from '../../common/decorators';
import { badRequest, conflict, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { blankWebsite } from './blank';
import { DraftService } from './draft.service';

// Platform hostnames can share the sites root (admin.<root>, api.<root>, media.<root>), so a site may never take them.
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'app', 'preview', 'static', 'assets', 'cdn', 'mail', 'status', 'docs', 'media', 'sites', 's3', 'smtp', 'auth', 'login']);

export type WebsiteSource = { type: 'blank'; presetKey?: string } | { type: 'template'; templateKey: string } | { type: 'import'; definition: unknown };

@Injectable()
export class WebsitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftService,
    private readonly orgs: OrganizationsService,
    private readonly templates: TemplatesService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  dto(w: { id: string; organizationId: string; name: string; slug: string; status: string; deploymentMode: string; deploymentProvider: string | null; deploymentIntegrationId: string | null; publishedVersionId: string | null; thumbnailUrl: string | null; createdAt: Date; updatedAt: Date; domains?: Array<{ hostname: string; isPrimary: boolean }>; publishedVersion?: { createdAt: Date } | null }) {
    const primary = w.domains?.find((d) => d.isPrimary)?.hostname ?? null;
    return {
      id: w.id, organizationId: w.organizationId, name: w.name, slug: w.slug, status: w.status, deploymentMode: w.deploymentMode,
      deploymentProvider: w.deploymentProvider, deploymentIntegrationId: w.deploymentIntegrationId, publishedVersionId: w.publishedVersionId,
      primaryDomain: primary, platformUrl: platformUrl(w.slug), publishedAt: w.publishedVersion?.createdAt.toISOString() ?? null,
      thumbnailUrl: w.thumbnailUrl, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString(),
    };
  }

  async list(orgId: string, user: AuthUser) {
    const m = await this.db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: user.id } } });
    const rows = await this.db.website.findMany({
      where: { organizationId: orgId, deletedAt: null, ...(m?.websiteIds.length ? { id: { in: m.websiteIds } } : {}) },
      include: { domains: { select: { hostname: true, isPrimary: true } }, publishedVersion: { select: { createdAt: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((w) => this.dto(w));
  }

  async get(id: string, permissions: Set<string>) {
    const w = await this.db.website.findFirst({ where: { id, deletedAt: null }, include: { domains: { select: { hostname: true, isPrimary: true } }, publishedVersion: { select: { createdAt: true } } } });
    if (!w) throw notFound('Website');
    return { ...this.dto(w), permissions: [...permissions] };
  }

  async uniqueSlug(desired: string, exceptId?: string) {
    const base = slugify(desired).slice(0, 48) || 'site';
    let slug = RESERVED_SLUGS.has(base) ? `${base}-site` : base;
    for (let i = 2; ; i++) {
      const hit = await this.db.website.findUnique({ where: { slug } });
      if (!hit || hit.id === exceptId) return slug;
      slug = `${base}-${i}`;
    }
  }

  /** Normalize any website input and create it. Shared by blank/template/import/AI/clone. */
  async createFromInput(orgId: string, name: string, input: WebsiteInput, user: AuthUser | null, opts: { slug?: string; presetKey?: string } = {}) {
    await this.orgs.assertLimit(orgId, 'websites');
    let normalized: WebsiteDefinition;
    try {
      const res = normalizeWebsite(input, this.drafts.registry);
      const errors = res.issues.filter((i) => i.severity === 'error');
      if (errors.length > 20) throw validation('The website definition has too many invalid components', errors.slice(0, 20));
      normalized = res.value;
    } catch (err) {
      if ((err as { name?: string }).name === 'ZodError') throw validation('Invalid website definition', (err as { issues?: unknown }).issues);
      throw err;
    }
    const slug = await this.uniqueSlug(opts.slug ?? name);
    const workspace = await this.db.workspace.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } });
    const website = await this.db.$transaction((tx) => createWebsiteFromDefinition(tx, { organizationId: orgId, workspaceId: workspace?.id, name, slug, definition: normalized, userId: user?.id ?? null, presetKey: opts.presetKey }), { timeout: 60_000 });
    await this.audit.log({ organizationId: orgId, websiteId: website.id, actor: user, action: 'website.created', resourceType: 'website', resourceId: website.id, summary: `${user?.name ?? 'System'} created website ${name}` });
    return website;
  }

  async create(orgId: string, body: { name: string; slug?: string; source: WebsiteSource }, user: AuthUser) {
    let input: WebsiteInput;
    if (body.source.type === 'blank') input = blankWebsite(body.name, body.source.presetKey);
    else if (body.source.type === 'template') input = await this.templates.siteInput(body.source.templateKey, { businessName: body.name }, orgId);
    else input = this.templates.parseImport(body.source.definition);
    const w = await this.createFromInput(orgId, body.name, input, user, { slug: body.slug, presetKey: body.source.type === 'blank' ? body.source.presetKey : undefined });
    return this.get(w.id, new Set());
  }

  async update(id: string, body: { name?: string; slug?: string; deploymentMode?: 'PLATFORM' | 'INDEPENDENT'; deploymentIntegrationId?: string | null }, user: AuthUser, access: AccessContext) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id } });
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.slug && body.slug !== site.slug) {
      const clean = slugify(body.slug);
      if (!clean || RESERVED_SLUGS.has(clean)) throw badRequest('This subdomain is not available');
      if (await this.db.website.findFirst({ where: { slug: clean, id: { not: id } } })) throw conflict('This subdomain is taken');
      data.slug = clean;
    }
    if (body.deploymentMode) data.deploymentMode = body.deploymentMode;
    if (body.deploymentIntegrationId !== undefined) {
      if (body.deploymentIntegrationId) {
        const integ = await this.db.integration.findFirst({ where: { id: body.deploymentIntegrationId, organizationId: site.organizationId, kind: 'DEPLOYMENT' } });
        if (!integ) throw badRequest('Deployment integration not found');
        data.deploymentProvider = integ.driver;
      } else data.deploymentProvider = null;
      data.deploymentIntegrationId = body.deploymentIntegrationId;
    }
    await this.db.website.update({ where: { id }, data: { ...data, updatedById: user.id } });
    if (body.name) await this.drafts.transform(id, (d) => void (d.settings.name = body.name!), { userId: user.id }, { access });
    await this.audit.log({ organizationId: site.organizationId, websiteId: id, actor: user, action: 'website.updated', resourceType: 'website', resourceId: id, summary: `${user.name} updated website settings`, metadata: { fields: Object.keys(data) } });
    return this.get(id, new Set());
  }

  async hostnames(id: string) {
    return (await this.db.domain.findMany({ where: { websiteId: id }, select: { hostname: true } })).map((d) => d.hostname);
  }

  async remove(id: string, user: AuthUser) {
    const site = await this.db.website.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `deleted-${id}` } });
    await this.db.domain.deleteMany({ where: { websiteId: id } });
    await this.audit.log({ organizationId: site.organizationId, websiteId: id, actor: user, action: 'website.deleted', resourceType: 'website', resourceId: id, summary: `${user.name} deleted website ${site.name}` });
  }

  async saveSite(id: string, body: { settings?: SiteSettings; navigation?: WebsiteDefinition['navigation']; header?: Node; footer?: Node; customCss?: string; revision: number }, user: AuthUser, access: AccessContext) {
    await this.assertSiteRevision(id, body.revision);
    const res = await this.drafts.transform(
      id,
      (d) => {
        if (body.settings) d.settings = body.settings;
        if (body.navigation) d.navigation = body.navigation;
        if (body.header) d.header = this.drafts.registry.normalize(body.header).node;
        if (body.footer) d.footer = this.drafts.registry.normalize(body.footer).node;
        if (body.customCss !== undefined) d.customCss = body.customCss;
      },
      { userId: user.id },
      { access },
    );
    return { revision: res.revisions.site };
  }

  async assertSiteRevision(id: string, revision: number) {
    const s = await this.db.websiteSettings.findUniqueOrThrow({ where: { websiteId: id }, select: { revision: true } });
    DraftService.assertRevision(s.revision, revision, 'Site settings');
  }

  async saveTheme(id: string, body: { tokens: ThemeTokens; presetKey?: string; revision: number }, user: AuthUser, access: AccessContext) {
    const t = await this.db.theme.findUniqueOrThrow({ where: { websiteId: id }, select: { revision: true } });
    DraftService.assertRevision(t.revision, body.revision, 'Theme');
    const res = await this.drafts.transform(id, (d) => void (d.theme = body.tokens), { userId: user.id }, { access });
    if (body.presetKey !== undefined) await this.db.theme.update({ where: { websiteId: id }, data: { presetKey: body.presetKey } });
    return { revision: res.revisions.theme };
  }

  async dashboard(id: string) {
    const db = this.db;
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [site, lastDeployment, deployments, newSubs, subs7d, daily, events7d, conversions7d, storage, recent, ai, draft] = await Promise.all([
      db.website.findUniqueOrThrow({ where: { id }, include: { domains: true, publishedVersion: { select: { createdAt: true } } } }),
      db.deployment.findFirst({ where: { websiteId: id }, orderBy: { createdAt: 'desc' } }),
      db.deployment.findMany({ where: { websiteId: id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      db.formSubmission.count({ where: { websiteId: id, status: 'NEW', read: false } }),
      db.formSubmission.count({ where: { websiteId: id, createdAt: { gte: since }, status: { not: 'SPAM' } } }),
      db.analyticsDaily.findMany({ where: { websiteId: id, date: { gte: since } }, orderBy: { date: 'asc' } }),
      db.analyticsEvent.groupBy({ by: ['type'], where: { websiteId: id, createdAt: { gte: since } }, _count: true }),
      db.analyticsEvent.count({ where: { websiteId: id, type: 'conversion', createdAt: { gte: since } } }),
      db.media.aggregate({ where: { websiteId: id, deletedAt: null }, _sum: { size: true } }),
      db.auditLog.findMany({ where: { websiteId: id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      db.aiGeneration.findMany({ where: { websiteId: id }, orderBy: { createdAt: 'desc' }, take: 5, include: {} }),
      loadDraft(db, id).catch(() => null),
    ]);
    const pv = daily.length ? daily.reduce((a, d) => a + d.pageviews, 0) : (events7d.find((e) => e.type === 'pageview')?._count ?? 0);
    // Fall back to raw events until the hourly rollup has produced daily aggregates.
    const visitors = daily.length ? daily.reduce((a, d) => a + d.visitors, 0) : (await db.analyticsEvent.findMany({ where: { websiteId: id, type: 'pageview', createdAt: { gte: since } }, distinct: ['visitorHash'], select: { visitorHash: true } })).length;
    let seoScore: number | null = null;
    if (draft) {
      const scores = draft.definition.pages.filter((p) => p.status !== 'archived').map((p) => analyzePageSeo(p, draft.definition).score);
      seoScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    }
    const primary = site.domains.find((d) => d.isPrimary);
    const lastEdit = recent[0];
    return {
      status: site.status,
      productionUrl: site.publishedVersionId ? (primary ? `https://${primary.hostname}` : platformUrl(site.slug)) : null,
      primaryDomain: primary?.hostname ?? null,
      lastDeployment: lastDeployment ? deploymentDto(lastDeployment) : null,
      lastEditor: lastEdit ? { name: lastEdit.actorName ?? 'System', at: lastEdit.createdAt.toISOString() } : null,
      traffic: { pageviews7d: pv, visitors7d: visitors, series: daily.map((d) => ({ date: d.date.toISOString().slice(0, 10), pageviews: d.pageviews, visitors: d.visitors })) },
      submissions: { new: newSubs, total7d: subs7d },
      conversionRate: visitors ? Math.round((conversions7d / visitors) * 1000) / 10 : 0,
      seoScore,
      storageMb: Math.round(((storage._sum.size ?? 0) / 1_048_576) * 10) / 10,
      recentEdits: recent.map(activityDto),
      deployments: deployments.map((d) => deploymentDto(d)),
      aiGenerations: ai.map((g) => ({ id: g.id, kind: g.kind, prompt: g.prompt, provider: g.provider, model: g.model, status: g.status, inputTokens: g.inputTokens, outputTokens: g.outputTokens, costUsd: Number(g.costUsd), createdAt: g.createdAt.toISOString() })),
    };
  }

  async activity(id: string, cursor?: string) {
    const rows = await this.db.auditLog.findMany({ where: { websiteId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const items = rows.slice(0, 50).map(activityDto);
    return { items, nextCursor: rows.length > 50 ? items[items.length - 1]!.id : null };
  }

  async clone(id: string, body: { name: string; include: { pages?: boolean; theme?: boolean; forms?: boolean; collections?: boolean; media?: boolean } }, user: AuthUser) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id } });
    const { definition } = await this.drafts.load(id);
    const inc = { pages: true, theme: true, forms: true, collections: true, ...body.include };
    const blank = blankWebsite(body.name);
    // Credentials, submissions, domains and deployments are never cloned.
    const input: WebsiteInput = {
      ...definition,
      settings: { ...definition.settings, name: body.name },
      theme: inc.theme ? definition.theme : (blank.theme as ThemeTokens),
      pages: inc.pages ? definition.pages.map((p) => ({ ...p, id: undefined, status: 'draft' as const })) : (blank.pages as WebsiteInput['pages']),
      forms: inc.forms ? definition.forms.map((f) => ({ ...f, id: undefined })) : [],
      collections: inc.collections ? definition.collections.map((c) => ({ ...c, id: undefined, items: c.items.map((i) => ({ ...i, id: '' })) })) : [],
      globalSections: definition.globalSections.map((g) => ({ ...g, id: undefined })),
      redirects: definition.redirects.map((r) => ({ ...r, id: undefined })),
    } as WebsiteInput;
    const created = await this.createFromInput(site.organizationId, body.name, input, user);
    await this.audit.log({ organizationId: site.organizationId, websiteId: created.id, actor: user, action: 'website.cloned', resourceType: 'website', resourceId: created.id, summary: `${user.name} cloned ${site.name} into ${body.name}`, metadata: { from: id, include: inc } });
    return this.get(created.id, new Set());
  }
}

export function deploymentDto(d: { id: string; provider: string; target: string; status: string; url: string | null; inspectorUrl: string | null; error: string | null; versionId: string | null; externalId: string | null; createdAt: Date; startedAt: Date | null; finishedAt: Date | null; logs?: unknown }, withLogs = false) {
  return {
    id: d.id, provider: d.provider, target: d.target, status: d.status, url: d.url, inspectorUrl: d.inspectorUrl, error: d.error, versionId: d.versionId,
    externalId: d.externalId, createdAt: d.createdAt.toISOString(), startedAt: d.startedAt?.toISOString() ?? null, finishedAt: d.finishedAt?.toISOString() ?? null,
    ...(withLogs ? { logs: d.logs ?? [] } : {}),
  };
}

export function activityDto(a: { id: string; action: string; summary: string | null; actorType: string; actorName: string | null; resourceType: string; resourceId: string | null; createdAt: Date; metadata?: unknown }) {
  return { id: a.id, action: a.action, summary: a.summary, actorType: a.actorType, actorName: a.actorName, resourceType: a.resourceType, resourceId: a.resourceId, createdAt: a.createdAt.toISOString(), metadata: a.metadata };
}

export const apiPublicBase = () => `${env().API_URL.replace(/\/$/, '')}/v1`;
