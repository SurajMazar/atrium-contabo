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
export function proxy(req: NextRequest) {
  if (process.env.ATRIUM_SNAPSHOT_SOURCE === 'file') return NextResponse.next();
  const url = req.nextUrl.clone();
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/_next/') || path.startsWith('/atrium-assets/')) return NextResponse.next();

  let target: string;
  let kind: 'preview' | 'dev' | 'host';
  let rest: string;
  const m = /^\/(_preview|_site)\/([^/]+)(\/.*)?$/.exec(path);
  if (m) {
    kind = m[1] === '_preview' ? 'preview' : 'dev';
    target = m[2]!;
    rest = m[3] ?? '';
    url.pathname = `/${kind === 'preview' ? 'atrium-preview' : 'atrium-dev'}/${target}${rest}`;
  } else {
    kind = 'host';
    target = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0]!.trim().toLowerCase();
    rest = path === '/' ? '' : path;
    if (path.startsWith('/atrium-')) rest = `/__blocked${path}`;
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
