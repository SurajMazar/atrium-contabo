import { z } from 'zod';
import { defineDriver, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { basicAuth, httpRequest, type HttpRequestOptions } from '../http';
import { assertSendable, attachmentBase64, defaultFromSchema, formatAddress, resolveFrom, runEmailTest, type OutgoingMessage } from './shared';
import type { EmailMessage, EmailProvider, SendResult } from './types';

const emails = (list?: { email: string }[]) => (list ?? []).map((a) => a.email);
const allRecipients = (m: OutgoingMessage) => [...emails(m.to), ...emails(m.cc), ...emails(m.bcc)];

// ───────────────────────────── Resend ─────────────────────────────

const RESEND_API = 'https://api.resend.com';
export const resendConfigSchema = z.object({ baseUrl: z.string().url().default(RESEND_API), defaultFrom: defaultFromSchema });
export const resendSecretsSchema = z.object({ apiKey: z.string().min(1) });

export class ResendEmailProvider implements EmailProvider {
  readonly driver = 'resend';
  constructor(
    private readonly config: z.output<typeof resendConfigSchema>,
    private readonly secrets: z.output<typeof resendSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Network policy for every request; error bodies are only revealed for the official API. */
  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: this.config.baseUrl.replace(/\/+$/, '') === RESEND_API };
  }

  private headers() {
    return { Authorization: `Bearer ${this.secrets.apiKey}` };
  }

  async send(message: EmailMessage | OutgoingMessage): Promise<SendResult> {
    assertSendable(this.driver, message);
    const from = resolveFrom(this.driver, message, this.config.defaultFrom);
    const body: Record<string, unknown> = {
      from: formatAddress(from),
      to: message.to.map(formatAddress),
      subject: message.subject,
    };
    if (message.cc?.length) body.cc = message.cc.map(formatAddress);
    if (message.bcc?.length) body.bcc = message.bcc.map(formatAddress);
    if (message.replyTo) body.reply_to = formatAddress(message.replyTo);
    if (message.html) body.html = message.html;
    if (message.text) body.text = message.text;
    if (message.headers) body.headers = message.headers;
    if (message.attachments?.length) body.attachments = message.attachments.map((a) => ({ filename: a.filename, content: attachmentBase64(a.content), content_type: a.contentType }));
    // Resend tag names/values: ASCII letters, numbers, underscores, dashes.
    if (message.tags) body.tags = Object.entries(message.tags).map(([name, value]) => ({ name: name.replace(/[^\w-]/g, '_'), value: value.replace(/[^\w-]/g, '_') }));
    const res = await httpRequest<{ id?: string }>(this.driver, `${this.config.baseUrl}/emails`, { ...this.net(), method: 'POST', headers: this.headers(), body });
    return { id: res.data?.id, accepted: allRecipients(message), rejected: [], provider: this.driver };
  }

  test(to?: string): Promise<TestResult> {
    return runEmailTest(this, to, this.config.defaultFrom, async () => {
      const res = await httpRequest<{ data?: Array<{ name: string; status: string }> }>(this.driver, `${this.config.baseUrl}/domains`, { ...this.net(), headers: this.headers() });
      const domains = res.data?.data ?? [];
      return `Resend API key valid (${domains.length} domain${domains.length === 1 ? '' : 's'}: ${domains.map((d) => `${d.name} [${d.status}]`).join(', ') || 'none'})`;
    });
  }
}

export const resendDriver = defineDriver({
  kind: 'email',
  id: 'resend',
  name: 'Resend',
  description: 'Resend transactional email HTTP API.',
  configSchema: resendConfigSchema,
  secretsSchema: resendSecretsSchema,
  create: (config, secrets, ctx): EmailProvider => new ResendEmailProvider(config, secrets, ctx),
});

// ───────────────────────────── Mailgun ─────────────────────────────

export const mailgunConfigSchema = z.object({
  domain: z.string().min(1).describe('Sending domain, e.g. mg.example.com'),
  region: z.enum(['us', 'eu']).default('us'),
  defaultFrom: defaultFromSchema,
});
export const mailgunSecretsSchema = z.object({ apiKey: z.string().min(1) });

export class MailgunEmailProvider implements EmailProvider {
  readonly driver = 'mailgun';
  constructor(
    private readonly config: z.output<typeof mailgunConfigSchema>,
    private readonly secrets: z.output<typeof mailgunSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Fixed vendor API: error bodies may be shown. */
  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: true };
  }

  private get base() {
    return this.config.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  }

  private auth() {
    return { Authorization: basicAuth('api', this.secrets.apiKey) };
  }

  async send(message: EmailMessage | OutgoingMessage): Promise<SendResult> {
    assertSendable(this.driver, message);
    const from = resolveFrom(this.driver, message, this.config.defaultFrom);
    const form = new FormData();
    form.append('from', formatAddress(from));
    for (const a of message.to) form.append('to', formatAddress(a));
    for (const a of message.cc ?? []) form.append('cc', formatAddress(a));
    for (const a of message.bcc ?? []) form.append('bcc', formatAddress(a));
    form.append('subject', message.subject);
    if (message.text) form.append('text', message.text);
    if (message.html) form.append('html', message.html);
    if (message.replyTo) form.append('h:Reply-To', formatAddress(message.replyTo));
    for (const [k, v] of Object.entries(message.headers ?? {})) form.append(`h:${k}`, v);
    for (const [k, v] of Object.entries(message.tags ?? {})) {
      form.append('o:tag', `${k}:${v}`.slice(0, 128));
      form.append(`v:${k}`, v);
    }
    for (const a of message.attachments ?? []) {
      const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content, 'utf8');
      form.append('attachment', new Blob([new Uint8Array(buf)], { type: a.contentType ?? 'application/octet-stream' }), a.filename);
    }
    const res = await httpRequest<{ id?: string; message?: string }>(this.driver, `${this.base}/v3/${encodeURIComponent(this.config.domain)}/messages`, { ...this.net(), method: 'POST', headers: this.auth(), body: form });
    return { id: res.data?.id?.replace(/^<|>$/g, ''), accepted: allRecipients(message), rejected: [], provider: this.driver };
  }

  test(to?: string): Promise<TestResult> {
    return runEmailTest(this, to, this.config.defaultFrom, async () => {
      const res = await httpRequest<{ domain?: { name: string; state: string } }>(this.driver, `${this.base}/v3/domains/${encodeURIComponent(this.config.domain)}`, { ...this.net(), headers: this.auth() });
      return `Mailgun domain ${res.data?.domain?.name ?? this.config.domain} is ${res.data?.domain?.state ?? 'reachable'}`;
    });
  }
}

export const mailgunDriver = defineDriver({
  kind: 'email',
  id: 'mailgun',
  name: 'Mailgun',
  description: 'Mailgun HTTP API (US or EU region).',
  configSchema: mailgunConfigSchema,
  secretsSchema: mailgunSecretsSchema,
  presets: [
    { id: 'us', name: 'Mailgun US', config: { region: 'us' } },
    { id: 'eu', name: 'Mailgun EU', config: { region: 'eu' } },
  ],
  create: (config, secrets, ctx): EmailProvider => new MailgunEmailProvider(config, secrets, ctx),
});

// ───────────────────────────── SendGrid ─────────────────────────────

export const sendgridConfigSchema = z.object({
  region: z.enum(['global', 'eu']).default('global'),
  /** Optional unsubscribe group / IP pool. */
  ipPoolName: z.string().optional(),
  defaultFrom: defaultFromSchema,
});
export const sendgridSecretsSchema = z.object({ apiKey: z.string().min(1) });

export class SendgridEmailProvider implements EmailProvider {
  readonly driver = 'sendgrid';
  constructor(
    private readonly config: z.output<typeof sendgridConfigSchema>,
    private readonly secrets: z.output<typeof sendgridSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Fixed vendor API: error bodies may be shown. */
  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: true };
  }

  private get base() {
    return this.config.region === 'eu' ? 'https://api.eu.sendgrid.com' : 'https://api.sendgrid.com';
  }

  async send(message: EmailMessage | OutgoingMessage): Promise<SendResult> {
    assertSendable(this.driver, message);
    const from = resolveFrom(this.driver, message, this.config.defaultFrom);
    const addr = (a: { email: string; name?: string }) => (a.name ? { email: a.email, name: a.name } : { email: a.email });
    const personalization: Record<string, unknown> = { to: message.to.map(addr) };
    if (message.cc?.length) personalization.cc = message.cc.map(addr);
    if (message.bcc?.length) personalization.bcc = message.bcc.map(addr);
    const content: Array<{ type: string; value: string }> = [];
    if (message.text) content.push({ type: 'text/plain', value: message.text });
    if (message.html) content.push({ type: 'text/html', value: message.html });
    const body: Record<string, unknown> = { personalizations: [personalization], from: addr(from), subject: message.subject, content };
    if (message.replyTo) body.reply_to = addr(message.replyTo);
    if (message.headers && Object.keys(message.headers).length) body.headers = message.headers;
    if (message.tags) {
      body.custom_args = message.tags;
      body.categories = Object.values(message.tags).slice(0, 10);
    }
    if (this.config.ipPoolName) body.ip_pool_name = this.config.ipPoolName;
    if (message.attachments?.length) body.attachments = message.attachments.map((a) => ({ content: attachmentBase64(a.content), filename: a.filename, type: a.contentType, disposition: 'attachment' }));
    const res = await httpRequest(this.driver, `${this.base}/v3/mail/send`, { ...this.net(), method: 'POST', headers: { Authorization: `Bearer ${this.secrets.apiKey}` }, body, responseType: 'text' });
    return { id: res.headers.get('x-message-id') ?? undefined, accepted: allRecipients(message), rejected: [], provider: this.driver };
  }

  test(to?: string): Promise<TestResult> {
    return runEmailTest(this, to, this.config.defaultFrom, async () => {
      const res = await httpRequest<{ scopes?: string[] }>(this.driver, `${this.base}/v3/scopes`, { ...this.net(), headers: { Authorization: `Bearer ${this.secrets.apiKey}` } });
      const scopes = res.data?.scopes ?? [];
      if (scopes.length && !scopes.includes('mail.send')) throw new Error('SendGrid API key is valid but lacks the mail.send scope');
      return 'SendGrid API key valid (mail.send permitted)';
    });
  }
}

export const sendgridDriver = defineDriver({
  kind: 'email',
  id: 'sendgrid',
  name: 'SendGrid',
  description: 'Twilio SendGrid v3 Mail Send API.',
  configSchema: sendgridConfigSchema,
  secretsSchema: sendgridSecretsSchema,
  create: (config, secrets, ctx): EmailProvider => new SendgridEmailProvider(config, secrets, ctx),
});

// ───────────────────────────── Postmark ─────────────────────────────

export const postmarkConfigSchema = z.object({
  messageStream: z.string().default('outbound'),
  trackOpens: z.boolean().default(false),
  defaultFrom: defaultFromSchema,
});
export const postmarkSecretsSchema = z.object({ serverToken: z.string().min(1) });

export class PostmarkEmailProvider implements EmailProvider {
  readonly driver = 'postmark';
  constructor(
    private readonly config: z.output<typeof postmarkConfigSchema>,
    private readonly secrets: z.output<typeof postmarkSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  /** Fixed vendor API: error bodies may be shown. */
  private net(): Pick<HttpRequestOptions, 'network' | 'revealErrorBody'> {
    return { network: this.ctx.network, revealErrorBody: true };
  }

  private headers() {
    return { 'X-Postmark-Server-Token': this.secrets.serverToken, Accept: 'application/json' };
  }

  async send(message: EmailMessage | OutgoingMessage): Promise<SendResult> {
    assertSendable(this.driver, message);
    const from = resolveFrom(this.driver, message, this.config.defaultFrom);
    const list = (l?: { email: string; name?: string }[]) => (l?.length ? l.map(formatAddress).join(', ') : undefined);
    const tagEntries = Object.entries(message.tags ?? {});
    const body: Record<string, unknown> = {
      From: formatAddress(from),
      To: list(message.to),
      Cc: list(message.cc),
      Bcc: list(message.bcc),
      ReplyTo: message.replyTo ? formatAddress(message.replyTo) : undefined,
      Subject: message.subject,
      HtmlBody: message.html,
      TextBody: message.text,
      MessageStream: this.config.messageStream,
      TrackOpens: this.config.trackOpens,
      Headers: Object.entries(message.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
      Attachments: (message.attachments ?? []).map((a) => ({ Name: a.filename, Content: attachmentBase64(a.content), ContentType: a.contentType ?? 'application/octet-stream' })),
      Tag: tagEntries[0]?.[1],
      Metadata: message.tags,
    };
    const res = await httpRequest<{ MessageID?: string; ErrorCode?: number; Message?: string; To?: string }>(this.driver, 'https://api.postmarkapp.com/email', { ...this.net(), method: 'POST', headers: this.headers(), body });
    if (res.data?.ErrorCode) return { id: res.data.MessageID, accepted: [], rejected: allRecipients(message), provider: this.driver };
    return { id: res.data?.MessageID, accepted: allRecipients(message), rejected: [], provider: this.driver };
  }

  test(to?: string): Promise<TestResult> {
    return runEmailTest(this, to, this.config.defaultFrom, async () => {
      const res = await httpRequest<{ Name?: string }>(this.driver, 'https://api.postmarkapp.com/server', { ...this.net(), headers: this.headers() });
      return `Postmark server token valid (${res.data?.Name ?? 'server'})`;
    });
  }
}

export const postmarkDriver = defineDriver({
  kind: 'email',
  id: 'postmark',
  name: 'Postmark',
  description: 'Postmark transactional email API.',
  configSchema: postmarkConfigSchema,
  secretsSchema: postmarkSecretsSchema,
  create: (config, secrets, ctx): EmailProvider => new PostmarkEmailProvider(config, secrets, ctx),
});
