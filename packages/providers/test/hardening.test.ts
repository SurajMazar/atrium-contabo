import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { maskSecret, ProviderError, TRUSTED_CONTEXT } from '../src/driver';
import { instantiateProvider } from '../src/registry';
import { publicTestResult, secretReentryDecision, isSuppliedSecret } from '../src/safety';
import { LocalStorageProvider, localStorageConfigSchema } from '../src/storage/local';
import { assertAzureEndpoint, azureConnectionStringEndpoint, AzureBlobStorageProvider, azureConfigSchema } from '../src/storage/azure';
import { s3ConfigSchema } from '../src/storage/s3';
import { r2ConfigSchema, r2Endpoint } from '../src/storage/r2';
import { captchaConfigSchema, matchesExpectedHostname, SiteverifyCaptcha } from '../src/captcha/drivers';
import { SmtpEmailProvider, smtpConfigSchema } from '../src/email/smtp';

describe('maskSecret', () => {
  it('reveals nothing for short secrets, last 4 otherwise', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret(undefined)).toBe('');
    expect(maskSecret('hunter2')).toBe('••••••••');
    expect(maskSecret('elevenchars')).toBe('••••••••');
    expect(maskSecret('twelve-chars')).toBe('••••••••hars');
    expect(maskSecret('sk_live_1234567890abcd')).toBe('••••••••abcd');
  });
});

describe('local storage containment (UPL-1)', () => {
  let root: string;
  let outside: string;
  const env = () => ({ LOCAL_STORAGE_DIR: root, NODE_ENV: 'development' });
  const tenant = (config: Record<string, unknown> = {}, orgId = 'org_1') =>
    new LocalStorageProvider(localStorageConfigSchema.parse({ publicBaseUrl: 'http://localhost:4000/v1/storage', ...config }), { signingSecret: 'local-signing-secret-123' }, { network: 'public-only', organizationId: orgId, env: env() });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'atrium-jail-'));
    outside = await mkdtemp(join(tmpdir(), 'atrium-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'top secret');
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('ignores a tenant-chosen directory and jails objects to orgs/<id>', async () => {
    const p = tenant({ directory: outside });
    await p.upload({ key: 'media/a.txt', body: Buffer.from('hi'), contentType: 'text/plain' });
    expect(await readFile(join(root, 'orgs', 'org_1', 'media', 'a.txt'), 'utf8')).toBe('hi');
    expect(p.getPublicUrl('media/a.txt')).toBe('http://localhost:4000/v1/storage/orgs/org_1/media/a.txt');
    // an absolute-looking key stays inside the jail
    await p.upload({ key: '/etc/passwd', body: Buffer.from('x'), contentType: 'text/plain' });
    expect(await readFile(join(root, 'orgs', 'org_1', 'etc', 'passwd'), 'utf8')).toBe('x');
  });

  it('rejects traversal in keys and key prefixes', async () => {
    const p = tenant();
    await expect(p.download('../../outside/secret.txt')).rejects.toThrow(/invalid object key/);
    await expect(p.download('a/../../b')).rejects.toThrow(/invalid object key/);
    expect(() => p.pathFor('..\\..\\x')).toThrow(/invalid object key/);
    const prefixed = tenant({ keyPrefix: '../../..' });
    expect(() => prefixed.pathFor('etc/passwd')).toThrow(/invalid object key/);
    // another org can never be addressed
    expect(() => tenant({}, '../org_2').pathFor('x')).toThrow(/invalid organization id/);
  });

  it('rejects symlink escapes (directory and file links)', async () => {
    const p = tenant();
    await mkdir(join(root, 'orgs', 'org_1'), { recursive: true });
    await symlink(outside, join(root, 'orgs', 'org_1', 'linkdir'));
    await symlink(join(outside, 'secret.txt'), join(root, 'orgs', 'org_1', 'linkfile.txt'));
    await expect(p.download('linkdir/secret.txt')).rejects.toThrow(/escapes storage root/);
    await expect(p.upload({ key: 'linkdir/new.txt', body: Buffer.from('pwn'), contentType: 'text/plain' })).rejects.toThrow(/escapes storage root/);
    await expect(p.download('linkfile.txt')).rejects.toThrow(/escapes storage root/);
    await expect(p.copy('media/a.txt', 'linkfile.txt')).rejects.toThrow(/escapes storage root/);
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('top secret');
  });

  it('is unavailable to organizations in production and requires an organization id', () => {
    const cfg = localStorageConfigSchema.parse({ publicBaseUrl: 'http://x' });
    expect(() => new LocalStorageProvider(cfg, {}, { network: 'public-only', organizationId: 'org_1', env: { NODE_ENV: 'production', LOCAL_STORAGE_DIR: root } })).toThrow(/not available/);
    expect(() => new LocalStorageProvider(cfg, {}, { network: 'public-only', env: env() })).toThrow(/requires an organization id/);
    // the default context (no ctx) is tenant/public-only — fail closed
    expect(() => instantiateProvider('storage', 'local', { publicBaseUrl: 'http://x', directory: '/' }, {})).toThrow(ProviderError);
    // platform (env) configuration keeps its directory
    const platform = new LocalStorageProvider(localStorageConfigSchema.parse({ directory: root, publicBaseUrl: 'http://x' }), {}, TRUSTED_CONTEXT);
    expect(platform.pathFor('a/b.txt')).toBe(join(root, 'a', 'b.txt'));
  });
});

describe('secret re-entry rule (INT-1)', () => {
  const base = { existingDriver: 'smtp', nextDriver: 'smtp', existingConfig: { host: 'smtp.example.com', port: 587, pool: true }, existingSecretKeys: ['password'] };

  it('unchanged endpoint → stored secrets may be kept', () => {
    expect(secretReentryDecision({ ...base, nextConfig: { host: 'smtp.example.com', port: 587, pool: false }, incomingSecrets: undefined })).toMatchObject({ ok: true, changed: [] });
  });

  it('changed endpoint-like field without new secrets → rejected', () => {
    for (const nextConfig of [{ ...base.existingConfig, host: 'attacker.example' }, { ...base.existingConfig, port: 2525 }]) {
      expect(secretReentryDecision({ ...base, nextConfig, incomingSecrets: undefined })).toMatchObject({ ok: false, missing: ['password'] });
      expect(secretReentryDecision({ ...base, nextConfig, incomingSecrets: { password: '••••••••' } })).toMatchObject({ ok: false, missing: ['password'] });
      expect(secretReentryDecision({ ...base, nextConfig, incomingSecrets: { password: '' } })).toMatchObject({ ok: false });
      expect(secretReentryDecision({ ...base, nextConfig, incomingSecrets: { password: 'new-password' } })).toMatchObject({ ok: true, replaceSecrets: false });
      expect(secretReentryDecision({ ...base, nextConfig, incomingSecrets: { password: null } })).toMatchObject({ ok: true });
    }
  });

  it('nested endpoint fields and every stored secret are checked', () => {
    const d = secretReentryDecision({
      existingDriver: 'http',
      nextDriver: 'http',
      existingConfig: { url: 'https://gw.example/send' },
      nextConfig: { url: 'https://evil.example/send' },
      existingSecretKeys: ['headers', 'token'],
      incomingSecrets: { headers: { Authorization: '••••••••abcd' }, token: 'fresh' },
    });
    expect(d).toMatchObject({ ok: false, missing: ['headers'], changed: ['url'] });
  });

  it('driver change → new secrets required and old ones discarded', () => {
    const changed = { ...base, nextDriver: 'resend', nextConfig: { baseUrl: 'https://api.resend.com' } };
    expect(secretReentryDecision({ ...changed, incomingSecrets: {} })).toMatchObject({ ok: false, missing: ['password'], replaceSecrets: true });
    expect(secretReentryDecision({ ...changed, incomingSecrets: { apiKey: 're_new_key_123' } })).toMatchObject({ ok: true, replaceSecrets: true });
  });

  it('no stored secrets → nothing to redirect', () => {
    expect(secretReentryDecision({ ...base, existingSecretKeys: [], nextConfig: { host: 'other.example' }, incomingSecrets: undefined }).ok).toBe(true);
  });

  it('isSuppliedSecret', () => {
    expect(isSuppliedSecret('••••abcd')).toBe(false);
    expect(isSuppliedSecret(undefined)).toBe(false);
    expect(isSuppliedSecret('x')).toBe(true);
    expect(isSuppliedSecret(null)).toBe(true);
    expect(isSuppliedSecret({ A: 'a', B: '••••' })).toBe(false);
    expect(isSuppliedSecret({ A: 'a' })).toBe(true);
  });
});

describe('publicTestResult (provider test endpoint)', () => {
  const prod = { NODE_ENV: 'production' };
  it('production failures expose only a generic message + status/code', () => {
    expect(publicTestResult({ ok: false, message: 'http: HTTP 404 — <html>internal admin panel</html>' }, prod)).toEqual({ ok: false, message: 'Connection test failed (HTTP 404)' });
    expect(publicTestResult({ ok: false, message: 'smtp: Invalid greeting. response=SSH-2.0-OpenSSH_9.6: SSH-2.0-OpenSSH_9.6 (ECONNECTION)' }, prod)).toEqual({ ok: false, message: 'Connection test failed (ECONNECTION)' });
    expect(publicTestResult({ ok: false, message: 's3: Refusing to connect to 10.0.0.5: private address' }, prod).message).toMatch(/not allowed.*EOUTBOUNDBLOCKED/);
    expect(publicTestResult({ ok: false, message: 'anything else', details: { secret: 1 } }, prod)).toEqual({ ok: false, message: 'Connection test failed' });
  });
  it('development keeps a short excerpt; successes pass through', () => {
    const long = `http: HTTP 500 — ${'x'.repeat(1000)}`;
    expect(publicTestResult({ ok: false, message: long }, { NODE_ENV: 'development' }).message.length).toBeLessThanOrEqual(301);
    expect(publicTestResult({ ok: true, message: 'SMTP connection verified', details: { id: 1 } }, prod)).toEqual({ ok: true, message: 'SMTP connection verified', details: { id: 1 } });
  });
});

describe('captcha hardening (INT-6)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: object) => vi.fn(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));

  it('ignores a stored verifyUrl and always calls the vendor endpoint', async () => {
    const fetchMock = reply({ success: true, hostname: 'shop.example.com' });
    vi.stubGlobal('fetch', fetchMock);
    const config = captchaConfigSchema.parse({ siteKey: 'k', verifyUrl: 'http://127.0.0.1:9/always-yes' });
    expect(config).not.toHaveProperty('verifyUrl');
    const v = new SiteverifyCaptcha('turnstile', config, { secretKey: 's' });
    await v.verify({ token: 't' });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });

  it('requires the vendor-reported hostname to match expectedHostnames when given', async () => {
    vi.stubGlobal('fetch', reply({ success: true, hostname: 'evil.example' }));
    const v = new SiteverifyCaptcha('hcaptcha', captchaConfigSchema.parse({ siteKey: 'k' }), { secretKey: 's' });
    expect(await v.verify({ token: 't', expectedHostnames: ['shop.example.com', 'shop.sites.atrium.app'] })).toMatchObject({ success: false, errorCodes: ['hostname-mismatch'] });
    expect(await v.verify({ token: 't' })).toMatchObject({ success: true }); // backwards compatible
    vi.stubGlobal('fetch', reply({ success: true, hostname: 'SHOP.example.com' }));
    expect(await v.verify({ token: 't', expectedHostnames: ['shop.example.com'] })).toMatchObject({ success: true });
    vi.stubGlobal('fetch', reply({ success: true }));
    expect(await v.verify({ token: 't', expectedHostnames: ['shop.example.com'] })).toMatchObject({ success: true });
  });

  it('matchesExpectedHostname', () => {
    expect(matchesExpectedHostname('a.example.com', ['a.example.com'])).toBe(true);
    expect(matchesExpectedHostname('a.example.com:443', ['a.example.com.'])).toBe(true);
    expect(matchesExpectedHostname('b.a.example.com', ['a.example.com'])).toBe(false);
    expect(matchesExpectedHostname('b.a.example.com', ['*.a.example.com'])).toBe(true);
    expect(matchesExpectedHostname('a.example.com', ['*.a.example.com'])).toBe(false);
    expect(matchesExpectedHostname('evila.example.com', ['*.a.example.com'])).toBe(false);
  });
});

describe('storage endpoint restrictions', () => {
  it('S3 region/bucket must be host-name safe', () => {
    expect(s3ConfigSchema.safeParse({ bucket: 'b', region: 'us-east-1' }).success).toBe(true);
    expect(s3ConfigSchema.safeParse({ bucket: 'b', region: 'auto' }).success).toBe(true);
    expect(s3ConfigSchema.safeParse({ bucket: 'b', region: 'x.evil.com#' }).success).toBe(false);
    expect(s3ConfigSchema.safeParse({ bucket: 'a/b', region: 'us-east-1' }).success).toBe(false);
  });

  it('R2: endpoint from account id + jurisdiction, validated config, presigned URLs on the R2 host', async () => {
    const acct = '0123456789abcdef0123456789ABCDEF';
    expect(r2Endpoint(acct)).toBe('https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
    expect(r2Endpoint(acct, 'eu')).toBe('https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com');
    expect(r2Endpoint(acct, 'fedramp')).toBe('https://0123456789abcdef0123456789abcdef.fedramp.r2.cloudflarestorage.com');
    const base = { accountId: acct, bucket: 'atrium-media', accessKeyId: 'AKID', publicUrl: 'https://media.example.com' };
    expect(r2ConfigSchema.safeParse(base).success).toBe(true);
    // The account id becomes part of the host name: anything but 32 hex characters is refused.
    expect(r2ConfigSchema.safeParse({ ...base, accountId: 'evil.com#' }).success).toBe(false);
    expect(r2ConfigSchema.safeParse({ ...base, bucket: 'Bad_Bucket' }).success).toBe(false);
    expect(r2ConfigSchema.safeParse({ ...base, jurisdiction: 'apac' }).success).toBe(false);
    // R2's S3 endpoint is never public: a (https) public URL is required.
    expect(r2ConfigSchema.safeParse({ ...base, publicUrl: undefined }).success).toBe(false);
    expect(r2ConfigSchema.safeParse({ ...base, publicUrl: 'http://media.example.com' }).success).toBe(false);
    expect(() => instantiateProvider('storage', 'r2', base, {})).toThrow();

    const r2 = instantiateProvider('storage', 'r2', { ...base, jurisdiction: 'eu', keyPrefix: 'prod' }, { secretAccessKey: 'secret' });
    expect(r2.driver).toBe('r2');
    expect(r2.getPublicUrl('media/o/a b.png')).toBe('https://media.example.com/prod/media/o/a%20b.png');
    const signed = new URL(await r2.getSignedUrl('private/x.pdf', { expiresInSeconds: 120 }));
    expect(signed.host).toBe('0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com');
    expect(signed.pathname).toBe('/atrium-media/prod/private/x.pdf');
    expect(signed.searchParams.get('X-Amz-Credential')).toMatch(/^AKID\/\d{8}\/auto\/s3\/aws4_request$/);
    const put = await r2.getUploadUrl('media/o/b.png', 'image/png');
    expect(new URL(put.url).searchParams.has('x-amz-acl')).toBe(false);
  });

  it('R2: changing the account, jurisdiction or bucket requires re-entering the secret', () => {
    const cfg = { accountId: 'a'.repeat(32), bucket: 'b-1', accessKeyId: 'k', publicUrl: 'https://m.example.com', jurisdiction: 'default' };
    for (const change of [{ jurisdiction: 'eu' }, { accountId: 'b'.repeat(32) }, { bucket: 'b-2' }]) {
      const d = secretReentryDecision({ existingDriver: 'r2', nextDriver: 'r2', existingConfig: cfg, nextConfig: { ...cfg, ...change }, existingSecretKeys: ['secretAccessKey'], incomingSecrets: undefined });
      expect(d.ok).toBe(false);
    }
    expect(secretReentryDecision({ existingDriver: 'r2', nextDriver: 'r2', existingConfig: cfg, nextConfig: { ...cfg, publicUrl: 'https://cdn.example.com' }, existingSecretKeys: ['secretAccessKey'], incomingSecrets: undefined }).ok).toBe(true);
  });

  it('tenant S3 endpoints on private IP literals are refused before connecting', async () => {
    const prev = process.env.OUTBOUND_ALLOW_PRIVATE;
    process.env.OUTBOUND_ALLOW_PRIVATE = 'false';
    try {
      const s3 = instantiateProvider('storage', 's3', { bucket: 'b', endpoint: 'http://169.254.169.254', forcePathStyle: true, accessKeyId: 'a' }, { secretAccessKey: 's' });
      await expect(s3.download('x')).rejects.toThrow(/endpoint rejected.*link-local/);
    } finally {
      if (prev === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
      else process.env.OUTBOUND_ALLOW_PRIVATE = prev;
    }
  });

  it('Azure endpoints must be real Azure blob hosts', async () => {
    expect(assertAzureEndpoint('https://acct.blob.core.windows.net').hostname).toBe('acct.blob.core.windows.net');
    expect(() => assertAzureEndpoint('http://acct.blob.core.windows.net')).toThrow(/https/);
    expect(() => assertAzureEndpoint('https://evil.example/blob.core.windows.net')).toThrow(/must end with/);
    expect(() => assertAzureEndpoint('https://blob.core.windows.net.evil.example')).toThrow(/must end with/);
    expect(() => assertAzureEndpoint('https://127.0.0.1:10000/devstoreaccount1')).toThrow();
    expect(azureConnectionStringEndpoint('DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=k;EndpointSuffix=core.windows.net')).toBe('https://acct.blob.core.windows.net');
    expect(azureConnectionStringEndpoint('BlobEndpoint=http://10.0.0.1:10000/x;AccountName=acct')).toBe('http://10.0.0.1:10000/x');
    expect(azureConnectionStringEndpoint('UseDevelopmentStorage=true')).toMatch(/127\.0\.0\.1/);

    const prev = process.env.OUTBOUND_ALLOW_PRIVATE;
    process.env.OUTBOUND_ALLOW_PRIVATE = 'false';
    try {
      const az = new AzureBlobStorageProvider(azureConfigSchema.parse({ accountName: 'acct', container: 'media' }), { connectionString: 'BlobEndpoint=http://10.0.0.1:10000/x;AccountName=acct;AccountKey=a2V5' });
      await expect(az.exists('x')).rejects.toThrow(/endpoint/);
      expect(azureConfigSchema.safeParse({ accountName: 'evil.example#', container: 'media' }).success).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
      else process.env.OUTBOUND_ALLOW_PRIVATE = prev;
    }
  });
});

describe('SMTP driver (tenant vs platform)', () => {
  it('tenant SMTP to a private host / disallowed port fails before connecting', async () => {
    const prev = process.env.OUTBOUND_ALLOW_PRIVATE;
    process.env.OUTBOUND_ALLOW_PRIVATE = 'false';
    try {
      const p = new SmtpEmailProvider(smtpConfigSchema.parse({ host: '127.0.0.1', port: 25, pool: false }), {});
      const res = await p.test();
      expect(res).toMatchObject({ ok: false });
      expect(res.message).toMatch(/loopback/);
      const port = new SmtpEmailProvider(smtpConfigSchema.parse({ host: '8.8.8.8', port: 6379, pool: false }), {});
      expect((await port.test()).message).toMatch(/port 6379 is not allowed/);
    } finally {
      if (prev === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
      else process.env.OUTBOUND_ALLOW_PRIVATE = prev;
    }
  });
});
