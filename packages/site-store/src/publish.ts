import { SiteSnapshotSchema, type SiteSnapshot, type WebsiteDefinition } from '@atrium/schema';
import { collectImages } from '@atrium/builder-core';
import { createHash } from 'node:crypto';
import { loadDraft, toPublishedDefinition, type Db } from './draft';

export interface FreezeOptions {
  userId?: string | null;
  message?: string;
  apiBaseUrl?: string;
  primaryDomain?: string;
  runtime?: SiteSnapshot['runtime'];
}

/**
 * Freeze the current draft into an immutable WebsiteVersion and make it live.
 * Must run inside a transaction (takes the per-website advisory lock).
 */
export interface FrozenVersion {
  version: { id: string; number: number; createdAt: Date };
  snapshot: SiteSnapshot;
  published: WebsiteDefinition;
}

export async function freezeVersion(tx: Db, websiteId: string, opts: FreezeOptions = {}): Promise<FrozenVersion> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${websiteId}))`;
  const { definition } = await loadDraft(tx, websiteId);
  const published = toPublishedDefinition(definition);
  const checksum = createHash('sha256').update(JSON.stringify(published)).digest('hex');
  const last = await tx.websiteVersion.findFirst({ where: { websiteId }, orderBy: { number: 'desc' }, select: { number: true } });
  const number = (last?.number ?? 0) + 1;
  const v = await tx.websiteVersion.create({ data: { websiteId, number, snapshot: {}, checksum, message: opts.message, source: 'PUBLISH', createdById: opts.userId ?? null } });
  const snapshot: SiteSnapshot = SiteSnapshotSchema.parse({
    websiteId, versionId: v.id, version: number, publishedAt: v.createdAt.toISOString(), apiBaseUrl: opts.apiBaseUrl, primaryDomain: opts.primaryDomain, definition: published, runtime: opts.runtime ?? { captcha: {}, analytics: false },
  });
  await tx.websiteVersion.update({ where: { id: v.id }, data: { snapshot: JSON.parse(JSON.stringify(snapshot)) } });
  // Card thumbnail for the dashboard: the homepage's first image (sized down when it's an Unsplash-style URL).
  const home = published.pages.find((p) => p.isHomepage) ?? published.pages[0];
  const firstImage = home ? collectImages(home.sections).find((i) => /^https?:\/\//.test(i.src))?.src : undefined;
  const thumbnailUrl = firstImage ? (/[?&]w=\d+/.test(firstImage) ? firstImage.replace(/([?&])w=\d+/, '$1w=800') : firstImage) : undefined;
  await tx.website.update({ where: { id: websiteId }, data: { publishedVersionId: v.id, status: 'PUBLISHED', updatedById: opts.userId ?? undefined, ...(thumbnailUrl ? { thumbnailUrl } : {}) } });
  await tx.page.updateMany({ where: { websiteId, id: { in: published.pages.map((p) => p.id) }, status: { in: ['DRAFT', 'PUBLISHED', 'SCHEDULED'] } }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  return { version: { id: v.id, number: v.number, createdAt: v.createdAt }, snapshot, published };
}
