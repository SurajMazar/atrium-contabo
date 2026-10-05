import type { ReactNode } from 'react';
import { fileRequest } from '@/lib/file-site';
import { resolveRequest, SiteDocument, StatusDocument } from '@/lib/site';

type Params = Promise<{ path?: string[] }>;

/** Root layout for file mode (single site, static/exportable). Platform mode is served by /atrium-tenant via the proxy. */
export default async function FileLayout({ children, params }: { children: ReactNode; params: Params }) {
  const req = fileRequest((await params).path);
  if (!req) return <StatusDocument title="Atrium renderer" message="No site is configured for this address." status="Not found" />;
  return <SiteDocument r={resolveRequest(req)} req={req}>{children}</SiteDocument>;
}
