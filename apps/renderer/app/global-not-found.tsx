import type { Metadata } from 'next';
import { fileRequest } from '@/lib/file-site';
import { resolveRequest, SiteBody, SiteDocument, StatusDocument } from '@/lib/site';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: true } };

/**
 * Unmatched URLs (and the exported 404.html). In file mode this is the site's own 404 page
 * (settings.notFoundPageId / kind 'not-found', else a default) rendered with the site's theme.
 */
export default function GlobalNotFound() {
  const req = fileRequest(['__not-found__']);
  if (!req) return <StatusDocument title="Page not found" message="There is nothing at this address." status="404" />;
  const r = resolveRequest(req);
  if (r.kind === 'redirect') return <StatusDocument title="Page not found" message="There is nothing at this address." status="404" />;
  const nf = { ...r, kind: 'not-found' as const };
  return (
    <SiteDocument r={nf} req={req}>
      <SiteBody r={nf} />
    </SiteDocument>
  );
}
