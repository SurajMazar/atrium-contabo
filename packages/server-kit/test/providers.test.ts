import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptJson, decryptJson } from '../src/crypto';
import { mergeSecrets, ProviderResolver, serializeProviderRecord, type ResolverPrisma } from '../src/providers';
import { enqueue, JOB_SCHEMAS, parseJobPayload, DEFAULT_JOB_OPTIONS, JOB_QUEUE, QUEUES } from '../src/queues';
import { pino } from 'pino';
import { redactDeep, createLogger, REDACT_PATHS } from '../src/logger';
import { loadEnv, boolish } from '../src/env';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

const now = new Date('2026-01-01T00:00:00Z');

function row(over: Record<string, unknown>) {
  return { id: 'p1', organizationId: 'org1', websiteId: null, name: 'Row', driver: 'smtp', config: {}, secretsEnc: null, isDefault: false, updatedAt: now, ...over };
}

/** In-memory prisma mock: findFirst filters rows by where-equality and honours orderBy isDefault desc. */
function delegate<T extends Record<string, unknown>>(rows: T[]) {
  return {
    findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
      let list = rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      if (Array.isArray(orderBy)) list = [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
      return (list[0] ?? null) as T | null;
    }),
  };
}

function prisma(data: Partial<Record<keyof ResolverPrisma, Record<string, unknown>[]>>, website?: Record<string, unknown>): ResolverPrisma {
  return {
    emailProvider: delegate(data.emailProvider ?? []),
    smsProvider: delegate(data.smsProvider ?? []),
    storageProvider: delegate(data.storageProvider ?? []),
    integration: delegate(data.integration ?? []),
    website: { findUnique: vi.fn(async () => (website ?? null) as never) },
  } as unknown as ResolverPrisma;
}

const platformEnv = {
  SMTP_HOST: 'localhost',
  SMTP_PORT: '51025',
  MAIL_FROM: 'Atrium <no-reply@atrium.localhost>',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'atrium-media',
  S3_ENDPOINT: 'http://localhost:59000',
  S3_FORCE_PATH_STYLE: 'true',
  S3_PUBLIC_URL: 'http://localhost:59000/atrium-media',
  S3_ACCESS_KEY_ID: 'atrium',
  S3_SECRET_ACCESS_KEY: 'atrium-secret',
  AI_DEFAULT_PROVIDER: 'openai',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  PLATFORM_SITES_DOMAIN: 'sites.localhost:3001',
};

describe('ProviderResolver', () => {
  it('email: explicit → website → org default → platform', async () => {
    const secretsEnc = encryptJson({ apiKey: 're_live' });
    const db = prisma({
      emailProvider: [
        row({ id: 'org-default', driver: 'resend', isDefault: true, fromEmail: 'org@x.com', fromName: 'Org', secretsEnc }),
        row({ id: 'site', driver: 'resend', websiteId: 'w1', fromEmail: 'site@x.com', fromName: null, secretsEnc }),
        row({ id: 'other', driver: 'resend', fromEmail: 'other@x.com', fromName: null, secretsEnc }),
      ],
    });
    const r = new ProviderResolver(db, { env: platformEnv });
    expect((await r.email({ organizationId: 'org1', providerId: 'other' })).id).toBe('other');
    const site = await r.email({ organizationId: 'org1', websiteId: 'w1' });
    expect(site).toMatchObject({ id: 'site', source: 'website', from: { email: 'site@x.com' }, driver: 'resend' });
    expect(await r.email({ organizationId: 'org1', websiteId: 'w2' })).toMatchObject({ id: 'org-default', source: 'organization', from: { email: 'org@x.com', name: 'Org' } });
    const platform = await r.email({ organizationId: null });
    expect(platform).toMatchObject({ id: null, source: 'platform', driver: 'smtp', from: { email: 'no-reply@atrium.localhost', name: 'Atrium' } });
    await expect(r.email({ organizationId: 'org1', providerId: 'nope' })).rejects.toThrow(/not found/);
  });

  it('email: org without providers falls back to platform SMTP; missing SMTP throws', async () => {
    const r = new ProviderResolver(prisma({}), { env: platformEnv });
    expect((await r.email({ organizationId: 'org1' })).source).toBe('platform');
    await expect(new ProviderResolver(prisma({}), { env: {} }).email({ organizationId: 'org1' })).rejects.toThrow(/SMTP_HOST/);
  });

  it('caches instances per row+updatedAt and invalidates by id', async () => {
    const db = prisma({ smsProvider: [row({ id: 's1', driver: 'twilio', isDefault: true, config: { accountSid: `AC${'0'.repeat(32)}`, from: '+15005550006' }, secretsEnc: encryptJson({ authToken: 't' }) })] });
    const r = new ProviderResolver(db, { env: {} });
    const a = await r.sms({ organizationId: 'org1' });
    const b = await r.sms({ organizationId: 'org1' });
    expect(a.provider).toBe(b.provider);
    r.invalidate('s1');
    const c = await r.sms({ organizationId: 'org1' });
    expect(c.provider).not.toBe(a.provider);
    await expect(new ProviderResolver(prisma({}), { env: {} }).sms({ organizationId: 'org1' })).rejects.toThrow(/No SMS provider/);
  });

  it('storage: org default or platform env (s3/local)', async () => {
    const r = new ProviderResolver(prisma({}), { env: platformEnv });
    const s = await r.storage({ organizationId: 'org1' });
    expect(s).toMatchObject({ source: 'platform', driver: 's3' });
    expect(s.provider.getPublicUrl('a/b.png')).toBe('http://localhost:59000/atrium-media/a/b.png');
    const local = await new ProviderResolver(prisma({}), { env: { STORAGE_DRIVER: 'local', LOCAL_STORAGE_PUBLIC_URL: 'http://api/v1/storage', ENCRYPTION_KEY: process.env.ENCRYPTION_KEY } }).storage();
    expect(local.driver).toBe('local');
    expect(await local.provider.getSignedUrl('x.png')).toMatch(/^http:\/\/api\/v1\/storage\/x\.png\?expires=\d+&sig=/);
    const org = new ProviderResolver(prisma({ storageProvider: [row({ id: 'st', driver: 'local', isDefault: true, config: { directory: '/tmp/x', publicBaseUrl: 'https://cdn' } })] }), { env: platformEnv });
    const orgStorage = await org.storage({ organizationId: 'org1' });
    expect(orgStorage.id).toBe('st');
    // UPL-1: tenant local storage ignores its directory and is jailed to orgs/<organizationId>
    expect(orgStorage.getPublicUrl('a.png')).toBe('https://cdn/orgs/org1/a.png');
    const prodOrg = new ProviderResolver(prisma({ storageProvider: [row({ id: 'st', driver: 'local', isDefault: true, config: { publicBaseUrl: 'https://cdn' } })] }), { env: { ...platformEnv, NODE_ENV: 'production' } });
    await expect(prodOrg.storage({ organizationId: 'org1' })).rejects.toThrow(/not available for organization storage in production/);
  });

  it('tenant rows are public-only; platform (env) providers are trusted', async () => {
    const prev = process.env.OUTBOUND_ALLOW_PRIVATE;
    process.env.OUTBOUND_ALLOW_PRIVATE = 'false';
    try {
      const db = prisma({ emailProvider: [row({ id: 'smtp1', driver: 'smtp', isDefault: true, fromEmail: 'a@x.com', fromName: null, config: { host: '127.0.0.1', port: 51025, pool: false } })] });
      const tenant = await new ProviderResolver(db, { env: platformEnv }).email({ organizationId: 'org1' });
      expect(await tenant.test()).toMatchObject({ ok: false, message: expect.stringMatching(/not allowed|loopback/) });
      // the platform SMTP (mailpit on localhost) is not subject to the guard
      const platform = new ProviderResolver(prisma({}), { env: platformEnv }).platformEmail();
      const res = await platform.test();
      expect(res.message).not.toMatch(/Refusing to connect|not allowed/);
    } finally {
      if (prev === undefined) delete process.env.OUTBOUND_ALLOW_PRIVATE;
      else process.env.OUTBOUND_ALLOW_PRIVATE = prev;
    }
  });

  it('ai: integration first, then platform keys honouring AI_DEFAULT_PROVIDER with fallback to available keys', async () => {
    const r = new ProviderResolver(prisma({ integration: [row({ id: 'ai1', kind: 'AI', enabled: true, driver: 'anthropic', isDefault: true, secretsEnc: encryptJson({ apiKey: 'org-key' }) })] }), { env: platformEnv });
    expect(await r.ai({ organizationId: 'org1' })).toMatchObject({ id: 'ai1', driver: 'anthropic', source: 'organization' });
    const p = new ProviderResolver(prisma({}), { env: platformEnv });
    // openai preferred but no key → anthropic
    expect(await p.ai({ organizationId: 'org1' })).toMatchObject({ source: 'platform', driver: 'anthropic' });
    await expect(new ProviderResolver(prisma({}), { env: {} }).ai()).rejects.toThrow(/No AI provider/);
  });

  it('captcha: by kind; null when none', async () => {
    const r = new ProviderResolver(
      prisma({ integration: [row({ id: 'c1', kind: 'CAPTCHA', enabled: true, driver: 'turnstile', websiteId: 'w1', config: { siteKey: 'site-key' }, secretsEnc: encryptJson({ secretKey: 's' }) })] }),
      { env: {} },
    );
    const c = await r.captcha({ organizationId: 'org1', websiteId: 'w1', kind: 'turnstile' });
    expect(c.siteKey).toBe('site-key'); // usable directly as a CaptchaVerifier
    expect(c.provider.siteKey).toBe('site-key');
    expect(c).toMatchObject({ id: 'c1', source: 'website', driver: 'turnstile' });
    expect(typeof c.verify).toBe('function');
    await expect(r.captcha({ organizationId: 'org1', websiteId: 'w1', kind: 'hcaptcha' })).rejects.toThrow(/No hcaptcha integration/);
    expect(await r.findCaptcha({ organizationId: 'org1', websiteId: 'w1', kind: 'hcaptcha' })).toBeNull();
    expect(await r.findCaptcha({ organizationId: 'org1', websiteId: 'w1', kind: 'none' })).toBeNull();
  });

  it('deployment: website integration, no platform vercel token fallback for tenants, self-hosted', async () => {
    const db = prisma(
      { integration: [row({ id: 'd1', kind: 'DEPLOYMENT', enabled: true, driver: 'vercel', secretsEnc: encryptJson({ token: 'vt' }) })] },
      { id: 'w1', organizationId: 'org1', deploymentIntegrationId: 'd1', deploymentProvider: 'vercel' },
    );
    const r = new ProviderResolver(db, { env: platformEnv });
    expect(await r.deployment({ organizationId: 'org1', websiteId: 'w1' })).toMatchObject({ id: 'd1', source: 'explicit', driver: 'vercel' });
    // INT-7: the platform VERCEL_TOKEN must never be used for tenant-scoped deployments
    const platformVercel = new ProviderResolver(prisma({}), { env: { VERCEL_TOKEN: 'tok' } });
    await expect(platformVercel.deployment({ organizationId: 'org1' })).rejects.toThrow(/No deployment integration/);
    await expect(new ProviderResolver(prisma({}), { env: {} }).deployment({ organizationId: 'org1' })).rejects.toThrow(/No deployment integration/);
    const self = r.platformDeployment();
    const info = await self.deploy({ projectName: 'my-site', target: 'production', files: [], framework: 'nextjs' });
    expect(info).toMatchObject({ status: 'ready', url: 'http://my-site.sites.localhost:3001' });
  });

  it('wraps decryption failures without leaking ciphertext', async () => {
    const db = prisma({ smsProvider: [row({ id: 'bad', driver: 'twilio', isDefault: true, config: { accountSid: `AC${'0'.repeat(32)}` }, secretsEnc: 'v1:default:aaa:bbb:ccc' })] });
    await expect(new ProviderResolver(db, { env: {} }).sms({ organizationId: 'org1' })).rejects.toThrow(/Could not decrypt secrets for provider bad/);
  });
});

describe('serializeProviderRecord + mergeSecrets', () => {
  it('masks secrets and drops ciphertext', () => {
    const out = serializeProviderRecord({ id: 'x', driver: 'smtp', secretsEnc: encryptJson({ password: 'supersecret', headers: { Authorization: 'Bearer abcdef' } }) });
    expect(out).not.toHaveProperty('secretsEnc');
    expect(out.hasSecrets).toBe(true);
    // short secrets (< 12 chars) reveal nothing; longer ones only their last 4 characters
    expect(out.secrets).toEqual({ password: '••••••••', headers: { Authorization: '••••••••cdef' } });
    expect(JSON.stringify(out)).not.toContain('supersecret');
    expect(serializeProviderRecord({ id: 'y', secretsEnc: 'broken' })).toMatchObject({ secrets: {}, hasSecrets: true, secretsError: true });
    expect(serializeProviderRecord({ id: 'z', secretsEnc: null })).toMatchObject({ secrets: {}, hasSecrets: false });
  });

  it('keeps existing values for missing/masked/empty, replaces new, removes null', () => {
    const existing = encryptJson({ apiKey: 'old-key', token: 'old-token', headers: { A: 'a', B: 'b' } });
    const merged = mergeSecrets(existing, { apiKey: '••••••••-key', token: 'new-token', extra: '', headers: { A: '••••a', B: null, C: 'c' } });
    expect(decryptJson(merged!)).toEqual({ apiKey: 'old-key', token: 'new-token', headers: { A: 'a', C: 'c' } });
    expect(mergeSecrets(existing, undefined)).toBe(existing);
    expect(mergeSecrets(null, { apiKey: 'k' })).not.toBeNull();
    expect(mergeSecrets(encryptJson({ apiKey: 'k' }), { apiKey: null })).toBeNull();
  });
});

describe('queues', () => {
  it('validates payloads and routes jobs with defaults', async () => {
    expect(() => parseJobPayload('email.send', { message: { to: [], subject: 'x' } })).toThrow();
    const p = parseJobPayload('email.send', { organizationId: null, message: { to: [{ email: 'a@b.co' }], subject: 'Reset', text: 'x' }, context: { kind: 'password-reset' } });
    expect(p.organizationId).toBeNull();
    expect(parseJobPayload('deployment.poll', { deploymentId: 'd' }).attempt).toBe(0);
    expect(DEFAULT_JOB_OPTIONS['webhook.deliver']).toMatchObject({ attempts: 8, backoff: { type: 'exponential', delay: 30_000 } });
    expect(DEFAULT_JOB_OPTIONS['email.send']).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 5_000 } });
    expect(JOB_QUEUE['form.process']).toBe(QUEUES.formRules);
    expect(Object.keys(JOB_SCHEMAS)).toHaveLength(11);
    const add = vi.fn(async () => ({ id: '1' }));
    await enqueue({ [QUEUES.webhook]: { add } } as never, 'webhook.deliver', { deliveryId: 'd1' }, { jobId: 'wd-d1' });
    expect(add).toHaveBeenCalledWith('webhook.deliver', { deliveryId: 'd1' }, expect.objectContaining({ attempts: 8, jobId: 'wd-d1' }));
    await expect(enqueue({}, 'media.process', { mediaId: 'm' })).rejects.toThrow(/not available/);
  });
});

describe('logger + env', () => {
  it('redactDeep masks secret-like keys', () => {
    expect(redactDeep({ user: 'a', password: 'p', nested: { apiKey: 'k', list: [{ token: 't', ok: 1 }] }, mfaEnabled: true })).toEqual({
      user: 'a',
      password: '[redacted]',
      nested: { apiKey: '[redacted]', list: [{ token: '[redacted]', ok: 1 }] },
      mfaEnabled: true,
    });
  });

  it('pino logger redacts nested secrets', () => {
    const lines: string[] = [];
    const l = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, { write: (s: string) => lines.push(s) });
    l.info({ config: { secrets: { apiKey: 'x' } }, provider: { apiKey: 'y' }, headers: { authorization: 'Bearer z' } }, 'hello');
    expect(lines[0]).not.toContain('"y"');
    expect(lines[0]).not.toContain('Bearer z');
    expect(lines[0]).toContain('[redacted]');
    expect(createLogger({ name: 'x', level: 'silent' }).level).toBe('silent');
  });

  it('loadEnv parses booleans/numbers and enforces required keys', () => {
    const env = loadEnv({ source: { DATABASE_URL: 'postgres://x', SMTP_SECURE: 'false', S3_FORCE_PATH_STYLE: 'true', SMTP_PORT: '2525', ENCRYPTION_KEY: 'k' } });
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.SMTP_PORT).toBe(2525);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(() => loadEnv({ source: {} })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ source: { DATABASE_URL: 'x' }, required: ['ENCRYPTION_KEY'] })).toThrow(/ENCRYPTION_KEY is required/);
    expect(() => loadEnv({ source: { DATABASE_URL: 'x', ENCRYPTION_KEYS: 'a:b' }, required: ['ENCRYPTION_KEY'] })).not.toThrow();
    expect(boolish(true).parse(undefined)).toBe(true);
  });
});

describe('ProviderResolver — platform providers from the admin panel', () => {
  const platformRow = (over: Record<string, unknown>) => ({ id: 'pp1', kind: 'email', name: 'Panel SMTP', driver: 'smtp', config: { host: 'smtp.panel.test', port: 587 }, secretsEnc: null, fromEmail: 'hello@panel.test', fromName: 'Panel', isDefault: true, enabled: true, updatedAt: now, ...over });
  const db = (rows: Record<string, unknown>[], org: Partial<Record<keyof ResolverPrisma, Record<string, unknown>[]>> = {}) =>
    ({ ...prisma(org), platformProvider: delegate(rows) }) as unknown as ResolverPrisma;

  it('panel email takes precedence over SMTP_* env, and an organization provider over both', async () => {
    const r = new ProviderResolver(db([platformRow({})]), { env: platformEnv });
    expect(await r.email({ organizationId: null })).toMatchObject({ id: 'pp1', source: 'platform', from: { email: 'hello@panel.test', name: 'Panel' } });
    expect(await r.email({ organizationId: 'org1' })).toMatchObject({ id: 'pp1', source: 'platform' });
    const withOrg = new ProviderResolver(db([platformRow({})], { emailProvider: [row({ id: 'own', config: { host: 'smtp.org.test', port: 587 }, fromEmail: 'org@x.com', fromName: null, isDefault: true })] }), { env: platformEnv });
    expect((await withOrg.email({ organizationId: 'org1' })).id).toBe('own');
  });

  it('disabled panel rows are ignored (env fallback)', async () => {
    const r = new ProviderResolver(db([platformRow({ enabled: false })]), { env: platformEnv });
    expect((await r.email({ organizationId: null })).id).toBeNull();
  });

  it('panel AI key powers organizations without their own integration', async () => {
    const enc = mergeSecrets(null, { apiKey: 'sk-ant-panel' });
    const r = new ProviderResolver(db([platformRow({ id: 'ai1', kind: 'ai', driver: 'anthropic', config: {}, secretsEnc: enc })]), { env: {} });
    expect(await r.ai({ organizationId: 'org1' })).toMatchObject({ id: 'ai1', source: 'platform', driver: 'anthropic' });
    await expect(new ProviderResolver(db([]), { env: {} }).ai({ organizationId: 'org1' })).rejects.toThrow(/No AI provider configured/);
  });

  it('panel SMS gateway is used when an organization has none', async () => {
    const enc = mergeSecrets(null, { authToken: 'tok' });
    const r = new ProviderResolver(db([platformRow({ id: 'sms1', kind: 'sms', driver: 'twilio', config: { accountSid: 'AC' + 'a'.repeat(32), from: '+15550001111' }, secretsEnc: enc })]), { env: {} });
    expect(await r.sms({ organizationId: 'org1' })).toMatchObject({ id: 'sms1', source: 'platform' });
  });

  it('reports where each capability comes from', async () => {
    const status = await new ProviderResolver(db([platformRow({})]), { env: { ANTHROPIC_API_KEY: 'k' } }).platformStatus();
    expect(status.email).toMatchObject({ source: 'admin', provider: { id: 'pp1' } });
    expect(status.ai.source).toBe('env');
    expect(status.sms.source).toBe('none');
  });
});
