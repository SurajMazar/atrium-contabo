import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SiteSnapshotSchema, WebsiteDefinitionSchema, type SiteSnapshot } from '@atrium/schema';
import { cache } from 'react';
import { API_V1, PLATFORM_SITES_DOMAIN, RENDERER_SECRET, SNAPSHOT_REVALIDATE } from './env';

export type SnapshotResult =
  | { status: 'ok'; snapshot: SiteSnapshot }
  | { status: 'not-found' }
  | { status: 'password-required'; invalid?: boolean }
  | { status: 'error'; message: string };

/** Host tags we have seen per website id, so `site:<id>` revalidation can also clear host-tagged fetches. */
const hostsBySite = new Map<string, Set<string>>();
export function hostTagsForSite(websiteId: string): string[] {
  return [...(hostsBySite.get(websiteId) ?? [])].map((h) => hostTag(h));
}
export const hostTag = (host: string) => `host:${host}`;
export const siteTag = (websiteId: string) => `site:${websiteId}`;
/** Every snapshot fetch carries this tag (last-resort revalidation). */
export const ALL_SITES_TAG = 'atrium:sites';

export function normalizeHost(raw: string | null | undefined): string {
  return decodeURIComponent(raw ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/:(80|443)$/, '');
}

function coerceSnapshot(json: unknown): SiteSnapshot {
  const obj = json as Record<string, unknown>;
  if (obj && typeof obj === 'object' && 'definition' in obj) return SiteSnapshotSchema.parse(obj);
  // A bare WebsiteDefinition is accepted for convenience (local dev / tests).
  const definition = WebsiteDefinitionSchema.parse(obj);
  return SiteSnapshotSchema.parse({ websiteId: 'local', versionId: 'local', version: 1, publishedAt: new Date(0).toISOString(), definition });
}

let fileCache: SiteSnapshot | null = null;
/** File mode: the single site in ATRIUM_SNAPSHOT_FILE (default ./site.json), read once per process. */
export function getFileSnapshot(): SiteSnapshot {
  if (fileCache) return fileCache;
  const file = process.env.ATRIUM_SNAPSHOT_FILE ?? 'site.json';
  const abs = path.isAbsolute(file) ? file : path.join(/* turbopackIgnore: true */ process.cwd(), file);
  fileCache = coerceSnapshot(JSON.parse(readFileSync(/* turbopackIgnore: true */ abs, 'utf8')));
  return fileCache;
}

async function apiGet(url: string, init: RequestInit & { next?: { tags?: string[]; revalidate?: number | false } }): Promise<Response> {
  return fetch(url, { ...init, headers: { 'X-Renderer-Secret': RENDERER_SECRET, Accept: 'application/json', ...(init.headers ?? {}) } });
}

/** Platform mode: resolve a host to its published snapshot (ISR-cached, tag-revalidated). */
export const getSnapshotForHost = cache(async (host: string): Promise<SnapshotResult> => {
  const h = normalizeHost(host);
  if (!h) return { status: 'not-found' };
  try {
    const res = await apiGet(`${API_V1}/public/sites/resolve?host=${encodeURIComponent(h)}`, {
      next: { tags: [hostTag(h), ALL_SITES_TAG], revalidate: SNAPSHOT_REVALIDATE },
    });
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'error', message: `API responded ${res.status}` };
    const snapshot = coerceSnapshot(await res.json());
    const set = hostsBySite.get(snapshot.websiteId) ?? new Set<string>();
    set.add(h);
    hostsBySite.set(snapshot.websiteId, set);
    return { status: 'ok', snapshot };
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
});

/** `/_site/<slug>/…` dev access resolves `<slug>.<PLATFORM_SITES_DOMAIN>`. */
export function hostForSlug(slug: string): string {
  return `${slug.toLowerCase()}.${PLATFORM_SITES_DOMAIN}`;
}

/** Preview snapshots are never cached. */
export const getPreviewSnapshot = cache(async (token: string, password?: string): Promise<SnapshotResult> => {
  try {
    const q = new URLSearchParams({ token });
    if (password) q.set('password', password);
    const res = await apiGet(`${API_V1}/public/preview?${q}`, { cache: 'no-store' });
    if (res.status === 404) return { status: 'not-found' };
    if (res.status === 401) return { status: 'password-required', invalid: !!password };
    if (!res.ok) return { status: 'error', message: `API responded ${res.status}` };
    return { status: 'ok', snapshot: coerceSnapshot(await res.json()) };
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
});
