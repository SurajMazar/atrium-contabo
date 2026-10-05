import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendEmailProvider, resendConfigSchema } from '../src/email/http-providers';
import { TwilioSmsProvider, twilioConfigSchema, renderHttpSmsRequest, httpSmsConfigSchema, httpSmsSecretsSchema } from '../src/sms/drivers';
import { SiteverifyCaptcha, captchaConfigSchema } from '../src/captcha/drivers';
import { normalizePhoneE164, toNationalNumber, smsSegments } from '../src/sms/phone';
import { ProviderError } from '../src/driver';
import { DRIVERS, describeDrivers, getDriver, instantiateProvider, listDrivers } from '../src/registry';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe('resend', () => {
  it('sends with mapped payload and bearer auth', async () => {
    const fetchMock = vi.fn(async () => json({ id: 'em_123' }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new ResendEmailProvider(resendConfigSchema.parse({ defaultFrom: { email: 'hello@site.com', name: 'Site' } }), { apiKey: 're_secret' });
    const res = await p.send({ to: [{ email: 'a@x.com', name: 'A' }], bcc: [{ email: 'b@x.com' }], subject: 'Hi', html: '<p>Hi</p>', tags: { form: 'contact us' }, attachments: [{ filename: 'a.txt', content: 'hello' }] });
    expect(res).toEqual({ id: 'em_123', accepted: ['a@x.com', 'b@x.com'], rejected: [], provider: 'resend' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_secret');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: 'Site <hello@site.com>', to: ['A <a@x.com>'], bcc: ['b@x.com'], subject: 'Hi', html: '<p>Hi</p>' });
    expect(body.tags).toEqual([{ name: 'form', value: 'contact_us' }]);
    expect(body.attachments[0]).toMatchObject({ filename: 'a.txt', content: Buffer.from('hello').toString('base64') });
  });

  it('surfaces API errors without leaking the key; 429 retryable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ name: 'rate_limit_exceeded', message: 'Too many requests' }, 429)));
    const p = new ResendEmailProvider(resendConfigSchema.parse({}), { apiKey: 're_secret' });
    const err = await p.send({ from: { email: 'a@b.co' }, to: [{ email: 'x@y.co' }], subject: 's', text: 't' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as Error).message).toContain('Too many requests');
    expect((err as Error).message).not.toContain('re_secret');
  });

  it('test() without recipient checks domains', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ name: 'site.com', status: 'verified' }] })));
    const p = new ResendEmailProvider(resendConfigSchema.parse({}), { apiKey: 'k' });
    await expect(p.test()).resolves.toMatchObject({ ok: true, message: expect.stringContaining('site.com [verified]') });
  });
});

describe('twilio', () => {
  const config = twilioConfigSchema.parse({ accountSid: `AC${'a'.repeat(32)}`, from: '+15005550006', defaultCountry: 'NP' });

  it('posts form-encoded message with basic auth and normalized number', async () => {
    const fetchMock = vi.fn(async () => json({ sid: 'SM1', status: 'queued' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const p = new TwilioSmsProvider(config, { authToken: 'tok' });
    const res = await p.send({ to: '981-2345678', body: 'Hello' });
    expect(res).toMatchObject({ id: 'SM1', status: 'queued', provider: 'twilio' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/AC${'a'.repeat(32)}/Messages.json`);
    const form = new URLSearchParams(String(init.body));
    expect(form.get('To')).toBe('+9779812345678');
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toBe('Hello');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`AC${'a'.repeat(32)}:tok`).toString('base64')}`);
  });

  it('rejects invalid numbers without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const p = new TwilioSmsProvider(config, { authToken: 'tok' });
    await expect(p.send({ to: 'abc', body: 'x' })).rejects.toThrow(/invalid phone/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps failed status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ sid: 'SM2', status: 'failed' })));
    const p = new TwilioSmsProvider(config, { authToken: 'tok' });
    await expect(p.send({ to: '+14155550100', body: 'x' })).resolves.toMatchObject({ status: 'failed' });
  });
});

describe('generic http sms', () => {
  it('renders templates with escaping per content type', () => {
    const config = httpSmsConfigSchema.parse({ url: 'https://gw.example/send?to={{to}}', bodyTemplate: '{"msg":"{{body}}","from":"{{from}}","key":"{{token}}"}', phoneFormat: 'national', defaultCountry: 'NP', from: 'ATR' });
    const req = renderHttpSmsRequest(config, httpSmsSecretsSchema.parse({ token: 't0k', headers: { Authorization: 'Bearer z' } }), { to: '+977 9812345678', body: 'He said "hi"\nbye' });
    expect(req.url).toBe('https://gw.example/send?to=9812345678');
    expect(JSON.parse(req.body!)).toEqual({ msg: 'He said "hi"\nbye', from: 'ATR', key: 't0k' });
    expect(req.headers).toMatchObject({ Authorization: 'Bearer z', 'Content-Type': 'application/json' });
  });
});

describe('phone helpers', () => {
  it.each([
    ['+977 981-2345678', undefined, '+9779812345678'],
    ['9812345678', 'NP', '+9779812345678'],
    ['9779812345678', 'NP', '+9779812345678'],
    ['00 44 7911 123456', undefined, '+447911123456'],
    ['07911 123456', 'GB', '+447911123456'],
    ['(415) 555-0100', 'US', '+14155550100'],
    ['1 415 555 0100', 'US', '+14155550100'],
    ['12', 'NP', undefined],
    ['hello', undefined, undefined],
  ])('normalize %s (%s) → %s', (input, country, expected) => {
    expect(normalizePhoneE164(input, country)).toBe(expected);
  });
  it('national + segments', () => {
    expect(toNationalNumber('+9779812345678', 'NP')).toBe('9812345678');
    expect(smsSegments('a'.repeat(161))).toMatchObject({ encoding: 'GSM-7', segments: 2 });
    expect(smsSegments('नमस्ते')).toMatchObject({ encoding: 'UCS-2', segments: 1 });
  });
});

describe('recaptcha v3', () => {
  const make = (minScore = 0.5) => new SiteverifyCaptcha('recaptcha-v3', captchaConfigSchema.parse({ siteKey: 'site', minScore }), { secretKey: 'sec' });

  it('passes when score ≥ threshold and action matches', async () => {
    const fetchMock = vi.fn(async () => json({ success: true, score: 0.7, action: 'submit', hostname: 'site.com' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await make().verify({ token: 'tok', action: 'submit', remoteIp: '1.2.3.4' });
    expect(res).toMatchObject({ success: true, score: 0.7 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.google.com/recaptcha/api/siteverify');
    const form = new URLSearchParams(String(init.body));
    expect(form.get('secret')).toBe('sec');
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe('1.2.3.4');
  });

  it('fails below threshold (per-request minScore overrides config)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, score: 0.4, action: 'submit' })));
    expect(await make(0.3).verify({ token: 't', action: 'submit' })).toMatchObject({ success: true });
    expect(await make(0.3).verify({ token: 't', action: 'submit', minScore: 0.5 })).toMatchObject({ success: false, errorCodes: ['score-too-low'] });
  });

  it('fails on action mismatch, missing token, and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, score: 0.9, action: 'login' })));
    expect(await make().verify({ token: 't', action: 'submit' })).toMatchObject({ success: false, errorCodes: ['action-mismatch'] });
    expect(await make().verify({ token: '' })).toMatchObject({ success: false });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    expect(await make().verify({ token: 't' })).toEqual({ success: false, errorCodes: ['verify-unavailable'] });
  });

  it('turnstile/hcaptcha endpoints', async () => {
    const fetchMock = vi.fn(async () => json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    await new SiteverifyCaptcha('turnstile', captchaConfigSchema.parse({ siteKey: 's' }), { secretKey: 'k' }).verify({ token: 't' });
    await new SiteverifyCaptcha('hcaptcha', captchaConfigSchema.parse({ siteKey: 's' }), { secretKey: 'k' }).verify({ token: 't' });
    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['https://challenges.cloudflare.com/turnstile/v0/siteverify', 'https://api.hcaptcha.com/siteverify']);
  });
});

describe('registry', () => {
  it('lists and describes drivers per kind', () => {
    expect(DRIVERS.storage.map((d) => d.id)).toEqual(['local', 's3', 'azure-blob']);
    expect(DRIVERS.email.map((d) => d.id)).toEqual(['smtp', 'resend', 'mailgun', 'sendgrid', 'postmark']);
    expect(DRIVERS.sms.map((d) => d.id)).toEqual(['twilio', 'vonage', 'aws-sns', 'http', 'sparrow', 'aakash']);
    expect(DRIVERS.ai.map((d) => d.id)).toEqual(['anthropic', 'openai', 'gemini']);
    expect(DRIVERS.captcha.map((d) => d.id)).toEqual(['recaptcha-v2', 'recaptcha-v3', 'turnstile', 'hcaptcha']);
    expect(DRIVERS.deployment.map((d) => d.id)).toEqual(expect.arrayContaining(['vercel', 'netlify', 'cloudflare-pages', 'self-hosted']));
    expect(getDriver('email', 'smtp')?.presets?.map((p) => p.id)).toEqual(expect.arrayContaining(['gmail', 'outlook', 'office365', 'amazon-ses-smtp', 'sendgrid-smtp', 'mailgun-smtp', 'zoho', 'mailpit-local']));
    expect(listDrivers().length).toBeGreaterThan(20);
    const described = describeDrivers('email');
    expect(described[0]).toMatchObject({ kind: 'email', id: 'smtp' });
    expect(JSON.stringify(described[0]!.secrets)).toContain('password');
  });

  it('instantiates with validation and hides secret values in errors', () => {
    const p = instantiateProvider('captcha', 'turnstile', { siteKey: 'abc' }, { secretKey: 'shh' });
    expect(p.siteKey).toBe('abc');
    expect(() => instantiateProvider('captcha', 'turnstile', { siteKey: 'abc' }, { secretKey: 12345 })).toThrow(/secrets — check: secretKey/);
    expect(() => instantiateProvider('email', 'nope', {}, {})).toThrow(/Unknown email driver/);
  });
});
