import { Injectable, Logger } from '@nestjs/common';
import { diffWebsites, validateWebsite, type BuildReport } from '@atrium/builder-core';
import { SiteSnapshotSchema, type SiteSnapshot, type WebsiteDefinition } from '@atrium/schema';
import { toPublishedDefinition } from '@atrium/site-store';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { ApiError, notFound, unauthorized } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { hashToken, randomToken } from '../../common/tokens';
import { DraftService } from '../websites/draft.service';
import { DeploymentsService } from '../deployments/deployments.service';

@Injectable()
export class PublishingService {
  private readonly logger = new Logger('Publishing');
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
    private readonly deployments: DeploymentsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Public, non-secret runtime config: captcha site keys per form. */
  async runtimeFor(websiteId: string, organizationId: string, def: WebsiteDefinition): Promise<SiteSnapshot['runtime']> {
    const captcha: SiteSnapshot['runtime']['captcha'] = {};
    const forms = def.forms.filter((f) => f.settings.captcha.provider !== 'none');
    if (!forms.length) return { captcha };
    const integrations = await this.db.integration.findMany({ where: { organizationId, kind: 'CAPTCHA', enabled: true, OR: [{ websiteId }, { websiteId: null }] } });
    for (const f of forms) {
      const c = f.settings.captcha;
      const pick =
        integrations.find((i) => i.id === c.integrationId) ??
        integrations.find((i) => i.driver === c.provider && i.websiteId === websiteId && i.isDefault) ??
        integrations.find((i) => i.driver === c.provider && i.websiteId === websiteId) ??
        integrations.find((i) => i.driver === c.provider && i.isDefault) ??
        integrations.find((i) => i.driver === c.provider);
      const siteKey = (pick?.config as { siteKey?: string } | null)?.siteKey;
      if (siteKey) captcha[f.id] = { provider: c.provider, siteKey };
    }
    return { captcha };
  }

  async primaryDomain(websiteId: string) {
    return (await this.db.domain.findFirst({ where: { websiteId, isPrimary: true } }))?.hostname;
  }

  /** Build a renderable snapshot from the draft (previews/exports) or a stored version. */
  async buildSnapshot(websiteId: string, opts: { preview: boolean; fromDraft: boolean; versionId?: string }): Promise<SiteSnapshot> {
    const site = await this.db.website.findFirst({ where: { id: websiteId, deletedAt: null } });
    if (!site) throw notFound('Website');
    if (!opts.fromDraft) {
      const versionId = opts.versionId ?? site.publishedVersionId;
      if (!versionId) throw notFound('Published version');
      const v = await this.db.websiteVersion.findUniqueOrThrow({ where: { id: versionId } });
      return v.snapshot as unknown as SiteSnapshot;
    }
    const { definition } = await this.drafts.load(websiteId);
    const def = opts.preview ? { ...definition, pages: definition.pages.filter((p) => p.status !== 'archived') } : toPublishedDefinition(definition);
    return SiteSnapshotSchema.parse({
      websiteId,
      versionId: 'draft',
      version: 0,
      publishedAt: new Date().toISOString(),
      apiBaseUrl: `${env().API_URL.replace(/\/$/, '')}/v1`,
      primaryDomain: await this.primaryDomain(websiteId),
      definition: def,
      runtime: await this.runtimeFor(websiteId, site.organizationId, def),
    });
  }

  async validate(websiteId: string): Promise<BuildReport> {
    const { definition } = await this.drafts.load(websiteId);
    const domains = await this.db.domain.findMany({ where: { websiteId } });
    const defaultRecipients = await this.formsWithDefaultRecipients(websiteId);
    return validateWebsite(toPublishedDefinition(definition), this.drafts.registry, {
      domains: domains.map((d) => ({ hostname: d.hostname, verified: d.status === 'active' || !!d.verifiedAt, isPrimary: d.isPrimary })),
      formsWithDefaultRecipients: defaultRecipients,
    });
  }

  /** Forms whose website/org has a default email provider are considered notifiable via fallback. */
  private async formsWithDefaultRecipients(_websiteId: string): Promise<string[]> {
    return [];
  }

  async publish(websiteId: string, body: { message?: string }, user: AuthUser | null) {
    const report = await this.validate(websiteId);
    if (!report.ok) throw new ApiError(422, 'VALIDATION', 'Fix the blocking issues before publishing', report);
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    const { definition } = await this.drafts.load(websiteId);
    const published = toPublishedDefinition(definition);
    const runtime = await this.runtimeFor(websiteId, site.organizationId, published);
    const checksum = createHash('sha256').update(JSON.stringify(published)).digest('hex');

    const version = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${websiteId}))`;
      const last = await tx.websiteVersion.findFirst({ where: { websiteId }, orderBy: { number: 'desc' }, select: { number: true } });
      const number = (last?.number ?? 0) + 1;
      const v = await tx.websiteVersion.create({ data: { websiteId, number, snapshot: {}, checksum, message: body.message, source: 'PUBLISH', createdById: user?.id ?? null } });
      const snapshot: SiteSnapshot = SiteSnapshotSchema.parse({
        websiteId, versionId: v.id, version: number, publishedAt: v.createdAt.toISOString(),
        apiBaseUrl: `${env().API_URL.replace(/\/$/, '')}/v1`, primaryDomain: await this.primaryDomain(websiteId), definition: published, runtime,
      });
      await tx.websiteVersion.update({ where: { id: v.id }, data: { snapshot: JSON.parse(JSON.stringify(snapshot)) } });
      await tx.website.update({ where: { id: websiteId }, data: { publishedVersionId: v.id, status: 'PUBLISHED', updatedById: user?.id } });
      const now = new Date();
      const publishedIds = published.pages.map((p) => p.id);
      await tx.page.updateMany({ where: { websiteId, id: { in: publishedIds }, status: { in: ['DRAFT', 'PUBLISHED', 'SCHEDULED'] } }, data: { status: 'PUBLISHED', publishedAt: now } });
      return v;
    });

    await this.revalidate(websiteId);
    if (site.deploymentMode === 'INDEPENDENT' && site.deploymentIntegrationId) {
      await this.deployments.create(websiteId, { target: 'production', versionId: version.id }, user).catch((err) => this.logger.warn(`auto-deploy failed: ${(err as Error).message}`));
    }
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'site.published', resourceType: 'website', resourceId: websiteId, summary: `${user?.name ?? 'Scheduler'} published version ${version.number}`, metadata: { versionId: version.id, message: body.message } });
    await this.queues.emit(site.organizationId, websiteId, 'website.published', { websiteId, versionId: version.id, version: version.number, pages: published.pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug })) });
    return { version: { id: version.id, number: version.number }, report };
  }

  /** Tell renderers to drop cached pages for this site. Best effort. */
  async revalidate(websiteId: string) {
    try {
      const hosts = (await this.db.domain.findMany({ where: { websiteId }, select: { hostname: true } })).map((d) => `host:${d.hostname}`);
      const res = await fetch(`${env().RENDERER_URL.replace(/\/$/, '')}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Renderer-Secret': env().RENDERER_SECRET },
        body: JSON.stringify({ tags: [`site:${websiteId}`, ...hosts] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.logger.warn(`renderer revalidate returned ${res.status}`);
    } catch (err) {
      this.logger.warn(`renderer revalidate failed: ${(err as Error).message}`);
    }
  }

  async versions(websiteId: string) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId }, select: { publishedVersionId: true } });
    const rows = await this.db.websiteVersion.findMany({ where: { websiteId }, orderBy: { number: 'desc' }, take: 200, select: { id: true, number: true, message: true, source: true, createdAt: true, createdById: true } });
    const users = new Map((await this.db.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map((v) => ({ id: v.id, number: v.number, message: v.message, source: v.source, createdAt: v.createdAt.toISOString(), createdBy: v.createdById ? (users.get(v.createdById) ?? null) : null, isPublished: v.id === site.publishedVersionId }));
  }

  async version(websiteId: string, versionId: string) {
    const v = await this.db.websiteVersion.findFirst({ where: { id: versionId, websiteId } });
    if (!v) throw notFound('Version');
    return { id: v.id, number: v.number, message: v.message, source: v.source, createdAt: v.createdAt.toISOString(), snapshot: v.snapshot };
  }

  async compare(websiteId: string, from: string, to: string) {
    const load = async (id: string): Promise<WebsiteDefinition> => (id === 'draft' ? (await this.drafts.load(websiteId)).definition : ((await this.version(websiteId, id)).snapshot as unknown as SiteSnapshot).definition);
    return diffWebsites(await load(from), await load(to));
  }

  async restore(websiteId: string, versionId: string, user: AuthUser) {
    const v = await this.version(websiteId, versionId);
    const snap = v.snapshot as unknown as SiteSnapshot;
    await this.drafts.transform(
      websiteId,
      (d) => {
        const keep = { ...snap.definition };
        Object.assign(d, keep, { pages: keep.pages.map((p) => ({ ...p, status: 'draft' as const })) });
      },
      { userId: user.id, versionSource: 'RESTORE', versionMessage: `Before restoring site version ${v.number}` },
    );
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'site.version_restored', resourceType: 'website', resourceId: websiteId, summary: `${user.name} restored the draft to version ${v.number}` });
  }

  /** Rollback: re-publish an earlier immutable snapshot as a new version. */
  async republish(websiteId: string, versionId: string, user: AuthUser) {
    const old = await this.db.websiteVersion.findFirst({ where: { id: versionId, websiteId } });
    if (!old) throw notFound('Version');
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    const v = await this.db.$transaction(async (tx) => {
      const last = await tx.websiteVersion.findFirst({ where: { websiteId }, orderBy: { number: 'desc' }, select: { number: true } });
      const number = (last?.number ?? 0) + 1;
      const created = await tx.websiteVersion.create({ data: { websiteId, number, snapshot: {}, checksum: old.checksum, message: `Rollback to v${old.number}`, source: 'RESTORE', createdById: user.id } });
      const snap = { ...(old.snapshot as object), versionId: created.id, version: number, publishedAt: created.createdAt.toISOString() };
      await tx.websiteVersion.update({ where: { id: created.id }, data: { snapshot: snap } });
      await tx.website.update({ where: { id: websiteId }, data: { publishedVersionId: created.id, status: 'PUBLISHED' } });
      return created;
    });
    await this.revalidate(websiteId);
    if (site.deploymentMode === 'INDEPENDENT' && site.deploymentIntegrationId) await this.deployments.create(websiteId, { target: 'production', versionId: v.id }, user).catch(() => undefined);
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'site.rolled_back', resourceType: 'website', resourceId: websiteId, summary: `${user.name} rolled back to version ${old.number}` });
    return { version: { id: v.id, number: v.number } };
  }

  // ── preview tokens ──
  previewUrl(token: string) {
    return `${env().PREVIEW_URL.replace(/\/$/, '')}/_preview/${token}`;
  }

  async createPreviewToken(websiteId: string, body: { expiresInHours?: number; password?: string; label?: string }, user: AuthUser) {
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + (body.expiresInHours ?? 72) * 3_600_000);
    const row = await this.db.previewToken.create({ data: { websiteId, tokenHash: hashToken(token), passwordHash: body.password ? await argon2.hash(body.password) : null, label: body.label, expiresAt, createdById: user.id } });
    return { id: row.id, url: this.previewUrl(token), token, label: row.label, expiresAt: expiresAt.toISOString(), hasPassword: !!body.password };
  }

  async previewTokens(websiteId: string) {
    const rows = await this.db.previewToken.findMany({ where: { websiteId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, url: '', label: r.label, expiresAt: r.expiresAt.toISOString(), hasPassword: !!r.passwordHash }));
  }

  async revokePreviewToken(websiteId: string, id: string) {
    await this.db.previewToken.updateMany({ where: { id, websiteId }, data: { revokedAt: new Date() } });
  }

  /** Resolve a preview token for the renderer (draft content, never cached). */
  async resolvePreview(token: string, password?: string) {
    const row = await this.db.previewToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw notFound('Preview');
    if (row.passwordHash && !(password && (await argon2.verify(row.passwordHash, password)))) throw unauthorized('PASSWORD_REQUIRED');
    return this.buildSnapshot(row.websiteId, { preview: true, fromDraft: true });
  }
}
