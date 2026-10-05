import { z } from 'zod';
import { ProviderError, type TestResult } from '../driver';
import type { EmailAddress, EmailMessage, EmailProvider, SendResult } from './types';

/** Sender identity merged into every driver config by the resolver (from the provider row). */
export const defaultFromSchema = z
  .object({ email: z.string().email(), name: z.string().optional() })
  .optional()
  .describe('Default sender; filled from the provider record (fromEmail/fromName).');

export function formatAddress(a: EmailAddress): string {
  if (!a.name) return a.email;
  const name = /[",<>@()\\[\]:;]/.test(a.name) ? `"${a.name.replace(/(["\\])/g, '\\$1')}"` : a.name;
  return `${name} <${a.email}>`;
}

/** Parse "Name <email>" or bare "email". */
export function parseAddress(value: string): EmailAddress {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (m) return { email: m[2]!.trim(), name: m[1]!.trim() || undefined };
  return { email: value.trim() };
}

export function attachmentBase64(content: Buffer | string): string {
  return Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content, 'utf8').toString('base64');
}

/** Callers may omit `from` (queue payloads); the configured default sender is used. */
export type OutgoingMessage = Omit<EmailMessage, 'from'> & { from?: EmailAddress };

export function resolveFrom(provider: string, message: OutgoingMessage, defaultFrom?: EmailAddress): EmailAddress {
  const from = message.from ?? defaultFrom;
  if (!from?.email) throw new ProviderError(`${provider}: no sender address — set a From address on the email provider`, provider, false);
  return from;
}

export function assertSendable(provider: string, message: OutgoingMessage): void {
  if (!message.to?.length) throw new ProviderError(`${provider}: message has no recipients`, provider, false);
  if (!message.subject) throw new ProviderError(`${provider}: message has no subject`, provider, false);
  if (!message.html && !message.text) throw new ProviderError(`${provider}: message has no body`, provider, false);
}

export function testMessage(to: string, from: EmailAddress | undefined, driver: string): OutgoingMessage {
  const sentAt = new Date().toISOString();
  return {
    from,
    to: [{ email: to }],
    subject: 'Atrium email provider test',
    text: `This is a test message from Atrium using the "${driver}" email driver.\nSent at ${sentAt}.`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5"><h2 style="margin:0 0 8px">It works!</h2><p>This is a test message from Atrium using the <strong>${driver}</strong> email driver.</p><p style="color:#666;font-size:12px">Sent at ${sentAt}</p></div>`,
    tags: { category: 'provider-test' },
  };
}

/** Shared test(): sends a real message when `to` is given, otherwise runs a credentials check. */
export async function runEmailTest(provider: EmailProvider & { send(m: OutgoingMessage): Promise<SendResult> }, to: string | undefined, defaultFrom: EmailAddress | undefined, check: () => Promise<string>): Promise<TestResult> {
  try {
    if (to) {
      const res = await provider.send(testMessage(to, defaultFrom, provider.driver) as EmailMessage);
      return { ok: res.accepted.length > 0, message: res.accepted.length ? `Test email sent to ${to}` : `Test email to ${to} was rejected`, details: { id: res.id, accepted: res.accepted, rejected: res.rejected } };
    }
    const msg = await check();
    return { ok: true, message: msg };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
