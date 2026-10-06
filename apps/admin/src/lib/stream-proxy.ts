import type { NextRequest } from 'next/server';

/**
 * Streaming pass-through to the API for large uploads (site imports, media). The generic /api/v1
 * rewrite buffers a copy of every proxied body in memory (Next's proxyClientMaxBodySize), so big
 * uploads go through these route handlers instead: the body is piped to the API as it arrives and
 * the API rejects unauthenticated or oversized requests before reading it.
 */
const API_ORIGIN = (process.env.ATRIUM_API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const FORWARD = ['authorization', 'content-type', 'content-length', 'accept', 'user-agent', 'x-request-id'];

export async function streamToApi(req: NextRequest, apiPath: string): Promise<Response> {
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Only the hop our own front proxy recorded (earlier entries are client-controlled).
  const fwd = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  if (fwd) headers.set('x-forwarded-for', fwd);
  headers.set('x-forwarded-host', req.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));
  let upstream: Response;
  try {
    upstream = await fetch(`${API_ORIGIN}/v1${apiPath}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: req.body,
      // Stream the request body instead of buffering it.
      duplex: 'half',
      redirect: 'manual',
      cache: 'no-store',
    } as RequestInit & { duplex: 'half' });
  } catch {
    return Response.json({ error: { code: 'INTERNAL', message: 'The Atrium API is unreachable. Is it running?' } }, { status: 502 });
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk === 'set-cookie' || lk === 'content-encoding' || lk === 'transfer-encoding' || lk === 'connection') return;
    out.set(k, v);
  });
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
