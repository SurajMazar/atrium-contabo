import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../src/driver';
import { mapNetlifyState, netlifyDriver } from '../../src/deployment/netlify';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
interface Call {
  method: string;
  url: URL;
  init: RequestInit;
}

function json(status: number, body?: unknown): Response {
  return new Response(JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } });
}

function mockFetch(routes: Array<[method: string, path: RegExp, handler: Handler]>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? 'GET';
      calls.push({ method, url, init });
      const route = routes.find(([m, re]) => m === method && re.test(url.pathname));
      if (!route) throw new Error(`unmatched request ${method} ${url.pathname}`);
      return route[2](url, init);
    }),
  );
  return calls;
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

function provider(config: Record<string, unknown> = {}) {
  return netlifyDriver.create(netlifyDriver.configSchema.parse(config), netlifyDriver.secretsSchema.parse({ token: 'nf_tok' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('netlify driver', () => {
  it('deploys static files, uploading only required shas via PUT', async () => {
    const calls = mockFetch([
      ['GET', /^\/api\/v1\/sites$/, () => json(200, [{ id: 'other', name: 'my-site-2' }])],
      ['POST', /^\/api\/v1\/acme\/sites$/, () => json(201, { id: 'site_1', name: 'my-site' })],
      [
        'POST',
        /^\/api\/v1\/sites\/site_1\/deploys$/,
        () => json(200, { id: 'dep_1', site_id: 'site_1', state: 'uploading', required: [sha1('b')] }),
      ],
      ['PUT', /^\/api\/v1\/deploys\/dep_1\/files\//, () => json(200, {})],
      [
        'GET',
        /^\/api\/v1\/deploys\/dep_1$/,
        () =>
          json(200, {
            id: 'dep_1',
            site_id: 'site_1',
            state: 'ready',
            context: 'production',
            ssl_url: 'https://my-site.netlify.app',
            deploy_ssl_url: 'https://dep_1--my-site.netlify.app',
            created_at: '2026-10-05T10:00:00.000Z',
            published_at: '2026-10-05T10:00:05.000Z',
          }),
      ],
    ]);

    const info = await provider({ accountSlug: 'acme' }).deploy({
      projectName: 'My Site',
      target: 'production',
      framework: 'static',
      files: [
        { path: 'index.html', content: 'a' },
        { path: 'assets/my file.css', content: 'b' },
        { path: 'assets/dup.css', content: 'b' },
      ],
    });

    expect(info).toMatchObject({ id: 'dep_1', status: 'ready', target: 'production', url: 'https://my-site.netlify.app', projectId: 'site_1' });

    const lookup = calls[0]!;
    expect(lookup.url.searchParams.get('name')).toBe('my-site');
    expect(lookup.url.searchParams.get('filter')).toBe('all');
    expect((lookup.init.headers as Record<string, string>).Authorization).toBe('Bearer nf_tok');

    const create = calls.find((c) => c.url.pathname === '/api/v1/sites/site_1/deploys')!;
    expect(JSON.parse(String(create.init.body))).toEqual({
      files: { '/index.html': sha1('a'), '/assets/my file.css': sha1('b'), '/assets/dup.css': sha1('b') },
      draft: false,
      async: false,
    });

    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url.pathname).toBe('/api/v1/deploys/dep_1/files/assets/my%20file.css');
    expect((puts[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream');
    expect(Buffer.from(puts[0]!.init.body as Uint8Array).toString()).toBe('b');
  });

  it('preview deploys are drafts and use the deploy URL', async () => {
    const calls = mockFetch([
      ['GET', /^\/api\/v1\/sites$/, () => json(200, [{ id: 'site_1', name: 'site' }])],
      [
        'POST',
        /^\/api\/v1\/sites\/site_1\/deploys$/,
        () => json(200, { id: 'dep_2', state: 'prepared', draft: true, required: [], ssl_url: 'https://site.netlify.app', deploy_ssl_url: 'https://dep_2--site.netlify.app' }),
      ],
    ]);
    const info = await provider().deploy({ projectName: 'site', target: 'preview', framework: 'static', files: [{ path: 'index.html', content: 'x' }] });
    expect(info).toMatchObject({ status: 'building', target: 'preview', url: 'https://dep_2--site.netlify.app' });
    expect(JSON.parse(String(calls[1]!.init.body)).draft).toBe(true);
  });

  it('rejects nextjs deploys with a non-retryable ProviderError', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const err = await provider()
      .deploy({ projectName: 'x', target: 'production', framework: 'nextjs', files: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(false);
    expect((err as ProviderError).message).toMatch(/static export/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps deploy states', () => {
    expect(mapNetlifyState('new')).toBe('queued');
    expect(mapNetlifyState('uploading')).toBe('building');
    expect(mapNetlifyState('processed')).toBe('building');
    expect(mapNetlifyState('ready')).toBe('ready');
    expect(mapNetlifyState('error')).toBe('failed');
  });

  it('verifyDomain gives apex A / subdomain CNAME guidance', async () => {
    mockFetch([
      ['GET', /^\/api\/v1\/sites$/, () => json(200, [{ id: 'site_1', name: 'site', custom_domain: 'example.com', domain_aliases: ['www.example.com'] }])],
      ['GET', /^\/api\/v1\/sites\/site_1\/ssl$/, () => json(200, { state: 'issued', domains: ['example.com', 'www.example.com'] })],
    ]);
    const apex = await provider().verifyDomain('site', 'example.com');
    expect(apex).toMatchObject({ verified: true, ssl: 'active', records: [{ type: 'A', name: '@', value: '75.2.60.5' }] });
    const sub = await provider().verifyDomain('site', 'www.example.com');
    expect(sub.records).toEqual([{ type: 'CNAME', name: 'www', value: 'site.netlify.app', reason: expect.any(String) }]);
  });
});
