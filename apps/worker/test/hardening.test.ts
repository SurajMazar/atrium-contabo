import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptJson } from '@atrium/server-kit';
import { checkAutoresponderQuota, checkEmailQuota, checkSmsQuota, cleanSmsRecipient, FORM_QUOTAS, memoryQuotaStore } from '../src/lib/quota';
import { readResponseExcerpt, RESPONSE_STORE_LIMIT } from '../src/lib/net';
import { buildEnv } from '../src/processors/deployments';
import { assertProcessableImage, isAllowedInputFormat, MAX_INPUT_PIXELS, svgDimensions } from '../src/processors/media';
import { processWebhookDeliver } from '../src/processors/webhooks';
import { processFormSubmission } from '../src/processors/forms';
import { job, makeCtx } from './helpers';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('form message quotas (INT-3)', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');

  it('autoresponder: 3/hour per form+recipient, resets next window', async () => {
    const store = memoryQuotaStore(() => now);
    const args = { organizationId: 'org1', formId: 'f1', email: 'Victim@Example.com', nowMs: now };
    for (let i = 0; i < FORM_QUOTAS.autoresponderPerRecipientPerHour; i++) expect((await checkAutoresponderQuota(store, args)).allowed).toBe(true);
    expect(await checkAutoresponderQuota(store, { ...args, email: 'victim@example.com' })).toMatchObject({ allowed: false, reason: expect.stringMatching(/3\/hour/) });
    expect((await checkAutoresponderQuota(store, { ...args, formId: 'f2' })).allowed).toBe(true);
    expect((await checkAutoresponderQuota(store, { ...args, nowMs: now + 3_600_000 })).allowed).toBe(true);
  });

  it('SMS: 3/day per number (any formatting) and an org daily cap', async () => {
    const store = memoryQuotaStore(() => now);
    for (let i = 0; i < 3; i++) expect((await checkSmsQuota(store, { organizationId: 'org1', phone: '+977 980-000-0000', nowMs: now })).allowed).toBe(true);
    expect((await checkSmsQuota(store, { organizationId: 'org1', phone: '+9779800000000', nowMs: now })).allowed).toBe(false);
    const org = memoryQuotaStore(() => now);
    let allowed = 0;
    for (let i = 0; i < FORM_QUOTAS.smsPerOrgPerDay + 5; i++) if ((await checkSmsQuota(org, { organizationId: 'org2', phone: `+97798${String(i).padStart(8, '0')}`, nowMs: now })).allowed) allowed++;
    expect(allowed).toBe(FORM_QUOTAS.smsPerOrgPerDay);
  });

  it('emails: org daily cap counts recipients', async () => {
    const store = memoryQuotaStore(() => now);
    expect((await checkEmailQuota(store, { organizationId: 'org1', recipients: FORM_QUOTAS.emailsPerOrgPerDay, nowMs: now })).allowed).toBe(true);
    expect((await checkEmailQuota(store, { organizationId: 'org1', recipients: 1, nowMs: now })).allowed).toBe(false);
  });

  it('SMS recipients must be phone-number shaped (E.164 / national digits)', () => {
    expect(cleanSmsRecipient('+977 980-000-0000')).toBe('+9779800000000');
    expect(cleanSmsRecipient('009779800000000')).toBe('+9779800000000');
    expect(cleanSmsRecipient('9812345678')).toBe('9812345678');
    for (const bad of ['', 'call me', '+0123456789', '+1234', '+1234567890123456', '12345', 'tel:+1-900-EVIL', '+1 (555) 01;DROP']) expect(cleanSmsRecipient(bad)).toBeUndefined();
  });

  it('form.process skips over-quota autoresponders and SMS and records it in the actionsLog', async () => {
    const values = [
      { fieldName: 'email', fieldLabel: 'Email', fieldType: 'email', value: 'victim@example.com', valueJson: null },
      { fieldName: 'phone', fieldLabel: 'Phone', fieldType: 'phone', value: '+9779800000000, not-a-number', valueJson: null },
    ];
    const rules = [
      { ruleId: 'r', name: 'r', enabled: true, position: 0, when: null, then: [{ type: 'autoresponder', subject: 'Hi', html: '<p>Hi</p>', emailField: 'email' }, { type: 'sms', to: ['{{phone}}'], body: 'Hi' }], otherwise: [], stopProcessing: false },
    ];
    const sub = (id: string) => ({
      id, status: 'NEW', tags: [], createdAt: new Date('2026-10-05T10:00:00Z'), pageUrl: null, referrer: null, locale: null, actionsLog: [], values,
      form: { id: 'form_1', name: 'Contact', slug: 'contact', settings: {}, rules },
      website: { id: 'w1', name: 'Site', slug: 'site', organizationId: 'org1', domains: [] },
    });
    const { ctx, enqueued } = makeCtx({ prisma: { formSubmission: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => sub(where.id)), update: vi.fn() } } });
    for (let i = 0; i < 4; i++) await processFormSubmission(ctx, { submissionId: `s${i}` }, job());
    expect(enqueued.filter((e) => e.name === 'email.send')).toHaveLength(3);
    expect(enqueued.filter((e) => e.name === 'sms.send').map((e) => (e.data as { to: string }).to)).toEqual(['+9779800000000', '+9779800000000', '+9779800000000']);
    const calls = (ctx.prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastLog = JSON.parse(String(calls[calls.length - 1]![1])) as Array<{ type: string; status: string; detail?: string }>;
    expect(lastLog.find((e) => e.type === 'autoresponder')).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/Autoresponder limit/) });
    expect(lastLog.find((e) => e.type === 'sms')).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/invalid number.*SMS limit/) });
  });
});

describe('webhook delivery hardening (SSRF-1 / INT-4)', () => {
  function setup(url: string, response: Response, allowPrivateNetwork: boolean) {
    const delivery = { id: 'del_1', event: 'ping', attempts: 0, status: 'PENDING', createdAt: new Date(), payload: { id: 'del_1' }, webhook: { id: 'wh', url, enabled: true, secretEnc: encryptJson('whsec_x') } };
    const update = vi.fn(async () => ({}));
    const fetchMock = vi.fn(async () => response);
    const { ctx } = makeCtx({ prisma: { webhookDelivery: { findUnique: vi.fn(async () => delivery), update } }, fetch: fetchMock as unknown as typeof fetch });
    ctx.settings.allowPrivateNetwork = allowPrivateNetwork;
    return { ctx, update, fetchMock };
  }

  it.each(['http://127.0.0.1/hook', 'http://[::ffff:7f00:1]/hook', 'http://169.254.169.254/latest', 'http://localhost:4000/v1', 'http://0x7f000001/'])('refuses %s permanently without fetching', async (url) => {
    const { ctx, update, fetchMock } = setup(url, new Response('ok'), false);
    await expect(processWebhookDeliver(ctx, { deliveryId: 'del_1' }, job())).rejects.toThrow(/Refusing to connect/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('passes a guarded dispatcher, does not follow redirects and caps the stored body', async () => {
    const { ctx, update, fetchMock } = setup('https://hooks.example/x', new Response('y'.repeat(200_000)), false);
    await processWebhookDeliver(ctx, { deliveryId: 'del_1' }, job());
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit & { dispatcher?: unknown }])[1];
    expect(init.redirect).toBe('manual');
    expect(init.dispatcher).toBeDefined();
    const data = (update.mock.calls[0] as unknown as [{ data: { responseBody: string } }])[0].data;
    expect(data.responseBody.length).toBeLessThan(RESPONSE_STORE_LIMIT + 64);
  });

  it('readResponseExcerpt reads at most 64 KB', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 16_384;
        c.enqueue(new Uint8Array(16_384).fill(65));
        if (pulled > 10_000_000) c.close();
      },
    });
    const text = await readResponseExcerpt(new Response(stream));
    expect(text.startsWith('AAAA')).toBe(true);
    expect(pulled).toBeLessThan(200_000);
  });
});

describe('tenant build environment (INT-2)', () => {
  it('passes only an allow-list, never worker secrets', () => {
    const env = buildEnv('/tmp/home', { NODE_ENV: 'production', ATRIUM_STATIC_EXPORT: '1' }, {
      PATH: '/usr/bin',
      DATABASE_URL: 'postgres://u:p@db/x',
      ENCRYPTION_KEY: 'k',
      ENCRYPTION_KEYS: 'a:b',
      REDIS_URL: 'redis://r',
      VERCEL_TOKEN: 'v',
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-',
      S3_SECRET_ACCESS_KEY: 's',
      HOME: '/Users/worker',
    });
    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/tmp/home', CI: '1', NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production', ATRIUM_STATIC_EXPORT: '1' });
    for (const k of ['DATABASE_URL', 'ENCRYPTION_KEY', 'ENCRYPTION_KEYS', 'REDIS_URL', 'VERCEL_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'S3_SECRET_ACCESS_KEY']) expect(env).not.toHaveProperty(k);
    expect(JSON.stringify(env)).not.toContain('/Users/worker');
  });
});

describe('media input hardening (SC-3)', () => {
  it('accepts only sniffed jpeg/png/webp/avif/gif', () => {
    for (const format of ['jpeg', 'png', 'webp', 'gif']) expect(isAllowedInputFormat({ format })).toBe(true);
    expect(isAllowedInputFormat({ format: 'heif', compression: 'av1' })).toBe(true);
    for (const meta of [{ format: 'heif', compression: 'hevc' }, { format: 'svg' }, { format: 'tiff' }, { format: 'pdf' }, { format: 'magick' }, {}]) expect(isAllowedInputFormat(meta)).toBe(false);
  });

  it('fails closed on unknown formats and decompression bombs', () => {
    expect(() => assertProcessableImage({ format: 'svg', width: 10, height: 10 })).toThrow(/Unsupported image format/);
    expect(() => assertProcessableImage({ format: 'png', width: 20_000, height: 20_000 })).toThrow(/too large/);
    expect(() => assertProcessableImage({ format: 'png' })).toThrow(/no dimensions/);
    expect(() => assertProcessableImage({ format: 'jpeg', width: 4000, height: 3000 })).not.toThrow();
    expect(MAX_INPUT_PIXELS).toBe(50_000_000);
  });

  it('reads SVG dimensions without decoding', () => {
    expect(svgDimensions('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="40">')).toEqual({ width: 120, height: 40 });
    expect(svgDimensions('<?xml version="1.0"?><svg viewBox="0 0 300 150"></svg>')).toEqual({ width: 300, height: 150 });
    expect(svgDimensions('<html></html>')).toEqual({});
  });
});
