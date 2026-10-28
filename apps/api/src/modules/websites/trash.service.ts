import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@atrium/db';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ResolverService } from '../providers/resolver.service';
import { WebsitesService } from './websites.service';

/**
 * Deleted websites (soft-deleted: `deletedAt` set, slug renamed) can be listed, restored or purged.
 *
 * Purging is scoped to one organization and one website. Rows that reference the website through a
 * foreign key cascade with it; site-scoped rows without one are deleted explicitly. Media is shared by
 * checksum (an import reuses identical files already in the library), so a file the purged site owns but
 * another website or the organization still references is handed over instead of deleted; only files
 * nothing references are removed from storage, after the database transaction has committed.
 */
@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly websites: WebsitesService,
    private readonly orgs: OrganizationsService,
    private readonly resolver: ResolverService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private async deleted(orgId: string, id: string) {
    const site = await this.db.website.findFirst({ where: { id, organizationId: orgId, deletedAt: { not: null } } });
    if (!site) throw notFound('Deleted website');
    return site;
  }

  async list(orgId: string) {
    const sites = await this.db.website.findMany({ where: { organizationId: orgId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, select: { id: true, name: true, deletedAt: true, thumbnailUrl: true, _count: { select: { pages: true, submissions: true } } } });
    const media = await this.db.media.groupBy({ by: ['websiteId'], where: { organizationId: orgId, websiteId: { in: sites.map((s) => s.id) }, deletedAt: null }, _count: { _all: true }, _sum: { size: true } });
    const byId = new Map(media.map((m) => [m.websiteId, m]));
    return sites.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailUrl: s.thumbnailUrl,
      deletedAt: s.deletedAt!.toISOString(),
      pages: s._count.pages,
      submissions: s._count.submissions,
      media: byId.get(s.id)?._count._all ?? 0,
      mediaBytes: byId.get(s.id)?._sum.size ?? 0,
    }));
  }

  async restore(orgId: string, id: string, user: AuthUser) {
    const site = await this.deleted(orgId, id);
    await this.orgs.assertLimit(orgId, 'websites');
    // The slug was released on delete; take the name's slug again, or the next free one.
    const slug = await this.websites.uniqueSlug(site.name);
    await this.db.website.update({ where: { id }, data: { deletedAt: null, slug, status: site.publishedVersionId ? 'PUBLISHED' : 'DRAFT' } });
    await this.audit.log({ organizationId: orgId, websiteId: id, actor: user, action: 'website.restored', resourceType: 'website', resourceId: id, summary: `${user.name} restored website ${site.name}` });
    return { id, slug };
  }

  /** Media ids of the purged site → the website (or '' for the organization) that still references them. */
  private async referenced(orgId: string, id: string, media: Array<{ id: string; key: string }>) {
    if (!media.length) return new Map<string, string>();
    const others = (await this.db.website.findMany({ where: { organizationId: orgId, id: { not: id } }, select: { id: true } })).map((w) => w.id);
    const tokens = media.flatMap((m) => [{ media_id: m.id, token: m.key }, { media_id: m.id, token: m.id }]);
    const rows = await this.db.$queryRaw<Array<{ media_id: string; owner: string }>>(Prisma.sql`
      WITH content(owner, t) AS (
        SELECT website_id, document::text FROM pages WHERE website_id = ANY(${others}::text[])
        UNION ALL SELECT website_id, snapshot::text FROM website_versions WHERE website_id = ANY(${others}::text[])
        UNION ALL SELECT website_id, node::text FROM global_sections WHERE website_id = ANY(${others}::text[])
        UNION ALL SELECT website_id, concat_ws(' ', settings::text, navigation::text, header::text, footer::text, custom_css) FROM website_settings WHERE website_id = ANY(${others}::text[])
        UNION ALL SELECT website_id, tokens::text FROM themes WHERE website_id = ANY(${others}::text[])
        UNION ALL SELECT c.website_id, concat_ws(' ', i.data::text, i.translations::text) FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.website_id = ANY(${others}::text[])
        UNION ALL SELECT website_id, settings::text FROM forms WHERE website_id = ANY(${others}::text[])
        UNION ALL SELECT id, row_to_json(w)::text FROM websites w WHERE id = ANY(${others}::text[])
        UNION ALL SELECT '', row_to_json(o)::text FROM organizations o WHERE id = ${orgId}
      )
      SELECT DISTINCT ON (k.media_id) k.media_id, c.owner
      FROM jsonb_to_recordset(${JSON.stringify(tokens)}::jsonb) AS k(media_id text, token text)
      JOIN content c ON strpos(c.t, k.token) > 0
      ORDER BY k.media_id, (c.owner = '') ASC`);
    return new Map(rows.map((r) => [r.media_id, r.owner]));
  }

  async purge(orgId: string, id: string, user: AuthUser) {
    const site = await this.deleted(orgId, id);
    const media = await this.db.media.findMany({ where: { organizationId: orgId, websiteId: id }, select: { id: true, key: true, variants: true, storageProviderId: true } });
    const owners = await this.referenced(orgId, id, media);
    const drop = media.filter((m) => !owners.has(m.id));
    const scoped = { organizationId: orgId, websiteId: id };

    await this.db.$transaction(
      async (tx) => {
        for (const [mediaId, owner] of owners) await tx.media.update({ where: { id: mediaId }, data: { websiteId: owner || null, folderId: null } });
        await tx.media.deleteMany({ where: { id: { in: drop.map((m) => m.id) }, organizationId: orgId } });
        await tx.mediaFolder.deleteMany({ where: scoped });
        await tx.emailProvider.deleteMany({ where: scoped });
        await tx.smsProvider.deleteMany({ where: scoped });
        await tx.integration.deleteMany({ where: scoped });
        await tx.webhook.deleteMany({ where: scoped });
        await tx.aiGeneration.deleteMany({ where: scoped });
        await tx.$executeRaw`UPDATE organization_members SET website_ids = array_remove(website_ids, ${id}) WHERE organization_id = ${orgId} AND ${id} = ANY(website_ids)`;
        await tx.$executeRaw`UPDATE invitations SET website_ids = array_remove(website_ids, ${id}) WHERE organization_id = ${orgId} AND ${id} = ANY(website_ids)`;
        // Pages, versions, sections, settings, theme, collections, forms, submissions, domains,
        // deployments, redirects, preview tokens and analytics cascade with the website row.
        await tx.website.update({ where: { id }, data: { publishedVersionId: null } });
        await tx.website.delete({ where: { id } });
      },
      { timeout: 120_000 },
    );

    // Storage last, and only keys no remaining media row points to.
    const keysOf = (m: (typeof drop)[number]) => [m.key, ...(((m.variants as Array<{ key?: string }> | null) ?? []).map((v) => v.key).filter(Boolean) as string[])];
    const keys = drop.flatMap(keysOf);
    const stillUsed = new Set((await this.db.media.findMany({ where: { key: { in: keys } }, select: { key: true } })).map((m) => m.key));
    let removed = 0;
    for (const m of drop) {
      const storage = await this.resolver.resolver.storage({ organizationId: orgId, providerId: m.storageProviderId });
      for (const k of keysOf(m)) {
        if (stillUsed.has(k)) continue;
        await storage.delete(k).then(() => removed++, (err: Error) => this.logger.warn(`storage delete ${k}: ${err.message}`));
      }
    }

    await this.audit.log({ organizationId: orgId, websiteId: null, actor: user, action: 'website.purged', resourceType: 'website', resourceId: id, summary: `${user.name} permanently deleted website ${site.name}`, metadata: { mediaDeleted: drop.length, mediaKept: owners.size, filesRemoved: removed } });
    return { mediaDeleted: drop.length, mediaKept: owners.size, filesRemoved: removed };
  }
}
