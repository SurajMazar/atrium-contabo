import { Injectable, Logger } from '@nestjs/common';
import { diffWebsites, validateWebsite, type BuildReport } from '@atrium/builder-core';
import { SiteSnapshotSchema, type SiteSnapshot, type WebsiteDefinition } from '@atrium/schema';
import { freezeVersion, toPublishedDefinition } from '@atrium/site-store';
import * as argon2 from 'argon2';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AccessContext, AuthUser } from '../../common/decorators';
import { ApiError, notFound, unauthorized } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { hashToken, randomToken } from '../../common/tokens';
import { DraftService } from '../websites/draft.service';
import { DeploymentsService } from '../deployments/deployments.service';
import { MediaService } from '../media/media.service';
import { SecretsService } from '../../common/secrets.service';
import { RedisService } from '../../common/redis.service';

const PREVIEW_MAX_FAILURES = 10;
const PREVIEW_FAIL_WINDOW_S = 15 * 60;

@Injectable()
export class PublishingService {
  private readonly logger = new Logger('Publishing');
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftService,
    private readonly queues: QueueService,
    private readonly audit: AuditService,
    private readonly deployments: DeploymentsService,
    private readonly secrets: SecretsService,
    private readonly redis: RedisService,
    private readonly media: MediaService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Public, non-secret runtime config: captcha site keys per form. */
  async runtimeFor(websiteId: string, organizationId: string, def: WebsiteDefinition): Promise<SiteSnapshot['runtime']> {
    const captcha: SiteSnapshot['runtime']['captcha'] = {};
    const analytics = !!(await this.db.organization.findUnique({ where: { id: organizationId }, select: { analyticsEnabled: true } }))?.analyticsEnabled;
    const forms = def.forms.filter((f) => f.settings.captcha.provider !== 'none');
    if (!forms.length) return { captcha, analytics };
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
    return { captcha, analytics };
  }

  /**
   * Responsive image variants for the media the definition references. Resolved when serving, not
   * frozen at publish: variants the worker finishes after a publish (or an import) are picked up.
   */
  mediaFor(organizationId: string, def: WebsiteDefinition): Promise<SiteSnapshot['media']> {
    return this.media.manifestFor(organizationId, def);
  }

  async primaryDomain(websiteId: string) {
    // Canonical URLs only ever point at domains the customer has proven they own.
    return (await this.db.domain.findFirst({ where: { websiteId, isPrimary: true, verifiedAt: { not: null }, status: 'active' } }))?.hostname;
  }

  /** Build a renderable snapshot from the draft (previews/exports) or a stored version. */
  async buildSnapshot(websiteId: string, opts: { preview: boolean; fromDraft: boolean; versionId?: string }): Promise<SiteSnapshot> {
    const site = await this.db.website.findFirst({ where: { id: websiteId, deletedAt: null } });
    if (!site) throw notFound('Website');
    if (!opts.fromDraft) {
      const versionId = opts.versionId ?? site.publishedVersionId;
      if (!versionId) throw notFound('Published version');
      const v = await this.db.websiteVersion.findUniqueOrThrow({ where: { id: versionId } });
      const snapshot = v.snapshot as unknown as SiteSnapshot;
      return { ...snapshot, media: await this.mediaFor(site.organizationId, snapshot.definition) };
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
      media: await this.mediaFor(site.organizationId, def),
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
    const runtime = await this.runtimeFor(websiteId, site.organizationId, toPublishedDefinition(definition));
    const primaryDomain = await this.primaryDomain(websiteId);
    const { version, published } = await this.db.$transaction(
      (tx) => freezeVersion(tx, websiteId, { userId: user?.id ?? null, message: body.message, apiBaseUrl: `${env().API_URL.replace(/\/$/, '')}/v1`, primaryDomain, runtime }),
      { timeout: 30_000 },
    );

    await this.revalidate(websiteId);
    if (site.deploymentMode === 'INDEPENDENT' && site.deploymentIntegrationId) {
      await this.deployments.create(websiteId, { target: 'production', versionId: version.id }, user).catch((err) => this.logger.warn(`auto-deploy failed: ${(err as Error).message}`));
    }
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'site.published', resourceType: 'website', resourceId: websiteId, summary: `${user?.name ?? 'Scheduler'} published version ${version.number}`, metadata: { versionId: version.id, message: body.message } });
    await this.queues.emit(site.organizationId, websiteId, 'website.published', { websiteId, versionId: version.id, version: version.number, pages: published.pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug })) });
    return { version: { id: version.id, number: version.number }, report };
  }

  /** Tell renderers to drop cached pages for this site. Best effort. */
  async revalidate(websiteId: string, extraHostnames: string[] = []) {
    try {
      const hostnames = (await this.db.domain.findMany({ where: { websiteId }, select: { hostname: true } })).map((d) => d.hostname);
      const hosts = [...new Set([...hostnames, ...extraHostnames])].map((h) => `host:${h}`);
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

  async restore(websiteId: string, versionId: string, user: AuthUser, access: AccessContext) {
    const v = await this.version(websiteId, versionId);
    const snap = v.snapshot as unknown as SiteSnapshot;
    await this.drafts.transform(
      websiteId,
      (d) => {
        const keep = { ...snap.definition };
        Object.assign(d, keep, { pages: keep.pages.map((p) => ({ ...p, status: 'draft' as const })) });
      },
      { userId: user.id, versionSource: 'RESTORE', versionMessage: `Before restoring site version ${v.number}` },
      { access },
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
    const row = await this.db.previewToken.create({ data: { websiteId, tokenHash: hashToken(token), tokenEnc: this.secrets.encrypt(token), passwordHash: body.password ? await argon2.hash(body.password) : null, label: body.label, expiresAt, createdById: user.id } });
    return { id: row.id, url: this.previewUrl(token), token, label: row.label, expiresAt: expiresAt.toISOString(), hasPassword: !!body.password };
  }

  async previewTokens(websiteId: string) {
    const rows = await this.db.previewToken.findMany({ where: { websiteId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, url: r.tokenEnc ? this.previewUrl(this.secrets.decrypt<string>(r.tokenEnc)) : '', label: r.label, expiresAt: r.expiresAt.toISOString(), hasPassword: !!r.passwordHash }));
  }

  async revokePreviewToken(websiteId: string, id: string) {
    await this.db.previewToken.updateMany({ where: { id, websiteId }, data: { revokedAt: new Date() } });
  }

  /** Resolve a preview token for the renderer (draft content, never cached). */
  /**
   * Draft snapshot for a preview link. Password-protected links are guarded against guessing:
   * failures are counted per link (10 per 15 minutes, then locked), and a correct password is
   * remembered briefly so every page render does not re-run argon2 (which would also make the
   * endpoint a cheap CPU/memory lever).
   */
  async resolvePreview(token: string, password?: string) {
    const tokenHash = hashToken(token);
    const row = await this.db.previewToken.findUnique({ where: { tokenHash } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw notFound('Preview');
    if (row.passwordHash) {
      if (!password) throw unauthorized('PASSWORD_REQUIRED');
      const redis = this.redis.client;
      const failKey = `preview:fail:${tokenHash}`;
      const okKey = `preview:ok:${tokenHash}:${hashToken(`${row.passwordHash}:${password}`)}`;
      const known = await redis.get(okKey).catch(() => null);
      if (!known) {
        const fails = Number(await redis.get(failKey).catch(() => 0)) || 0;
        if (fails >= PREVIEW_MAX_FAILURES) throw new ApiError(429, 'RATE_LIMITED', 'Too many wrong passwords for this preview. Try again in 15 minutes.');
        if (!(await argon2.verify(row.passwordHash, password).catch(() => false))) {
          const n = await redis.incr(failKey).catch(() => 0);
          if (n === 1) await redis.expire(failKey, PREVIEW_FAIL_WINDOW_S).catch(() => undefined);
          throw unauthorized('PASSWORD_REQUIRED');
        }
        await redis.set(okKey, '1', 'EX', 600).catch(() => undefined);
      }
    }
    return this.buildSnapshot(row.websiteId, { preview: true, fromDraft: true });
  }
}
