import { buildSitemapXml } from '@atrium/renderer-core';
import { getSnapshotForHost, normalizeHost } from '@/lib/snapshot';

export const dynamic = 'force-dynamic'; // snapshot fetch is tag-cached; host is per request

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const host = normalizeHost((await params).host);
  const res = await getSnapshotForHost(host);
  if (res.status !== 'ok') return new Response('Not found', { status: 404 });
  const snap = res.snapshot;
  const base = snap.primaryDomain ? `https://${snap.primaryDomain}` : (snap.definition.settings.seo.canonicalBase ?? `https://${host}`);
  return new Response(buildSitemapXml(snap.definition, base, { lastModified: snap.publishedAt.slice(0, 10) }), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
