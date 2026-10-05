import { buildSitemapXml } from '@atrium/renderer-core';
import { SOURCE } from '@/lib/env';
import { getFileSnapshot } from '@/lib/snapshot';

export const dynamic = 'force-static';

export function GET() {
  if (SOURCE !== 'file') return new Response('Not found', { status: 404 });
  const snap = getFileSnapshot();
  const base = snap.definition.settings.seo.canonicalBase ?? (snap.primaryDomain ? `https://${snap.primaryDomain}` : '');
  const xml = buildSitemapXml(snap.definition, base, { lastModified: snap.publishedAt.slice(0, 10) });
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
