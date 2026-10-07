import { Injectable, Logger } from '@nestjs/common';
import { AdminHostsService } from '../../common/admin-hosts';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { revalidateWebsites } from '../../common/renderer-revalidate';
import { ResolverService } from '../providers/resolver.service';

type StorageProvider = Awaited<ReturnType<ResolverService['resolver']['storage']>>;

/** Files removed at a time during cleanup. */
const CLEANUP_CONCURRENCY = 8;

/**
 * Permanent deletion of an organization by a super admin. Only a SUSPENDED organization can be
 * deleted (its sites are already offline and members locked out, so deletion is never the first,
 * accidental step), and `confirmSlug` must repeat its slug. Everything it owns goes with it in one
 * transaction (websites, versions, pages, forms and submissions, media records, domains, providers,
 * integrations, roles, members, invitations, analytics, its audit trail). User accounts stay: people
 * may belong to other organizations. Stored files (media and form attachments) are removed afterwards,
 * best effort, with storage clients resolved BEFORE the rows holding their credentials are gone.
 */
@Injectable()
export class OrganizationDeletionService {
  private readonly logger = new Logger(OrganizationDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly adminHosts: AdminHostsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async delete(id: string, confirmSlug: string) {
    const org = await this.db.organization.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, suspendedAt: true, _count: { select: { members: true, websites: true, media: true } } },
    });
    if (!org) throw notFound('Organization');
    if (!org.suspendedAt) throw conflict('Suspend the organization before deleting it.', { reason: 'NOT_SUSPENDED' });
    if (confirmSlug.trim() !== org.slug) throw badRequest('Type the organization’s slug to confirm', { field: 'confirmSlug' });

    const websiteIds = (await this.db.website.findMany({ where: { organizationId: id }, select: { id: true } })).map((w) => w.id);
    const files = await this.storedFiles(id);

    // Members and invitations first: they reference roles with ON DELETE RESTRICT, and roles go in the
    // organization's own cascade.
    await this.db.$transaction([
      this.db.invitation.deleteMany({ where: { organizationId: id } }),
      this.db.organizationMember.deleteMany({ where: { organizationId: id } }),
      this.db.organization.delete({ where: { id } }),
    ]);

    await this.adminHosts.refresh();
    await revalidateWebsites(websiteIds);
    void this.removeFiles(org.slug, files);
    return { name: org.name, slug: org.slug, members: org._count.members, websites: org._count.websites, mediaFiles: org._count.media, storedFiles: files.reduce((n, f) => n + f.keys.length, 0) };
  }

  /** Every stored object of the organization, grouped by the storage client that holds it. */
  private async storedFiles(organizationId: string): Promise<Array<{ storage: StorageProvider; keys: string[] }>> {
    const groups = new Map<string, string[]>();
    const add = (providerId: string | null, keys: string[]) => {
      const k = providerId ?? '';
      groups.set(k, [...(groups.get(k) ?? []), ...keys]);
    };
    const media = await this.db.media.findMany({ where: { organizationId }, select: { key: true, variants: true, storageProviderId: true } });
    for (const m of media) {
      const variants = ((m.variants as Array<{ key?: string }> | null) ?? []).map((v) => v.key).filter((k): k is string => !!k);
      add(m.storageProviderId, [m.key, ...variants]);
    }
    // Form attachments live in the organization's default storage, listed in the submission values.
    const values = await this.db.submissionValue.findMany({ where: { submission: { website: { organizationId } } }, select: { valueJson: true } });
    const attachments: string[] = [];
    for (const v of values) {
      if (!Array.isArray(v.valueJson)) continue;
      for (const item of v.valueJson as Array<{ key?: unknown }>) if (typeof item?.key === 'string' && item.key.startsWith('private/submissions/')) attachments.push(item.key);
    }
    add(null, attachments);

    const out: Array<{ storage: StorageProvider; keys: string[] }> = [];
    for (const [providerId, keys] of groups) {
      if (!keys.length) continue;
      try {
        out.push({ storage: await this.resolver.resolver.storage({ organizationId, providerId: providerId || null }), keys });
      } catch (err) {
        this.logger.warn(`organization ${organizationId}: storage ${providerId || 'default'} unavailable, ${keys.length} file(s) left in place: ${(err as Error).message}`);
      }
    }
    return out;
  }

  private async removeFiles(slug: string, groups: Array<{ storage: StorageProvider; keys: string[] }>) {
    let failed = 0;
    for (const { storage, keys } of groups) {
      for (let i = 0; i < keys.length; i += CLEANUP_CONCURRENCY) {
        const results = await Promise.allSettled(keys.slice(i, i + CLEANUP_CONCURRENCY).map((k) => storage.delete(k)));
        failed += results.filter((r) => r.status === 'rejected').length;
      }
    }
    if (failed) this.logger.warn(`deleted organization ${slug}: ${failed} stored file(s) could not be removed`);
  }
}
