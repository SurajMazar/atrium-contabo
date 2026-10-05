import { buildRobotsTxt } from '@atrium/renderer-core';
import { getSnapshotForHost, normalizeHost } from '@/lib/snapshot';

export const dynamic = 'force-dynamic'; // snapshot fetch is tag-cached; host is per request

/** Non-primary hosts (when a primary domain exists) are disallowed to avoid duplicate content. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const host = normalizeHost((await params).host);
  const res = await getSnapshotForHost(host);
  if (res.status !== 'ok') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
  const snap = res.snapshot;
  const nonPrimary = !!snap.primaryDomain && normalizeHost(snap.primaryDomain) !== host;
  const base = snap.primaryDomain ? `https://${snap.primaryDomain}` : `https://${host}`;
  return new Response(buildRobotsTxt(snap.definition, base, { disallowAll: nonPrimary }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' } });
}
