import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { classifyIp, isPublicIp, parseIPv6 } from '../src/net/ip';
import {
  assertOutboundUrl,
  assertPublicUrl,
  createGuardedDispatcher,
  createGuardedLookup,
  guardedFetch,
  OutboundBlockedError,
  readBodyLimited,
  ResponseTooLargeError,
  resolvePublicAddresses,
  resolveSmtpTarget,
  type HostResolver,
} from '../src/net/guard';
import { outboundAllowPrivate, remoteExcerpt } from '../src/net/policy';
import { httpRequest } from '../src/http';
import { ProviderError } from '../src/driver';

const resolverFor = (map: Record<string, string[]>): HostResolver => async (host) => {
  const list = map[host];
  if (!list) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

describe('IP classification', () => {
  it.each([
    ['0.0.0.0', 'this-network'],
    ['10.1.2.3', 'private'],
    ['100.64.0.1', 'shared-cgnat'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['169.254.169.254', 'link-local'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.0.0.8', 'ietf-protocol'],
    ['192.0.2.1', 'documentation'],
    ['192.168.1.1', 'private'],
    ['198.18.0.1', 'benchmarking'],
    ['198.51.100.7', 'documentation'],
    ['203.0.113.9', 'documentation'],
    ['224.0.0.251', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
  ])('IPv4 %s is non-public (%s)', (ip, reason) => {
    expect(classifyIp(ip)).toMatchObject({ version: 4, public: false, reason });
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '93.184.216.34'])('IPv4 %s is public', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['[::1]', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback'],
    ['::127.0.0.1', 'ipv4-compatible'],
    ['::ffff:127.0.0.1', 'ipv4-mapped:loopback'],
    ['::ffff:7f00:1', 'ipv4-mapped:loopback'],
    ['::FFFF:7F00:0001', 'ipv4-mapped:loopback'],
    ['0:0:0:0:0:ffff:a9fe:a9fe', 'ipv4-mapped:link-local'],
    ['::ffff:0:10.0.0.1', 'ipv4-translated:private'],
    ['64:ff9b::7f00:1', 'nat64:loopback'],
    ['64:ff9b::169.254.169.254', 'nat64:link-local'],
    ['64:ff9b:1::1', 'nat64-local'],
    ['2002:7f00:1::', '6to4:loopback'],
    ['2002:c0a8:0101::1', '6to4:private'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'teredo'],
    ['2001:db8::1', 'documentation'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['fe80::1', 'link-local'],
    ['fe80::1%eth0', 'link-local'],
    ['fec0::1', 'site-local'],
    ['ff02::1', 'multicast'],
    ['100::1', 'discard'],
    ['4000::1', 'reserved'],
  ])('IPv6 %s is non-public (%s)', (ip, reason) => {
    expect(classifyIp(ip)).toMatchObject({ version: 6, public: false, reason });
  });

  it('IPv6 public addresses and public embedded IPv4', () => {
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIp('2a00:1450:4001:82b::200e')).toBe(true);
    expect(classifyIp('::ffff:8.8.8.8')).toMatchObject({ public: true, embeddedV4: '8.8.8.8' });
    expect(classifyIp('64:ff9b::808:808')).toMatchObject({ public: true, embeddedV4: '8.8.8.8' });
    expect(classifyIp('2002:0808:0808::1')).toMatchObject({ public: true, embeddedV4: '8.8.8.8' });
  });

  it('rejects malformed input instead of guessing', () => {
    for (const bad of ['', 'localhost', '1.2.3', '1.2.3.4.5', '01.2.3.4', '256.1.1.1', '0x7f000001', '2130706433', '1:2:3:4:5:6:7:8:9', '1::2::3', ':1:2', '::ffff:999.0.0.1', 'gggg::1']) {
      expect(classifyIp(bad)).toBeUndefined();
      expect(isPublicIp(bad)).toBe(false);
    }
    expect(parseIPv6('1::')).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  });
});

describe('outbound policy', () => {
  it('OUTBOUND_ALLOW_PRIVATE defaults to false in production, true elsewhere', () => {
    expect(outboundAllowPrivate({ NODE_ENV: 'production' })).toBe(false);
    expect(outboundAllowPrivate({ NODE_ENV: 'development' })).toBe(true);
    expect(outboundAllowPrivate({ NODE_ENV: 'test' })).toBe(true);
    expect(outboundAllowPrivate({})).toBe(true);
    expect(outboundAllowPrivate({ NODE_ENV: 'production', OUTBOUND_ALLOW_PRIVATE: 'true' })).toBe(true);
    expect(outboundAllowPrivate({ NODE_ENV: 'development', OUTBOUND_ALLOW_PRIVATE: '0' })).toBe(false);
    expect(outboundAllowPrivate({ NODE_ENV: 'production', OUTBOUND_ALLOW_PRIVATE: 'garbage' })).toBe(false);
  });

  it('remoteExcerpt hides remote text in production', () => {
    expect(remoteExcerpt('secret body', 200, { NODE_ENV: 'production' })).toBeUndefined();
    expect(remoteExcerpt('x'.repeat(300), 10, { NODE_ENV: 'development' })).toBe(`${'x'.repeat(10)}…`);
  });
});

describe('assertOutboundUrl (syntactic)', () => {
  it.each(['file:///etc/passwd', 'gopher://127.0.0.1:6379/_INFO', 'ftp://example.com/x', 'data:text/plain,hi', 'javascript:alert(1)', 'ws://example.com', 'dict://example.com:11211/'])('rejects scheme %s', (url) => {
    expect(() => assertOutboundUrl(url)).toThrow(/scheme/);
  });

  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://api.localhost/',
    'http://metadata.google.internal/',
    'http://intranet/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[0:0:0:0:0:ffff:7f00:1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[2002:7f00:1::]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://0x7f000001/',
    'http://2130706433/',
    'http://017700000001/',
    'http://0x7f.0.0.1/',
    'http://0/',
    'http://10.0.0.1:8080/',
    'http://[fd00::1]/',
  ])('rejects private/local target %s', (url) => {
    expect(() => assertOutboundUrl(url)).toThrow(OutboundBlockedError);
  });

  it('URL parser normalizes legacy IPv4 forms (verified)', () => {
    expect(new URL('http://0x7f000001/').hostname).toBe('127.0.0.1');
    expect(new URL('http://2130706433/').hostname).toBe('127.0.0.1');
    expect(new URL('http://017700000001/').hostname).toBe('127.0.0.1');
    expect(new URL('http://[::ffff:127.0.0.1]/').hostname).toBe('[::ffff:7f00:1]');
  });

  it('rejects credentials in URLs and accepts public URLs', () => {
    expect(() => assertOutboundUrl('https://user:pw@example.com/')).toThrow(/credentials/);
    expect(() => assertOutboundUrl('not a url')).toThrow(/Invalid URL/);
    expect(assertOutboundUrl('https://api.example.com:8443/v1').port).toBe('8443');
    expect(assertOutboundUrl('http://8.8.8.8/').hostname).toBe('8.8.8.8');
  });

  it('allowPrivate (dev) still enforces scheme + credentials', () => {
    expect(assertOutboundUrl('http://127.0.0.1:51025', { allowPrivate: true }).port).toBe('51025');
    expect(() => assertOutboundUrl('file:///etc/passwd', { allowPrivate: true })).toThrow(/scheme/);
    expect(() => assertOutboundUrl('http://a:b@localhost', { allowPrivate: true })).toThrow(/credentials/);
  });
});

describe('DNS validation', () => {
  it('rejects host names resolving to private addresses (any of them)', async () => {
    const resolver = resolverFor({ 'evil.example': ['127.0.0.1'], 'mixed.example': ['8.8.8.8', '10.0.0.5'], 'v6.example': ['::ffff:169.254.169.254'], 'ok.example': ['93.184.216.34'] });
    await expect(resolvePublicAddresses('evil.example', { resolver })).rejects.toThrow(/loopback/);
    await expect(resolvePublicAddresses('mixed.example', { resolver })).rejects.toThrow(/private/);
    await expect(resolvePublicAddresses('v6.example', { resolver })).rejects.toThrow(/ipv4-mapped:link-local/);
    await expect(resolvePublicAddresses('ok.example', { resolver })).resolves.toEqual([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertPublicUrl('https://evil.example/hook', { resolver })).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(assertPublicUrl('https://ok.example/hook', { resolver })).resolves.toBeInstanceOf(URL);
  });

  it('the real system resolver: localhost is refused', async () => {
    await expect(resolvePublicAddresses('localhost')).rejects.toThrow(/local/);
    await expect(resolvePublicAddresses('127.0.0.1')).rejects.toThrow(/loopback/);
  });

  it('guarded lookup (net/http agents) honours options.all and family', async () => {
    const resolver = resolverFor({ 'ok.example': ['93.184.216.34', '2606:2800:220:1::1'], 'evil.example': ['10.0.0.1'] });
    const lookup = createGuardedLookup({ resolver }) as unknown as (h: string, o: object, cb: (...a: unknown[]) => void) => void;
    const call = (h: string, o: object) => new Promise<unknown[]>((res) => lookup(h, o, (...args) => res(args)));
    expect(await call('ok.example', { all: true })).toEqual([null, [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }]]);
    expect(await call('ok.example', { family: 6 })).toEqual([null, '2606:2800:220:1::1', 6]);
    const [err] = await call('evil.example', {});
    expect(err).toBeInstanceOf(OutboundBlockedError);
  });
});

describe('connect-time enforcement (real sockets)', () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/big') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('x'.repeat(5000));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ host: req.headers.host, path: req.url }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('the guarded dispatcher dials the validated address (global fetch honours it)', async () => {
    // `pinned.test` does not exist in DNS: success proves the connector used OUR resolution.
    const dispatcher = createGuardedDispatcher({ allowPrivate: true, resolver: resolverFor({ 'pinned.test': ['127.0.0.1'] }) });
    const res = await fetch(`http://pinned.test:${port}/hello`, { dispatcher } as RequestInit);
    expect(await res.json()).toEqual({ host: `pinned.test:${port}`, path: '/hello' });
  });

  it('a host resolving to loopback is refused at connect time', async () => {
    const resolver = resolverFor({ 'rebind.test': ['127.0.0.1'] });
    await expect(guardedFetch(`http://rebind.test:${port}/`, {}, { allowPrivate: false, resolver })).rejects.toSatisfy((e: unknown) => (e as { cause?: unknown }).cause instanceof OutboundBlockedError);
  });

  it('DNS rebinding: public at check time, private at connect time → refused', async () => {
    let calls = 0;
    const resolver: HostResolver = async () => (calls++ === 0 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
    await expect(assertPublicUrl(`http://flip.test:${port}/`, { resolver })).resolves.toBeInstanceOf(URL);
    await expect(guardedFetch(`http://flip.test:${port}/`, {}, { allowPrivate: false, resolver })).rejects.toSatisfy((e: unknown) => (e as { cause?: unknown }).cause instanceof OutboundBlockedError);
  });

  it('IP literals are refused before connecting', async () => {
    await expect(guardedFetch(`http://127.0.0.1:${port}/`, {}, { allowPrivate: false })).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(guardedFetch(`http://[::ffff:7f00:1]:${port}/`, {}, { allowPrivate: false })).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it('httpRequest (provider drivers) surfaces blocks as non-retryable ProviderErrors and caps responses', async () => {
    const prev = process.env.OUTBOUND_ALLOW_PRIVATE;
    process.env.OUTBOUND_ALLOW_PRIVATE = 'false';
    try {
      const err = await httpRequest('sms-http', `http://127.0.0.1:${port}/`).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).retryable).toBe(false);
      expect((err as Error).message).toMatch(/Refusing to connect to 127\.0\.0\.1: loopback/);
      // trusted (platform/env) providers keep working against local services
      await expect(httpRequest('platform', `http://127.0.0.1:${port}/ok`, { network: 'trusted' })).resolves.toMatchObject({ status: 200, data: { path: '/ok' } });
      await expect(httpRequest('platform', `http://127.0.0.1:${port}/big`, { network: 'trusted', maxResponseBytes: 1000 })).rejects.toThrow(/exceeds 1000 bytes/);
    } finally {
      if (prev === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
      else process.env.OUTBOUND_ALLOW_PRIVATE = prev;
    }
  });
});

describe('guardedFetch redirects', () => {
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

  it.each(['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:6379/', 'http://[::ffff:7f00:1]/', 'file:///etc/passwd', 'http://localhost/'])('refuses a redirect to %s', async (target) => {
    const fetchMock = vi.fn(async () => redirect(target));
    await expect(guardedFetch('https://hooks.example/start', {}, { allowPrivate: false, fetch: fetchMock as unknown as typeof fetch, resolver: resolverFor({}) })).rejects.toBeInstanceOf(OutboundBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows at most 3 hops, drops credentials cross-origin, 303 → GET', async () => {
    const seen: Array<{ url: string; method?: string; headers: Record<string, string>; body?: unknown }> = [];
    const responses = [redirect('https://b.example/2', 303), redirect('/3', 307), new Response('done')];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, headers: init.headers as Record<string, string>, body: init.body });
      return responses.shift()!;
    });
    const res = await guardedFetch('https://a.example/1', { method: 'POST', body: 'x', headers: { Authorization: 'Bearer s', 'X-Api-Key': 'k', 'Content-Type': 'text/plain', Accept: 'application/json' } }, { allowPrivate: false, fetch: fetchMock as unknown as typeof fetch });
    expect(await res.text()).toBe('done');
    expect(seen.map((s) => [s.url, s.method])).toEqual([
      ['https://a.example/1', 'POST'],
      ['https://b.example/2', 'GET'],
      ['https://b.example/3', 'GET'],
    ]);
    expect(seen[1]!.headers).toEqual({ Accept: 'application/json' });
    expect(seen[1]!.body).toBeUndefined();
    for (const call of fetchMock.mock.calls) expect((call[1] as RequestInit).redirect).toBe('manual');

    const loop = vi.fn(async () => redirect('https://a.example/again'));
    await expect(guardedFetch('https://a.example/x', {}, { allowPrivate: false, fetch: loop as unknown as typeof fetch })).rejects.toThrow(/Too many redirects/);
    expect(loop).toHaveBeenCalledTimes(4);
  });

  it('maxRedirects: 0 returns the 3xx untouched (webhooks)', async () => {
    const fetchMock = vi.fn(async () => redirect('http://127.0.0.1/'));
    const res = await guardedFetch('https://hooks.example/x', {}, { allowPrivate: false, maxRedirects: 0, fetch: fetchMock as unknown as typeof fetch });
    expect(res.status).toBe(302);
  });
});

describe('readBodyLimited', () => {
  it('truncates or throws past the limit', async () => {
    const big = () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(1000).fill(97)); c.close(); } }));
    const t = await readBodyLimited(big(), 2500, 'truncate');
    expect(t).toMatchObject({ truncated: true });
    expect(t.buffer.length).toBe(2500);
    await expect(readBodyLimited(big(), 2500, 'throw')).rejects.toBeInstanceOf(ResponseTooLargeError);
    await expect(readBodyLimited(new Response('x', { headers: { 'content-length': '999999' } }), 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect((await readBodyLimited(new Response('small'), 10)).buffer.toString()).toBe('small');
  });
});

describe('httpRequest error bodies', () => {
  it('never echoes remote bodies in production unless the endpoint is a fixed vendor API', async () => {
    const env = { ...process.env };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'root:x:0:0:root:/root:/bin/bash' }), { status: 500, headers: { 'content-type': 'application/json' } })));
    try {
      process.env.NODE_ENV = 'production';
      process.env.OUTBOUND_ALLOW_PRIVATE = 'true'; // skip the dispatcher (fetch is stubbed)
      const err = (await httpRequest('http', 'https://gateway.example/send').catch((e: unknown) => e)) as Error;
      expect(err.message).toBe('http: HTTP 500 (remote error details hidden)');
      const vendor = (await httpRequest('vercel', 'https://api.vercel.com/x', { revealErrorBody: true }).catch((e: unknown) => e)) as Error;
      expect(vendor.message).toMatch(/root:x:0:0/);
      process.env.NODE_ENV = 'development';
      const dev = (await httpRequest('http', 'https://gateway.example/send').catch((e: unknown) => e)) as Error;
      expect(dev.message).toMatch(/HTTP 500 — root:x/);
    } finally {
      process.env = env;
      vi.unstubAllGlobals();
    }
  });
});

describe('SMTP target validation', () => {
  const resolver = resolverFor({ 'smtp.example.com': ['203.0.114.10'], 'evil.example.com': ['192.168.1.10'], 'v6.example.com': ['::1'] });

  it('allows the SMTP port allow-list and returns the validated IP + servername', async () => {
    for (const port of [25, 465, 587, 2525]) await expect(resolveSmtpTarget('smtp.example.com', port, { resolver })).resolves.toEqual({ host: '203.0.114.10', port, servername: 'smtp.example.com' });
    await expect(resolveSmtpTarget('8.8.8.8', 587)).resolves.toEqual({ host: '8.8.8.8', port: 587, servername: undefined });
  });

  it('rejects other ports, private targets and junk', async () => {
    await expect(resolveSmtpTarget('smtp.example.com', 22, { resolver })).rejects.toThrow(/port 22 is not allowed/);
    await expect(resolveSmtpTarget('smtp.example.com', 6379, { resolver })).rejects.toThrow(/not allowed/);
    await expect(resolveSmtpTarget('evil.example.com', 587, { resolver })).rejects.toThrow(/private/);
    await expect(resolveSmtpTarget('v6.example.com', 587, { resolver })).rejects.toThrow(/loopback/);
    await expect(resolveSmtpTarget('127.0.0.1', 25)).rejects.toThrow(/loopback/);
    await expect(resolveSmtpTarget('localhost', 25)).rejects.toThrow(/local/);
    await expect(resolveSmtpTarget('a b', 25)).rejects.toThrow(/Invalid SMTP host/);
  });

  it('allowPrivate (dev) permits mailpit on a custom port', async () => {
    await expect(resolveSmtpTarget('127.0.0.1', 51025, { allowPrivate: true })).resolves.toMatchObject({ host: '127.0.0.1', port: 51025 });
  });
});
