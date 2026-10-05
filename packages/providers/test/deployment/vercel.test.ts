import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../src/driver';
import { buildVercelDomainConfig, sanitizeVercelProjectName, vercelDriver } from '../../src/deployment/vercel';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
interface Call {
  method: string;
  url: URL;
  init: RequestInit;
}

function json(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status });
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

const headersOf = (c: Call) => c.init.headers as Record<string, string>;
const bodyOf = <T>(c: Call) => JSON.parse(String(c.init.body)) as T;
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

function provider(config: Record<string, unknown> = { teamId: 'team_1' }) {
  return vercelDriver.create(vercelDriver.configSchema.parse(config), vercelDriver.secretsSchema.parse({ token: 'tok_secret' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vercel driver', () => {
  it('sanitizes project names', () => {
    expect(sanitizeVercelProjectName('My Site!')).toBe('my-site');
    expect(sanitizeVercelProjectName('a'.repeat(150))).toHaveLength(100);
    expect(sanitizeVercelProjectName('---')).toBe('atrium-site');
  });

  it('applies config defaults', () => {
    const cfg = vercelDriver.configSchema.parse({});
    expect(cfg.framework).toBe('nextjs');
    expect(cfg.nodeVersion).toBe('24.x');
  });

  it('deploys: creates project, upserts env, uploads only missing shas, retries create', async () => {
    let creates = 0;
    const calls = mockFetch([
      ['GET', /^\/v9\/projects\/my-site$/, () => json(404, { error: { code: 'not_found', message: 'Project not found' } })],
      ['POST', /^\/v11\/projects$/, () => json(200, { id: 'prj_1', name: 'my-site' })],
      ['POST', /^\/v10\/projects\/prj_1\/env$/, () => json(201, { created: [] })],
      ['POST', /^\/v2\/files$/, () => json(200, {})],
      [
        'POST',
        /^\/v13\/deployments$/,
        () =>
          ++creates === 1
            ? json(400, { error: { code: 'missing_files', message: 'Missing files', missing: [sha1('body{}')] } })
            : json(200, {
                id: 'dpl_1',
                url: 'my-site-abc.vercel.app',
                readyState: 'BUILDING',
                inspectorUrl: 'https://vercel.com/acme/my-site/dpl_1',
                projectId: 'prj_1',
                createdAt: 1_700_000_000_000,
                target: 'production',
              }),
      ],
    ]);

    const info = await provider().deploy({
      projectName: 'My Site',
      target: 'production',
      framework: 'nextjs',
      files: [
        { path: 'index.html', content: 'hello' },
        { path: './copy.html', content: Buffer.from('hello') },
        { path: 'style.css', content: 'body{}' },
      ],
      env: { API_URL: 'https://api.example.com' },
      meta: { siteId: 's1' },
    });

    expect(info).toMatchObject({
      id: 'dpl_1',
      url: 'https://my-site-abc.vercel.app',
      status: 'building',
      target: 'production',
      projectId: 'prj_1',
      inspectorUrl: 'https://vercel.com/acme/my-site/dpl_1',
      createdAt: new Date(1_700_000_000_000).toISOString(),
    });

    // teamId on every request; bearer auth
    for (const c of calls) {
      expect(c.url.searchParams.get('teamId')).toBe('team_1');
      expect(headersOf(c).Authorization).toBe('Bearer tok_secret');
    }

    const createProject = calls.find((c) => c.url.pathname === '/v11/projects');
    expect(bodyOf<Record<string, unknown>>(createProject!)).toMatchObject({ name: 'my-site', framework: 'nextjs', nodeVersion: '24.x' });

    const env = calls.find((c) => c.url.pathname.endsWith('/env'))!;
    expect(env.url.searchParams.get('upsert')).toBe('true');
    expect(bodyOf<unknown[]>(env)).toEqual([
      { key: 'API_URL', value: 'https://api.example.com', type: 'encrypted', target: ['production', 'preview'] },
    ]);

    const uploads = calls.filter((c) => c.url.pathname === '/v2/files');
    expect(uploads).toHaveLength(1);
    expect(headersOf(uploads[0]!)['x-vercel-digest']).toBe(sha1('body{}'));
    expect(headersOf(uploads[0]!)['Content-Type']).toBe('application/octet-stream');
    expect(headersOf(uploads[0]!)['Content-Length']).toBe('6');

    const createsCalls = calls.filter((c) => c.url.pathname === '/v13/deployments');
    expect(createsCalls).toHaveLength(2);
    expect(createsCalls[1]!.url.searchParams.get('skipAutoDetectionConfirmation')).toBe('1');
    const body = bodyOf<{ name: string; project: string; target?: string; files: unknown[]; meta: unknown }>(createsCalls[1]!);
    expect(body).toMatchObject({ name: 'my-site', project: 'prj_1', target: 'production', meta: { siteId: 's1' } });
    expect(body.files).toEqual([
      { file: 'index.html', sha: sha1('hello'), size: 5 },
      { file: 'copy.html', sha: sha1('hello'), size: 5 },
      { file: 'style.css', sha: sha1('body{}'), size: 6 },
    ]);
  });

  it('uploads every unique file when missing_files has no list, and omits target for previews', async () => {
    let creates = 0;
    const calls = mockFetch([
      ['GET', /^\/v9\/projects\/site$/, () => json(200, { id: 'prj_2', name: 'site' })],
      ['POST', /^\/v2\/files$/, () => json(200, {})],
      [
        'POST',
        /^\/v13\/deployments$/,
        () => (++creates === 1 ? json(400, { error: { code: 'missing_files', message: 'Missing files' } }) : json(200, { id: 'dpl_2', readyState: 'QUEUED' })),
      ],
    ]);
    const info = await provider({ teamSlug: 'acme' }).deploy({
      projectName: 'site',
      target: 'preview',
      framework: 'static',
      files: [
        { path: 'a.html', content: 'x' },
        { path: 'b.html', content: 'x' },
        { path: 'c.html', content: 'y' },
      ],
    });
    expect(info.status).toBe('queued');
    expect(info.target).toBe('preview');
    expect(calls.filter((c) => c.url.pathname === '/v2/files')).toHaveLength(2);
    expect(calls.every((c) => c.url.searchParams.get('slug') === 'acme' && !c.url.searchParams.has('teamId'))).toBe(true);
    const create = calls.filter((c) => c.url.pathname === '/v13/deployments')[1]!;
    const body = bodyOf<Record<string, unknown> & { projectSettings: { framework: unknown } }>(create);
    expect(body).not.toHaveProperty('target');
    expect(body.projectSettings.framework).toBeNull();
    // no env given → no env call
    expect(calls.some((c) => c.url.pathname.endsWith('/env'))).toBe(false);
  });

  it('rethrows non missing_files errors', async () => {
    mockFetch([
      ['GET', /^\/v9\/projects\//, () => json(200, { id: 'prj_1' })],
      ['POST', /^\/v13\/deployments$/, () => json(400, { error: { code: 'bad_request', message: 'nope' } })],
    ]);
    await expect(provider().deploy({ projectName: 'x', target: 'preview', framework: 'static', files: [] })).rejects.toBeInstanceOf(ProviderError);
  });

  it.each([
    ['QUEUED', 'queued'],
    ['INITIALIZING', 'queued'],
    ['BUILDING', 'building'],
    ['READY', 'ready'],
    ['ERROR', 'failed'],
    ['CANCELED', 'cancelled'],
  ] as const)('getStatus maps readyState %s → %s', async (readyState, expected) => {
    mockFetch([
      [
        'GET',
        /^\/v13\/deployments\/dpl_1$/,
        () => json(200, { id: 'dpl_1', url: 'x.vercel.app', readyState, ready: 1_700_000_100_000, errorCode: readyState === 'ERROR' ? 'BUILD_FAILED' : undefined, errorMessage: readyState === 'ERROR' ? 'Command failed' : undefined }),
      ],
    ]);
    const info = await provider().getStatus('dpl_1');
    expect(info.status).toBe(expected);
    if (expected === 'failed') expect(info.error).toBe('BUILD_FAILED: Command failed');
    if (expected === 'ready') expect(info.readyAt).toBe(new Date(1_700_000_100_000).toISOString());
  });

  it('falls back to the status field when readyState is absent', async () => {
    mockFetch([['GET', /^\/v13\/deployments\/d$/, () => json(200, { uid: 'd', status: 'READY' })]]);
    expect((await provider().getStatus('d')).status).toBe('ready');
  });

  it('maps build events to log lines (array or {events})', async () => {
    const calls = mockFetch([
      [
        'GET',
        /^\/v3\/deployments\/dpl_1\/events$/,
        () =>
          json(200, {
            events: [
              { type: 'stdout', created: 1_700_000_000_000, payload: { text: 'Installing' } },
              { type: 'stderr', date: 1_700_000_001_000, text: 'boom' },
              { type: 'command', created: 1_700_000_002_000, level: 'warning', payload: { text: 'careful' } },
            ],
          }),
      ],
    ]);
    const logs = await provider().getLogs('dpl_1');
    expect(logs).toEqual([
      { timestamp: new Date(1_700_000_000_000).toISOString(), level: 'info', message: 'Installing' },
      { timestamp: new Date(1_700_000_001_000).toISOString(), level: 'error', message: 'boom' },
      { timestamp: new Date(1_700_000_002_000).toISOString(), level: 'warn', message: 'careful' },
    ]);
    expect(calls[0]!.url.searchParams.get('direction')).toBe('forward');
    expect(calls[0]!.url.searchParams.get('limit')).toBe('2000');
  });

  it('verifyDomain builds apex A + TXT records', async () => {
    const calls = mockFetch([
      ['POST', /^\/v9\/projects\/my-site\/domains\/example\.com\/verify$/, () => json(400, { error: { code: 'existing_project_domain_not_verified', message: 'not verified' } })],
      [
        'GET',
        /^\/v9\/projects\/my-site\/domains\/example\.com$/,
        () =>
          json(200, {
            name: 'example.com',
            verified: false,
            verification: [{ type: 'TXT', domain: '_vercel.example.com', value: 'vc-domain-verify=example.com,abc', reason: 'pending_domain_verification' }],
          }),
      ],
      ['GET', /^\/v6\/domains\/example\.com\/config$/, () => json(200, { misconfigured: true })],
    ]);
    const cfg = await provider().verifyDomain('my-site', 'Example.com');
    expect(cfg).toEqual({
      domain: 'example.com',
      verified: false,
      misconfigured: true,
      ssl: 'pending',
      records: [
        { type: 'TXT', name: '_vercel.example.com', value: 'vc-domain-verify=example.com,abc', reason: 'pending_domain_verification' },
        { type: 'A', name: '@', value: '76.76.21.21', reason: expect.any(String) },
      ],
    });
    expect(calls.every((c) => c.url.searchParams.get('teamId') === 'team_1')).toBe(true);
  });

  it('verifyDomain builds subdomain CNAME and reports verified', async () => {
    mockFetch([
      ['POST', /\/verify$/, () => json(200, { verified: true })],
      ['GET', /^\/v9\/projects\/my-site\/domains\/www\.example\.com$/, () => json(200, { name: 'www.example.com', verified: true })],
      ['GET', /^\/v6\/domains\/www\.example\.com\/config$/, () => json(200, { misconfigured: false, configuredBy: 'CNAME' })],
    ]);
    const cfg = await provider().verifyDomain('my-site', 'www.example.com');
    expect(cfg.verified).toBe(true);
    expect(cfg.ssl).toBe('active');
    expect(cfg.records).toEqual([{ type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', reason: expect.any(String) }]);
  });

  it('uses rank-1 recommendations when present', () => {
    const apex = buildVercelDomainConfig('example.co.uk', { verified: true }, {
      misconfigured: false,
      recommendedIPv4: [
        { rank: 2, value: ['1.1.1.1'] },
        { rank: 1, value: ['76.76.21.22'] },
      ],
    });
    expect(apex.records).toEqual([{ type: 'A', name: '@', value: '76.76.21.22', reason: expect.any(String) }]);
    const sub = buildVercelDomainConfig('blog.example.com', undefined, { misconfigured: true, recommendedCNAME: [{ rank: 1, value: 'abc.vercel-dns-017.com.' }] });
    expect(sub.records).toEqual([{ type: 'CNAME', name: 'blog', value: 'abc.vercel-dns-017.com', reason: expect.any(String) }]);
    expect(sub.verified).toBe(false);
  });

  it('addDomain treats 409 as ok when the domain already belongs to the project', async () => {
    const calls = mockFetch([
      ['POST', /^\/v10\/projects\/my-site\/domains$/, () => json(409, { error: { code: 'domain_already_in_use', message: 'in use' } })],
      ['GET', /^\/v9\/projects\/my-site\/domains\/www\.example\.com$/, () => json(200, { name: 'www.example.com', verified: true })],
      ['GET', /^\/v6\/domains\/www\.example\.com\/config$/, () => json(200, { misconfigured: false })],
    ]);
    const cfg = await provider().addDomain('my-site', 'www.example.com', { redirectTo: 'example.com' });
    expect(cfg.verified).toBe(true);
    expect(bodyOf(calls[0]!)).toEqual({ name: 'www.example.com', redirect: 'example.com', redirectStatusCode: 308 });
  });

  it('addDomain rethrows 409 when the domain belongs elsewhere', async () => {
    mockFetch([
      ['POST', /^\/v10\/projects\/my-site\/domains$/, () => json(409, { error: { code: 'domain_already_in_use', message: 'in use' } })],
      ['GET', /^\/v9\/projects\/my-site\/domains\//, () => json(404, { error: { code: 'not_found' } })],
    ]);
    await expect(provider().addDomain('my-site', 'example.com')).rejects.toThrow(/409/);
  });

  it('removeDomain tolerates 404', async () => {
    const calls = mockFetch([['DELETE', /^\/v9\/projects\/my-site\/domains\/example\.com$/, () => json(404, {})]]);
    await expect(provider().removeDomain('my-site', 'example.com')).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('rollback promotes the deployment and returns production status', async () => {
    const calls = mockFetch([
      ['GET', /^\/v9\/projects\/my-site$/, () => json(200, { id: 'prj_1', name: 'my-site' })],
      ['POST', /^\/v10\/projects\/prj_1\/promote\/dpl_9$/, () => json(202, {})],
      ['GET', /^\/v13\/deployments\/dpl_9$/, () => json(200, { id: 'dpl_9', readyState: 'READY', url: 'old.vercel.app' })],
    ]);
    const info = await provider().rollback('my-site', 'dpl_9');
    expect(info).toMatchObject({ id: 'dpl_9', status: 'ready', target: 'production', url: 'https://old.vercel.app' });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'GET /v9/projects/my-site',
      'POST /v10/projects/prj_1/promote/dpl_9',
      'GET /v13/deployments/dpl_9',
    ]);
  });

  it('rollback falls back to the legacy rollback endpoint when promote 404s', async () => {
    const calls = mockFetch([
      ['GET', /^\/v9\/projects\/my-site$/, () => json(200, { id: 'prj_1' })],
      ['POST', /\/promote\//, () => json(404, { error: { code: 'not_found' } })],
      ['POST', /^\/v9\/projects\/prj_1\/rollback\/dpl_9$/, () => json(201, {})],
      ['GET', /^\/v13\/deployments\/dpl_9$/, () => json(200, { id: 'dpl_9', readyState: 'READY' })],
    ]);
    await provider().rollback('my-site', 'dpl_9');
    expect(calls.some((c) => c.url.pathname === '/v9/projects/prj_1/rollback/dpl_9')).toBe(true);
  });

  it('redeploy re-creates from an existing deployment', async () => {
    const calls = mockFetch([
      ['GET', /^\/v13\/deployments\/dpl_1$/, () => json(200, { id: 'dpl_1', name: 'my-site', projectId: 'prj_1', target: null })],
      ['POST', /^\/v13\/deployments$/, () => json(200, { id: 'dpl_2', readyState: 'QUEUED', target: 'production' })],
    ]);
    const info = await provider().redeploy('dpl_1', 'production');
    expect(info).toMatchObject({ id: 'dpl_2', status: 'queued', target: 'production' });
    const post = calls[1]!;
    expect(post.url.searchParams.get('forceNew')).toBe('1');
    expect(bodyOf(post)).toEqual({ name: 'my-site', deploymentId: 'dpl_1', target: 'production', project: 'prj_1' });
  });

  it('cancel sends PATCH', async () => {
    const calls = mockFetch([['PATCH', /^\/v12\/deployments\/dpl_1\/cancel$/, () => json(200, { id: 'dpl_1', readyState: 'CANCELED' })]]);
    await provider().cancel!('dpl_1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PATCH');
  });

  it('test() reports the user and team', async () => {
    mockFetch([
      ['GET', /^\/v2\/user$/, () => json(200, { user: { username: 'suraj', email: 'suraj@example.com' } })],
      ['GET', /^\/v2\/teams\/team_1$/, () => json(200, { id: 'team_1', slug: 'acme' })],
    ]);
    const res = await provider().test();
    expect(res.ok).toBe(true);
    expect(res.details).toMatchObject({ username: 'suraj', email: 'suraj@example.com', team: 'acme' });
  });

  it('test() returns ok:false on auth failure without leaking the token', async () => {
    mockFetch([['GET', /^\/v2\/user$/, () => json(403, { error: { code: 'forbidden', message: 'Not authorized' } })]]);
    const res = await provider().test();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Not authorized/);
    expect(res.message).not.toContain('tok_secret');
  });
});
