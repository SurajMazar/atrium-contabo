import { NextResponse, type NextRequest } from 'next/server';

/**
 * Multi-tenant routing (platform mode). Rewrites every request to an internal segment so pages can
 * be ISR-cached per host:
 *   https://<host>/<path>          → /atrium-tenant/<host>/<path>
 *   /_site/<slug>/<path>  (dev)    → /atrium-dev/<slug>/<path>
 *   /_preview/<token>/<path>       → /atrium-preview/<token>/<path>
 * The original target/path are forwarded as headers for not-found pages.
 * In file mode (single site) the proxy passes requests through untouched.
 */
const DEPLOY_ENV = process.env.ATRIUM_DEPLOY_ENV ?? process.env.NODE_ENV;
/** `/_site/<slug>` serves any tenant by slug: a local-development shortcut, never in production. */
const DEV_ROUTES = DEPLOY_ENV !== 'production';
const bareHost = (h: string) => h.toLowerCase().replace(/:\d+$/, '');
/** Previews render drafts of any site, so they are only served on the platform's own preview host. */
const PREVIEW_HOST = (() => {
  try {
    return bareHost(new URL(process.env.PREVIEW_URL || process.env.RENDERER_URL || '').host);
  } catch {
    return '';
  }
})();
/** Behind a proxy that rewrites Host, opt in to its X-Forwarded-Host; otherwise a client could pick the tenant. */
const TRUST_FORWARDED_HOST = ['1', 'true', 'yes'].includes((process.env.ATRIUM_TRUST_FORWARDED_HOST ?? '').toLowerCase());

export function proxy(req: NextRequest) {
  if (process.env.ATRIUM_SNAPSHOT_SOURCE === 'file') return NextResponse.next();
  const url = req.nextUrl.clone();
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/_next/') || path.startsWith('/atrium-assets/')) return NextResponse.next();

  const requestHost = ((TRUST_FORWARDED_HOST ? req.headers.get('x-forwarded-host') : null) ?? req.headers.get('host') ?? '').split(',')[0]!.trim().toLowerCase();
  let target: string;
  let kind: 'preview' | 'dev' | 'host';
  let rest: string;
  const raw = /^\/(_preview|_site)\/([^/]+)(\/.*)?$/.exec(path);
  // Another tenant's site or preview must never render on this host's origin (its scripts would run
  // under a customer's domain and certificate): these prefixes only work where they belong.
  const m = raw && (raw[1] === '_site' ? DEV_ROUTES : DEV_ROUTES || (!!PREVIEW_HOST && bareHost(requestHost) === PREVIEW_HOST)) ? raw : null;
  if (m) {
    kind = m[1] === '_preview' ? 'preview' : 'dev';
    target = m[2]!;
    rest = m[3] ?? '';
    url.pathname = `/${kind === 'preview' ? 'atrium-preview' : 'atrium-dev'}/${target}${rest}`;
  } else {
    kind = 'host';
    target = requestHost;
    rest = path === '/' ? '' : path;
    if (path.startsWith('/atrium-') || raw) rest = `/__blocked${path}`;
    url.pathname = `/atrium-tenant/${encodeURIComponent(target)}${rest}`;
  }
  const headers = new Headers(req.headers);
  headers.set('x-atrium-target', target);
  headers.set('x-atrium-path', rest);
  return NextResponse.rewrite(url, { request: { headers } });
}

export default proxy;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
