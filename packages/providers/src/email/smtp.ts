import { z } from 'zod';
import type { Transporter } from 'nodemailer';
import { defineDriver, ProviderError, type TestResult } from '../driver';
import { assertSendable, attachmentBase64, defaultFromSchema, formatAddress, resolveFrom, runEmailTest, type OutgoingMessage } from './shared';
import type { EmailMessage, EmailProvider, SendResult } from './types';

export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  /** true = implicit TLS (465); false = STARTTLS upgrade when offered (587/25). */
  secure: z.boolean().default(false),
  /** Refuse to send unless STARTTLS succeeds. */
  requireTLS: z.boolean().default(false),
  username: z.string().optional(),
  /** Accept self-signed certificates (local relays only). */
  allowInvalidCertificates: z.boolean().default(false),
  pool: z.boolean().default(true),
  maxConnections: z.number().int().min(1).max(50).default(5),
  defaultFrom: defaultFromSchema,
});
export const smtpSecretsSchema = z.object({ password: z.string().optional() });
export type SmtpConfig = z.output<typeof smtpConfigSchema>;

const RETRYABLE_SMTP = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET']);

function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { code?: string; responseCode?: number; message?: string };
  const retryable = (e.code !== undefined && RETRYABLE_SMTP.has(e.code)) || (e.responseCode !== undefined && e.responseCode >= 400 && e.responseCode < 500);
  return new ProviderError(`smtp: ${e.message ?? String(err)}`, 'smtp', retryable, err);
}

export class SmtpEmailProvider implements EmailProvider {
  readonly driver = 'smtp';
  private transport?: Promise<Transporter>;

  constructor(
    private readonly config: SmtpConfig,
    private readonly secrets: z.output<typeof smtpSecretsSchema>,
  ) {}

  private transporter(): Promise<Transporter> {
    this.transport ??= import('nodemailer').then((mod) => {
      const nodemailer = (mod as unknown as { default?: typeof import('nodemailer') }).default ?? mod;
      const c = this.config;
      const base = {
        host: c.host,
        port: c.port,
        secure: c.secure,
        requireTLS: c.requireTLS,
        auth: c.username ? { user: c.username, pass: this.secrets.password ?? '' } : undefined,
        tls: { rejectUnauthorized: !c.allowInvalidCertificates },
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      };
      return c.pool ? nodemailer.createTransport({ ...base, pool: true, maxConnections: c.maxConnections }) : nodemailer.createTransport(base);
    });
    return this.transport;
  }

  async send(message: EmailMessage | OutgoingMessage): Promise<SendResult> {
    assertSendable(this.driver, message);
    const from = resolveFrom(this.driver, message, this.config.defaultFrom);
    const t = await this.transporter();
    try {
      const headers: Record<string, string> = { ...(message.headers ?? {}) };
      if (message.tags) for (const [k, v] of Object.entries(message.tags)) headers[`X-Atrium-Tag-${k.replace(/[^A-Za-z0-9-]/g, '-')}`] = v;
      const info = await t.sendMail({
        from: formatAddress(from),
        to: message.to.map(formatAddress),
        cc: message.cc?.map(formatAddress),
        bcc: message.bcc?.map(formatAddress),
        replyTo: message.replyTo ? formatAddress(message.replyTo) : undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers,
        attachments: message.attachments?.map((a) => ({ filename: a.filename, content: attachmentBase64(a.content), encoding: 'base64', contentType: a.contentType })),
      });
      const norm = (list: unknown[] | undefined) => (list ?? []).map((x) => (typeof x === 'string' ? x : (x as { address?: string }).address ?? String(x)));
      return { id: info.messageId, accepted: norm(info.accepted), rejected: norm(info.rejected), provider: this.driver };
    } catch (err) {
      throw toProviderError(err);
    }
  }

  async test(to?: string): Promise<TestResult> {
    return runEmailTest(this, to, this.config.defaultFrom, async () => {
      const t = await this.transporter();
      try {
        await t.verify();
      } catch (err) {
        throw toProviderError(err);
      }
      return `SMTP connection to ${this.config.host}:${this.config.port} verified`;
    });
  }

  /** Close pooled connections (worker shutdown). */
  async close(): Promise<void> {
    if (this.transport) (await this.transport).close();
  }
}

export const smtpDriver = defineDriver({
  kind: 'email',
  id: 'smtp',
  name: 'SMTP',
  description: 'Any SMTP server or relay (Gmail, Microsoft 365, Amazon SES, SendGrid, Mailgun, Zoho, Mailpit…).',
  configSchema: smtpConfigSchema,
  secretsSchema: smtpSecretsSchema,
  presets: [
    { id: 'gmail', name: 'Gmail / Google Workspace (app password)', config: { host: 'smtp.gmail.com', port: 465, secure: true } },
    { id: 'outlook', name: 'Outlook / Microsoft 365', config: { host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true } },
    { id: 'office365', name: 'Office 365 (alias)', config: { host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true } },
    { id: 'amazon-ses-smtp', name: 'Amazon SES (SMTP, us-east-1)', config: { host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false, requireTLS: true } },
    { id: 'sendgrid-smtp', name: 'SendGrid (SMTP)', config: { host: 'smtp.sendgrid.net', port: 587, secure: false, requireTLS: true, username: 'apikey' } },
    { id: 'mailgun-smtp', name: 'Mailgun (SMTP)', config: { host: 'smtp.mailgun.org', port: 587, secure: false, requireTLS: true } },
    { id: 'zoho', name: 'Zoho Mail', config: { host: 'smtp.zoho.com', port: 465, secure: true } },
    { id: 'mailpit-local', name: 'Mailpit (local development)', config: { host: 'localhost', port: 51025, secure: false, pool: false } },
  ],
  create: (config, secrets): EmailProvider => new SmtpEmailProvider(config, secrets),
});
