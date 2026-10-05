import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { RENDERER_SECRET } from '@/lib/env';
import { ALL_SITES_TAG, hostTagsForSite } from '@/lib/snapshot';

function authorized(secret: string | null): boolean {
  if (!RENDERER_SECRET || !secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(RENDERER_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST { tags: string[] } with X-Renderer-Secret → immediately expires the tagged snapshots/pages. */
export async function POST(req: Request) {
  if (!authorized(req.headers.get('x-renderer-secret'))) return Response.json({ error: { code: 'FORBIDDEN', message: 'Invalid renderer secret' } }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 256) : [];
  if (!tags.length) return Response.json({ error: { code: 'BAD_REQUEST', message: 'tags[] required' } }, { status: 400 });
  const all = new Set(tags);
  for (const t of tags) {
    if (!t.startsWith('site:')) continue;
    const hosts = hostTagsForSite(t.slice(5));
    hosts.forEach((h) => all.add(h));
    // Unknown site on this instance (e.g. after a restart): fall back to clearing every snapshot.
    if (!hosts.length && !tags.some((x) => x.startsWith('host:'))) all.add(ALL_SITES_TAG);
  }
  for (const t of all) revalidateTag(t, { expire: 0 });
  return Response.json({ revalidated: [...all], now: Date.now() });
}
