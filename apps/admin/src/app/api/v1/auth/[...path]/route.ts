import type { NextRequest } from 'next/server';

/**
 * Auth proxy. Identical to the generic `/api/*` rewrite except that it rewrites
 * the refresh cookie's `Path=/v1/auth` to `Path=/api/v1/auth`, so the browser
 * sends `atrium_rt` back to the proxied auth routes.
 */
const API_ORIGIN = (process.env.ATRIUM_API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'accept-encoding']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_ORIGIN}/v1/auth/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  // Forward only the address our own front proxy (or Next, from the socket) recorded — the last hop.
  // Earlier entries are client-controlled and would let anyone pick the IP used for rate limits.
  headers.delete('x-forwarded-for');
  const fwdFor = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  if (fwdFor) headers.set('x-forwarded-for', fwdFor);
  headers.delete('x-real-ip');
  headers.set('x-forwarded-host', req.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: { code: 'INTERNAL', message: 'The Atrium API is unreachable. Is it running?' } }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === 'set-cookie' || HOP_BY_HOP.has(lk) || lk === 'content-encoding') return;
    out.set(k, v);
  });
  const cookies = upstream.headers.getSetCookie();
  let scopedToApiPath = false;
  for (const cookie of cookies) {
    const rewritten = cookie.replace(/;\s*Path=\/v1(\/|;|$)/i, (_m, tail: string) => `; Path=/api/v1${tail}`);
    if (rewritten !== cookie) scopedToApiPath = true;
    out.append('set-cookie', rewritten);
  }
  // If the API scopes the refresh cookie elsewhere (e.g. Path=/), expire any stale copy
  // previously stored under /api/v1/auth so the browser doesn't send two `atrium_rt` values.
  const touchesSession = cookies.some((c) => /^(__Host-)?atrium_rt=/i.test(c)) || (path[0] === 'refresh' && upstream.status === 401) || path[0] === 'logout';
  if (touchesSession && !scopedToApiPath) {
    out.append('set-cookie', 'atrium_rt=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax');
  }
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const dynamic = 'force-dynamic';
