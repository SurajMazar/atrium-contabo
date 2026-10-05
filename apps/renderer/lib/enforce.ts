import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { resolveRequest, type SiteRequest } from './site';

/** Resolve and throw Next navigation signals for redirects / 404s; returns the renderable resolution. */
export function enforceRequest(req: SiteRequest) {
  const r = resolveRequest(req);
  if (r.kind === 'redirect') {
    if (r.statusCode === 301 || r.statusCode === 308) permanentRedirect(r.destination);
    redirect(r.destination);
  }
  if (r.kind === 'not-found') notFound();
  return r;
}
