import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../src/driver';
import {
  buildPagesDomainConfig,
  cloudflarePagesDriver,
  decodePagesDeploymentId,
  encodePagesDeploymentId,
  mapPagesStage,
  pagesAssetHash,
  unwrapCloudflare,
} from '../../src/deployment/cloudflare-pages';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
interface Call {
  method: string;
  url: URL;
  init: RequestInit;
}

function json(status: number, body?: unknown): Response {
  return new Response(JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } });
}
const ok = (result: unknown) => json(200, { success: true, errors: [], messages: [], result });

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

const auth = (c: Call) => (c.init.headers as Record<string, string>).Authorization;

function provider() {
  return cloudflarePagesDriver.create(
    cloudflarePagesDriver.configSchema.parse({ accountId: 'acc1' }),
    cloudflarePagesDriver.secretsSchema.parse({ apiToken: 'cf_tok' }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cloudflare pages driver', () => {
  it('round-trips deployment ids', () => {
    const id = encodePagesDeploymentId('my-site', 'abc-123');
    expect(id).toBe('my-site:abc-123');
    expect(decodePagesDeploymentId(id)).toEqual({ projectName: 'my-site', deploymentId: 'abc-123' });
    expect(() => decodePagesDeploymentId('no-separator')).toThrow(ProviderError);
    expect(() => decodePagesDeploymentId(':x')).toThrow(ProviderError);
  });

  it('unwraps envelopes and throws ProviderError on success:false', () => {
    expect(unwrapCloudflare({ success: true, result: { a: 1 } })).toEqual({ a: 1 });
    expect(() => unwrapCloudflare({ success: false, errors: [{ code: 8000007, message: 'Project not found' }] })).toThrow(/8000007: Project not found/);
  });

  it('surfaces success:false from a 200 response as a ProviderError', async () => {
    mockFetch([['GET', /\/deployments\/dep1$/, () => json(200, { success: false, errors: [{ code: 1000, message: 'boom' }], result: null })]]);
    const err = await provider().getStatus('my-site:dep1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toMatch(/boom/);
  });

  it('getStatus decodes the id and re-encodes it in the result', async () => {
    const calls = mockFetch([
      [
        'GET',
        /^\/client\/v4\/accounts\/acc1\/pages\/projects\/my-site\/deployments\/dep1$/,
        () =>
          ok({
            id: 'dep1',
            project_name: 'my-site',
            environment: 'production',
            url: 'https://dep1.my-site.pages.dev',
            created_on: '2026-10-05T10:00:00Z',
            latest_stage: { name: 'deploy', status: 'success', ended_on: '2026-10-05T10:00:10Z' },
          }),
      ],
    ]);
    const info = await provider().getStatus('my-site:dep1');
    expect(info).toMatchObject({ id: 'my-site:dep1', status: 'ready', target: 'production', url: 'https://dep1.my-site.pages.dev' });
    expect(info.readyAt).toBe('2026-10-05T10:00:10.000Z');
    expect(auth(calls[0]!)).toBe('Bearer cf_tok');
  });

  it('maps stages', () => {
    expect(mapPagesStage({ name: 'queued', status: 'active' })).toBe('queued');
    expect(mapPagesStage({ name: 'build', status: 'active' })).toBe('building');
    expect(mapPagesStage({ name: 'deploy', status: 'success' })).toBe('ready');
    expect(mapPagesStage({ name: 'build', status: 'failure' })).toBe('failed');
    expect(mapPagesStage({ name: 'build', status: 'canceled' })).toBe('cancelled');
  });

  it('deploys via the direct upload flow', async () => {
    const files = [
      { path: 'index.html', content: '<h1>hi</h1>' },
      { path: 'app.js', content: 'console.log(1)' },
    ];
    const hashes = files.map((f) => pagesAssetHash(Buffer.from(f.content).toString('base64'), f.path));
    const calls = mockFetch([
      ['GET', /^\/client\/v4\/accounts\/acc1\/pages\/projects\/my-site$/, () => json(404, { success: false, errors: [{ code: 8000007, message: 'not found' }] })],
      ['POST', /^\/client\/v4\/accounts\/acc1\/pages\/projects$/, () => ok({ name: 'my-site', subdomain: 'my-site.pages.dev' })],
      ['GET', /\/pages\/projects\/my-site\/upload-token$/, () => ok({ jwt: 'jwt_1' })],
      ['POST', /^\/client\/v4\/pages\/assets\/check-missing$/, () => ok([hashes[1]])],
      ['POST', /^\/client\/v4\/pages\/assets\/upload$/, () => ok({ successful_key_count: 1 })],
      ['POST', /^\/client\/v4\/pages\/assets\/upsert-hashes$/, () => ok(null)],
      [
        'POST',
        /\/pages\/projects\/my-site\/deployments$/,
        () => ok({ id: 'dep9', environment: 'preview', url: 'https://dep9.my-site.pages.dev', latest_stage: { name: 'deploy', status: 'success' } }),
      ],
    ]);

    const info = await provider().deploy({ projectName: 'my-site', target: 'preview', framework: 'static', files });
    expect(info).toMatchObject({ id: 'my-site:dep9', status: 'ready', target: 'preview' });

    expect(hashes.every((h) => /^[0-9a-f]{32}$/.test(h))).toBe(true);
    const createProject = calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/pages/projects'))!;
    expect(JSON.parse(String(createProject.init.body))).toEqual({ name: 'my-site', production_branch: 'main' });

    const check = calls.find((c) => c.url.pathname.endsWith('/check-missing'))!;
    expect(auth(check)).toBe('Bearer jwt_1');
    expect(JSON.parse(String(check.init.body))).toEqual({ hashes });

    const upload = calls.find((c) => c.url.pathname.endsWith('/assets/upload'))!;
    expect(auth(upload)).toBe('Bearer jwt_1');
    expect(JSON.parse(String(upload.init.body))).toEqual([
      { key: hashes[1], value: Buffer.from('console.log(1)').toString('base64'), metadata: { contentType: 'application/javascript' }, base64: true },
    ]);

    const create = calls.find((c) => c.url.pathname.endsWith('/deployments'))!;
    expect(auth(create)).toBe('Bearer cf_tok');
    const form = create.init.body as FormData;
    expect(form.get('branch')).toBe('preview');
    expect(JSON.parse(String(form.get('manifest')))).toEqual({ '/index.html': hashes[0], '/app.js': hashes[1] });
  });

  it('rejects nextjs deploys', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(provider().deploy({ projectName: 'x', target: 'production', framework: 'nextjs', files: [] })).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('builds domain guidance with TXT validation records', () => {
    const sub = buildPagesDomainConfig('www.example.com', 'my-site.pages.dev', {
      status: 'pending',
      validation_data: { method: 'txt', txt_name: '_cf-custom-hostname.www.example.com', txt_value: 'uuid' },
    });
    expect(sub.verified).toBe(false);
    expect(sub.ssl).toBe('pending');
    expect(sub.records).toEqual([
      { type: 'TXT', name: '_cf-custom-hostname.www.example.com', value: 'uuid', reason: expect.any(String) },
      { type: 'CNAME', name: 'www', value: 'my-site.pages.dev', reason: expect.any(String) },
    ]);
    const apex = buildPagesDomainConfig('example.com', 'my-site.pages.dev', { status: 'active' });
    expect(apex).toMatchObject({ verified: true, ssl: 'active', records: [{ type: 'CNAME', name: '@', value: 'my-site.pages.dev' }] });
  });
});
