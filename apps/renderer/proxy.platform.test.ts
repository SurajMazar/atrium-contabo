import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Tenant routing: another tenant's site or preview must never render on a customer's domain. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return (await import('./proxy.platform')).proxy;
}
function route(proxy: (r: NextRequest) => Response, host: string, path: string, headers: Record<string, string> = {}) {
  const res = proxy(new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } }));
  return new URL(res.headers.get('x-middleware-rewrite') ?? 'https://x/none').pathname;
}

afterEach(() => vi.unstubAllEnvs());

describe('renderer tenant routing in production', () => {
  const prod = { ATRIUM_DEPLOY_ENV: 'production', PREVIEW_URL: 'https://sites.example.com', RENDERER_URL: 'https://sites.example.com' };

  it('serves a site by its own host', async () => {
    const proxy = await load(prod);
    expect(route(proxy, 'victim.com', '/about')).toBe('/atrium-tenant/victim.com/about');
  });

  it('never serves another tenant by slug (/_site) on any host', async () => {
    const proxy = await load(prod);
    expect(route(proxy, 'victim.com', '/_site/evil/')).toBe('/atrium-tenant/victim.com/__blocked/_site/evil/');
    expect(route(proxy, 'sites.example.com', '/_site/evil')).toBe('/atrium-tenant/sites.example.com/__blocked/_site/evil');
  });

  it('serves previews only on the preview host', async () => {
    const proxy = await load(prod);
    expect(route(proxy, 'sites.example.com', '/_preview/tok123/')).toBe('/atrium-preview/tok123/');
    expect(route(proxy, 'victim.com', '/_preview/tok123/')).toBe('/atrium-tenant/victim.com/__blocked/_preview/tok123/');
  });

  it('ignores a client-sent X-Forwarded-Host unless the proxy is trusted', async () => {
    let proxy = await load(prod);
    expect(route(proxy, 'victim.com', '/', { 'x-forwarded-host': 'evil.sites.example.com' })).toBe('/atrium-tenant/victim.com');
    proxy = await load({ ...prod, ATRIUM_TRUST_FORWARDED_HOST: '1' });
    expect(route(proxy, 'internal:3001', '/', { 'x-forwarded-host': 'victim.com' })).toBe('/atrium-tenant/victim.com');
  });

  it('blocks direct access to internal route segments', async () => {
    const proxy = await load(prod);
    expect(route(proxy, 'victim.com', '/atrium-tenant/other.com/x')).toBe('/atrium-tenant/victim.com/__blocked/atrium-tenant/other.com/x');
  });
});

describe('renderer tenant routing in local development', () => {
  it('keeps the /_site and /_preview shortcuts', async () => {
    const proxy = await load({ ATRIUM_DEPLOY_ENV: 'development' });
    expect(route(proxy, 'localhost:3001', '/_site/leela-garden/about')).toBe('/atrium-dev/leela-garden/about');
    expect(route(proxy, 'localhost:3001', '/_preview/t/')).toBe('/atrium-preview/t/');
  });
});
