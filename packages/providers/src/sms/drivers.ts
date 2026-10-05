import { z } from 'zod';
import { getByPath, interpolate } from '@atrium/schema';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { basicAuth, excerpt, httpRequest, type HttpRequestOptions } from '../http';
import { assertOutboundUrl, createGuardedAgents } from '../net/guard';
import { allowsPrivate, remoteExcerpt } from '../net/policy';
import { normalizePhoneE164, toNationalNumber } from './phone';
import type { SmsParams, SmsProvider, SmsResult } from './types';

function requirePhone(provider: string, to: string, defaultCountry?: string): string {
  const e164 = normalizePhoneE164(to, defaultCountry);
  if (!e164) throw new ProviderError(`${provider}: invalid phone number "${to}"`, provider, false);
  return e164;
}

function requireBody(provider: string, body: string): string {
  if (!body?.trim()) throw new ProviderError(`${provider}: message body is empty`, provider, false);
  return body;
}

async function runSmsTest(provider: SmsProvider, to: string | undefined, check: () => Promise<string>): Promise<TestResult> {
  try {
    if (to) {
      const res = await provider.send({ to, body: `Atrium SMS test via ${provider.driver} at ${new Date().toISOString()}` });
      return { ok: res.status !== 'failed', message: res.status === 'failed' ? `Test SMS to ${to} failed` : `Test SMS ${res.status} for ${to}`, details: { id: res.id } };
    }
    return { ok: true, message: await check() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** AWS region names (also used to build the endpoint host name). */
const awsRegion = z.string().regex(/^[a-z]{2}(-[a-z0-9]+)+-\d+$|^us-gov-[a-z]+-\d+$/, 'Invalid AWS region');

const defaultCountry = z.string().optional().describe('ISO country (e.g. NP) or calling code applied to numbers without a + prefix');

// ───────────────────────────── Twilio ─────────────────────────────

export const twilioConfigSchema = z.object({
  accountSid: z.string().regex(/^AC[0-9a-fA-F]{32}$/, 'Account SID starts with AC'),
  /** Sender number (E.164) or alphanumeric sender id; ignored when messagingServiceSid is set. */
  from: z.string().optional(),
  messagingServiceSid: z.string().optional(),
  /** Optional API key SID (SK…) — when set, the secret is the API key secret instead of the auth token. */
  apiKeySid: z.string().optional(),
  statusCallbackUrl: z.string().url().optional(),
  defaultCountry,
});
export const twilioSecretsSchema = z.object({ authToken: z.string().min(1) });

export class TwilioSmsProvider implements SmsProvider {
  readonly driver = 'twilio';
  constructor(
    private readonly config: z.output<typeof twilioConfigSchema>,
    private readonly secrets: z.output<typeof twilioSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Fixed vendor API: error bodies may be shown. */
  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: true };
  }

  private get base() {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}`;
  }

  private auth() {
    return { Authorization: basicAuth(this.config.apiKeySid ?? this.config.accountSid, this.secrets.authToken) };
  }

  async send(params: SmsParams): Promise<SmsResult> {
    const form = new URLSearchParams();
    form.set('To', requirePhone(this.driver, params.to, this.config.defaultCountry));
    form.set('Body', requireBody(this.driver, params.body));
    if (this.config.messagingServiceSid && !params.from) form.set('MessagingServiceSid', this.config.messagingServiceSid);
    else {
      const from = params.from ?? this.config.from;
      if (!from) throw new ProviderError('twilio: configure a sender number or messaging service', this.driver, false);
      form.set('From', from);
    }
    if (this.config.statusCallbackUrl) form.set('StatusCallback', this.config.statusCallbackUrl);
    const res = await httpRequest<{ sid?: string; status?: string; error_code?: number | null; error_message?: string | null }>(this.driver, `${this.base}/Messages.json`, {
      ...this.net(),
      method: 'POST',
      headers: { ...this.auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const status = res.data?.status;
    return { id: res.data?.sid, status: status === 'failed' || status === 'undelivered' ? 'failed' : status === 'sent' || status === 'delivered' ? 'sent' : 'queued', provider: this.driver, raw: res.data };
  }

  test(to?: string): Promise<TestResult> {
    return runSmsTest(this, to, async () => {
      const res = await httpRequest<{ friendly_name?: string; status?: string }>(this.driver, `${this.base}.json`, { ...this.net(), headers: this.auth() });
      return `Twilio account "${res.data?.friendly_name ?? this.config.accountSid}" is ${res.data?.status ?? 'reachable'}`;
    });
  }
}

export const twilioDriver = defineDriver({
  kind: 'sms',
  id: 'twilio',
  name: 'Twilio',
  description: 'Twilio Programmable Messaging (REST API).',
  configSchema: twilioConfigSchema,
  secretsSchema: twilioSecretsSchema,
  create: (config, secrets, ctx): SmsProvider => new TwilioSmsProvider(config, secrets, ctx),
});

// ───────────────────────────── Vonage ─────────────────────────────

export const vonageConfigSchema = z.object({ apiKey: z.string().min(1), from: z.string().min(1).describe('Sender number or alphanumeric id'), defaultCountry });
export const vonageSecretsSchema = z.object({ apiSecret: z.string().min(1) });

export class VonageSmsProvider implements SmsProvider {
  readonly driver = 'vonage';
  constructor(
    private readonly config: z.output<typeof vonageConfigSchema>,
    private readonly secrets: z.output<typeof vonageSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Fixed vendor API: error bodies may be shown. */
  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: true };
  }

  async send(params: SmsParams): Promise<SmsResult> {
    const to = requirePhone(this.driver, params.to, this.config.defaultCountry).slice(1);
    const body = requireBody(this.driver, params.body);
    const form = new URLSearchParams({ api_key: this.config.apiKey, api_secret: this.secrets.apiSecret, from: params.from ?? this.config.from, to, text: body });
    if (/[^\u0000-\u007f]/.test(body)) form.set('type', 'unicode');
    const res = await httpRequest<{ messages?: Array<{ status?: string; 'message-id'?: string; 'error-text'?: string }> }>(this.driver, 'https://rest.nexmo.com/sms/json', {
      ...this.net(),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const msgs = res.data?.messages ?? [];
    const failed = msgs.find((m) => m.status !== '0');
    if (failed) {
      // Status 1 = throttled → retryable.
      throw new ProviderError(`vonage: ${failed['error-text'] ?? `status ${failed.status}`}`, this.driver, failed.status === '1', res.data);
    }
    return { id: msgs[0]?.['message-id'], status: 'sent', provider: this.driver, raw: res.data };
  }

  test(to?: string): Promise<TestResult> {
    return runSmsTest(this, to, async () => {
      const res = await httpRequest<{ value?: number }>(this.driver, 'https://rest.nexmo.com/account/get-balance', { ...this.net(), query: { api_key: this.config.apiKey, api_secret: this.secrets.apiSecret } });
      return `Vonage credentials valid (balance €${res.data?.value?.toFixed(2) ?? '?'})`;
    });
  }
}

export const vonageDriver = defineDriver({
  kind: 'sms',
  id: 'vonage',
  name: 'Vonage (Nexmo)',
  description: 'Vonage SMS API.',
  configSchema: vonageConfigSchema,
  secretsSchema: vonageSecretsSchema,
  create: (config, secrets, ctx): SmsProvider => new VonageSmsProvider(config, secrets, ctx),
});

// ───────────────────────────── AWS SNS ─────────────────────────────

export const snsConfigSchema = z.object({
  region: awsRegion.default('us-east-1'),
  accessKeyId: z.string().optional().describe('Leave empty to use the default AWS credential chain'),
  senderId: z.string().max(11).optional(),
  smsType: z.enum(['Transactional', 'Promotional']).default('Transactional'),
  originationNumber: z.string().optional(),
  defaultCountry,
});
export const snsSecretsSchema = z.object({ secretAccessKey: z.string().optional() });

export class SnsSmsProvider implements SmsProvider {
  readonly driver = 'aws-sns';
  private clientPromise?: Promise<{ client: import('@aws-sdk/client-sns').SNSClient; sdk: typeof import('@aws-sdk/client-sns') }>;
  constructor(
    private readonly config: z.output<typeof snsConfigSchema>,
    private readonly secrets: z.output<typeof snsSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  private client() {
    this.clientPromise ??= import('@aws-sdk/client-sns').then((sdk) => ({
      sdk,
      client: new sdk.SNSClient({
        region: this.config.region,
        // Tenant credentials: connections are pinned to validated public addresses.
        ...(allowsPrivate(this.ctx.network) ? {} : { requestHandler: createGuardedAgents() }),
        credentials: this.config.accessKeyId && this.secrets.secretAccessKey ? { accessKeyId: this.config.accessKeyId, secretAccessKey: this.secrets.secretAccessKey } : undefined,
      }),
    }));
    return this.clientPromise;
  }

  async send(params: SmsParams): Promise<SmsResult> {
    const { client, sdk } = await this.client();
    const attrs: Record<string, { DataType: string; StringValue: string }> = { 'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: this.config.smsType } };
    if (this.config.senderId) attrs['AWS.SNS.SMS.SenderID'] = { DataType: 'String', StringValue: this.config.senderId };
    if (this.config.originationNumber) attrs['AWS.MM.SMS.OriginationNumber'] = { DataType: 'String', StringValue: this.config.originationNumber };
    try {
      const out = await client.send(new sdk.PublishCommand({ PhoneNumber: requirePhone(this.driver, params.to, this.config.defaultCountry), Message: requireBody(this.driver, params.body), MessageAttributes: attrs }));
      return { id: out.MessageId, status: 'queued', provider: this.driver };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const e = err as { name?: string; message?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } };
      const status = e.$metadata?.httpStatusCode ?? 0;
      throw new ProviderError(`aws-sns: ${e.name ?? 'Error'}: ${e.message ?? String(err)}`, this.driver, Boolean(e.$retryable) || status >= 500 || e.name === 'ThrottledException', err);
    }
  }

  test(to?: string): Promise<TestResult> {
    return runSmsTest(this, to, async () => {
      const { client, sdk } = await this.client();
      const out = await client.send(new sdk.GetSMSAttributesCommand({ attributes: ['DefaultSMSType', 'MonthlySpendLimit'] }));
      return `AWS SNS reachable in ${this.config.region} (monthly spend limit: ${out.attributes?.MonthlySpendLimit ?? 'default'})`;
    });
  }
}

export const snsDriver = defineDriver({
  kind: 'sms',
  id: 'aws-sns',
  name: 'Amazon SNS',
  description: 'Send SMS through Amazon Simple Notification Service.',
  configSchema: snsConfigSchema,
  secretsSchema: snsSecretsSchema,
  create: (config, secrets, ctx): SmsProvider => new SnsSmsProvider(config, secrets, ctx),
});

// ───────────────────────────── Generic HTTP ─────────────────────────────

export const httpSmsConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
  /** URL template; `{{to}}`, `{{body}}`, `{{from}}` are URL-encoded when interpolated. */
  url: z.string().min(1),
  /** Body template; values are JSON-escaped for `json`, form-encoded for `form`. */
  bodyTemplate: z.string().default('{"to":"{{to}}","message":"{{body}}"}'),
  contentType: z.enum(['json', 'form', 'text']).default('json'),
  headers: z.record(z.string(), z.string()).default({}),
  /** Phone format sent to the gateway. */
  phoneFormat: z.enum(['e164', 'e164-no-plus', 'national']).default('e164'),
  from: z.string().optional(),
  defaultCountry,
  /** Dot path of the message id in the JSON response. */
  idPath: z.string().optional(),
  /** Optional dot path + expected value that indicates success in a 2xx response (e.g. `status` = `ok`). */
  successPath: z.string().optional(),
  successValue: z.string().optional(),
});
/** Secret headers (e.g. Authorization) and an optional `{{token}}` available to templates. */
export const httpSmsSecretsSchema = z.object({ headers: z.record(z.string(), z.string()).default({}), token: z.string().optional() });

export function renderHttpSmsRequest(config: z.output<typeof httpSmsConfigSchema>, secrets: z.output<typeof httpSmsSecretsSchema>, params: SmsParams) {
  const e164 = requirePhone('http', params.to, config.defaultCountry);
  const to =
    config.phoneFormat === 'e164' ? e164 : config.phoneFormat === 'e164-no-plus' ? e164.slice(1) : (config.defaultCountry && toNationalNumber(e164, config.defaultCountry)) || e164.slice(1);
  const scope = { to, body: requireBody('http', params.body), from: params.from ?? config.from ?? '', token: secrets.token ?? '' };
  const jsonEscape = (s: string) => JSON.stringify(s).slice(1, -1);
  const url = interpolate(config.url, scope, encodeURIComponent);
  let body: string | undefined;
  let contentType: string | undefined;
  if (config.method !== 'GET') {
    if (config.contentType === 'json') {
      body = interpolate(config.bodyTemplate, scope, jsonEscape);
      contentType = 'application/json';
    } else if (config.contentType === 'form') {
      body = interpolate(config.bodyTemplate, scope, encodeURIComponent);
      contentType = 'application/x-www-form-urlencoded';
    } else {
      body = interpolate(config.bodyTemplate, scope);
      contentType = 'text/plain';
    }
  }
  const headers: Record<string, string> = { ...config.headers, ...secrets.headers };
  if (contentType && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = contentType;
  return { method: config.method, url, headers, body };
}

export class HttpSmsProvider implements SmsProvider {
  readonly driver = 'http';
  constructor(
    private readonly config: z.output<typeof httpSmsConfigSchema>,
    private readonly secrets: z.output<typeof httpSmsSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network };
  }

  async send(params: SmsParams): Promise<SmsResult> {
    const req = renderHttpSmsRequest(this.config, this.secrets, params);
    const res = await httpRequest<unknown>(this.driver, req.url, { ...this.net(), method: req.method, headers: req.headers, body: req.body });
    if (this.config.successPath) {
      const v = getByPath(res.data, this.config.successPath);
      if (String(v) !== (this.config.successValue ?? 'true')) throw new ProviderError(`http: gateway reported failure (${this.config.successPath}=${remoteExcerpt(v, 60) ?? 'unexpected value'})`, this.driver, false, res.data);
    }
    const id = this.config.idPath ? getByPath(res.data, this.config.idPath) : undefined;
    return { id: id === undefined || id === null ? undefined : String(id), status: 'sent', provider: this.driver, raw: res.data };
  }

  test(to?: string): Promise<TestResult> {
    return runSmsTest(this, to, async () => {
      const url = assertOutboundUrl(this.config.url.replace(/\{\{[^}]+\}\}/g, 'x'), { allowPrivate: allowsPrivate(this.ctx.network) });
      return `HTTP gateway configured (${this.config.method} ${url.host}); send a test SMS to verify`;
    });
  }
}

export const httpSmsDriver = defineDriver({
  kind: 'sms',
  id: 'http',
  name: 'Custom HTTP gateway',
  description: 'Any SMS gateway with an HTTP API: configure method, URL, headers and a body template using {{to}}, {{body}}, {{from}}.',
  configSchema: httpSmsConfigSchema,
  secretsSchema: httpSmsSecretsSchema,
  create: (config, secrets, ctx): SmsProvider => new HttpSmsProvider(config, secrets, ctx),
});

// ───────────────────────────── Sparrow SMS (Nepal) ─────────────────────────────

const SPARROW_API = 'https://api.sparrowsms.com/v2';

export const sparrowConfigSchema = z.object({
  /** Sender identity approved by Sparrow (e.g. "Demo" / "InfoSMS"). */
  from: z.string().min(1),
  baseUrl: z.string().url().default(SPARROW_API),
});
export const sparrowSecretsSchema = z.object({ token: z.string().min(1) });

export class SparrowSmsProvider implements SmsProvider {
  readonly driver = 'sparrow';
  constructor(
    private readonly config: z.output<typeof sparrowConfigSchema>,
    private readonly secrets: z.output<typeof sparrowSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Error bodies are only revealed for the official API host. */
  private get official(): boolean {
    return this.config.baseUrl.replace(/\/+$/, '') === SPARROW_API;
  }

  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: this.official };
  }

  private remote(text: unknown): string | undefined {
    return this.official ? (text === undefined || text === null ? undefined : excerpt(String(text), 200)) : remoteExcerpt(text);
  }

  async send(params: SmsParams): Promise<SmsResult> {
    const to = toNationalNumber(params.to, 'NP');
    if (!to || !/^9\d{9}$/.test(to)) throw new ProviderError(`sparrow: "${params.to}" is not a Nepali mobile number`, this.driver, false);
    const form = new URLSearchParams({ token: this.secrets.token, from: params.from ?? this.config.from, to, text: requireBody(this.driver, params.body) });
    const res = await httpRequest<{ response_code?: number; response?: string; message_id?: string | number; count?: number }>(this.driver, `${this.config.baseUrl}/sms/`, {
      ...this.net(),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (res.data?.response_code !== undefined && res.data.response_code !== 200) {
      throw new ProviderError(`sparrow: ${this.remote(res.data.response) ?? `code ${res.data.response_code}`}`, this.driver, false, res.data);
    }
    return { id: res.data?.message_id !== undefined ? String(res.data.message_id) : undefined, status: 'sent', provider: this.driver, raw: res.data };
  }

  test(to?: string): Promise<TestResult> {
    return runSmsTest(this, to, async () => {
      const res = await httpRequest<{ credits_available?: number; response_code?: number }>(this.driver, `${this.config.baseUrl}/credit/`, { ...this.net(), query: { token: this.secrets.token } });
      return `Sparrow SMS token valid (${res.data?.credits_available ?? '?'} credits available)`;
    });
  }
}

export const sparrowDriver = defineDriver({
  kind: 'sms',
  id: 'sparrow',
  name: 'Sparrow SMS (Nepal)',
  description: 'Sparrow SMS REST API — Nepal local delivery (NTC/Ncell).',
  configSchema: sparrowConfigSchema,
  secretsSchema: sparrowSecretsSchema,
  create: (config, secrets, ctx): SmsProvider => new SparrowSmsProvider(config, secrets, ctx),
});

// ───────────────────────────── Aakash SMS (Nepal) ─────────────────────────────

const AAKASH_API = 'https://sms.aakashsms.com/sms';
export const aakashConfigSchema = z.object({ baseUrl: z.string().url().default(AAKASH_API) });
export const aakashSecretsSchema = z.object({ authToken: z.string().min(1) });

export class AakashSmsProvider implements SmsProvider {
  readonly driver = 'aakash';
  constructor(
    private readonly config: z.output<typeof aakashConfigSchema>,
    private readonly secrets: z.output<typeof aakashSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Error bodies are only revealed for the official API host. */
  private get official(): boolean {
    return this.config.baseUrl.replace(/\/+$/, '') === AAKASH_API;
  }

  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: this.official };
  }

  private remote(text: unknown): string | undefined {
    return this.official ? (text === undefined || text === null ? undefined : excerpt(String(text), 200)) : remoteExcerpt(text);
  }

  async send(params: SmsParams): Promise<SmsResult> {
    const to = toNationalNumber(params.to, 'NP');
    if (!to || !/^9\d{9}$/.test(to)) throw new ProviderError(`aakash: "${params.to}" is not a Nepali mobile number`, this.driver, false);
    const form = new URLSearchParams({ auth_token: this.secrets.authToken, to, text: requireBody(this.driver, params.body) });
    const res = await httpRequest<{ error?: boolean; message?: string; data?: { valid?: Array<{ id?: number | string }>; invalid?: unknown[] } }>(this.driver, `${this.config.baseUrl}/v3/send`, {
      ...this.net(),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (res.data?.error) throw new ProviderError(`aakash: ${this.remote(res.data.message) ?? 'send failed'}`, this.driver, false, res.data);
    const valid = res.data?.data?.valid ?? [];
    if (!valid.length && (res.data?.data?.invalid ?? []).length) return { status: 'failed', provider: this.driver, raw: res.data };
    return { id: valid[0]?.id !== undefined ? String(valid[0].id) : undefined, status: 'sent', provider: this.driver, raw: res.data };
  }

  test(to?: string): Promise<TestResult> {
    return runSmsTest(this, to, async () => {
      const res = await httpRequest<{ error?: boolean; message?: string; available_credit?: number; data?: { available_credit?: number } }>(this.driver, `${this.config.baseUrl}/v1/credit`, {
        ...this.net(),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ auth_token: this.secrets.authToken }),
      });
      if (res.data?.error) throw new Error(this.remote(res.data.message) ?? 'Aakash SMS rejected the token');
      return `Aakash SMS token valid (${res.data?.available_credit ?? res.data?.data?.available_credit ?? '?'} credits)`;
    });
  }
}

export const aakashDriver = defineDriver({
  kind: 'sms',
  id: 'aakash',
  name: 'Aakash SMS (Nepal)',
  description: 'Aakash SMS v3 API — Nepal local delivery.',
  configSchema: aakashConfigSchema,
  secretsSchema: aakashSecretsSchema,
  create: (config, secrets, ctx): SmsProvider => new AakashSmsProvider(config, secrets, ctx),
});
