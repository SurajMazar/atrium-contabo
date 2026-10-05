import { buildRobotsTxt } from '@atrium/renderer-core';
import { SOURCE } from '@/lib/env';
import { getFileSnapshot } from '@/lib/snapshot';

export const dynamic = 'force-static';

export function GET() {
  if (SOURCE !== 'file') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
  const snap = getFileSnapshot();
  const base = snap.definition.settings.seo.canonicalBase ?? (snap.primaryDomain ? `https://${snap.primaryDomain}` : undefined);
  return new Response(buildRobotsTxt(snap.definition, base), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
