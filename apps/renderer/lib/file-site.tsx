import { listRoutes } from '@atrium/renderer-core';
import { SOURCE } from './env';
import { getFileSnapshot } from './snapshot';
import { enforceRequest } from './enforce';
import type { SiteRequest } from './site';

/** File mode request (single site from ATRIUM_SNAPSHOT_FILE). */
export function fileRequest(segments: string[] | undefined): SiteRequest | null {
  if (SOURCE !== 'file') return null;
  return { snapshot: getFileSnapshot(), segments: segments ?? [], basePath: '', mode: 'live' };
}

/** Static params for every page, collection item and redirect source. */
export function fileStaticParams(): Array<{ path: string[] }> {
  if (SOURCE !== 'file') return [];
  const def = getFileSnapshot().definition;
  const params = listRoutes(def).map((r) => ({ path: r.segments }));
  for (const r of def.redirects) {
    if (r.enabled && !r.source.includes('*')) params.push({ path: r.source.split('/').filter(Boolean) });
  }
  const seen = new Set<string>();
  return params.filter((p) => {
    const k = p.path.join('/');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const enforce = enforceRequest;
