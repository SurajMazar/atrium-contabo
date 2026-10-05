import type { TestResult } from './driver';
import { isProductionEnv } from './net/policy';

/** Prefix of masked secret values sent back by forms (`••••••••abcd`). */
const MASK = '••••';

/**
 * Config fields that decide WHERE stored credentials are sent. Changing any of them (or the
 * driver) without re-entering the secrets would let someone who may edit integrations but never
 * saw the credentials redirect them to a server they control.
 */
export const CREDENTIAL_BINDING_FIELDS = [
  'host',
  'port',
  'secure',
  'url',
  'baseUrl',
  'endpoint',
  'verifyUrl',
  'accountName',
  'container',
  'region',
  'bucket',
  'domain',
  'accountSid',
  'apiKeySid',
  'accountId',
  'teamId',
  'teamSlug',
  'siteId',
  'username',
  'accessKeyId',
  'apiKey',
] as const;

function stable(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

/** A secret value counts as "re-entered" when it is a real (non-masked, non-empty) value or `null` (removal). */
export function isSuppliedSecret(v: unknown): boolean {
  if (v === null) return true;
  if (v === undefined || v === '') return false;
  if (typeof v === 'string') return !v.startsWith(MASK);
  if (typeof v === 'object' && !Array.isArray(v)) {
    const values = Object.values(v as Record<string, unknown>);
    return values.length > 0 && values.every((x) => x === null || (typeof x === 'string' ? x !== '' && !x.startsWith(MASK) : x !== undefined));
  }
  return true;
}

export interface SecretReentryInput {
  existingDriver: string;
  nextDriver: string;
  existingConfig: Record<string, unknown> | null | undefined;
  nextConfig: Record<string, unknown> | null | undefined;
  /** Keys of the currently stored (decrypted) secrets. */
  existingSecretKeys: readonly string[];
  /** Secrets sent with the update (may contain masked placeholders). */
  incomingSecrets: Record<string, unknown> | null | undefined;
}

export interface SecretReentryDecision {
  /** Driver/credential-binding fields that changed. */
  changed: string[];
  /** Stored secret keys that must be re-entered before the change is accepted. */
  missing: string[];
  ok: boolean;
  /** Driver changed: stored secrets must be discarded and replaced by the incoming ones (no merge). */
  replaceSecrets: boolean;
}

/**
 * INT-1: stored secrets are never silently carried over to a new destination.
 *  - driver changed → the stored secrets are discarded; at least one new secret must be supplied
 *    (when secrets were stored) and the incoming secrets replace the old blob;
 *  - a credential-binding config field changed → every stored secret must be re-entered (or
 *    explicitly removed with `null`) in the same request.
 */
export function secretReentryDecision(input: SecretReentryInput): SecretReentryDecision {
  const changed: string[] = [];
  const driverChanged = input.existingDriver !== input.nextDriver;
  if (driverChanged) changed.push('driver');
  const before = input.existingConfig ?? {};
  const after = input.nextConfig ?? {};
  for (const f of CREDENTIAL_BINDING_FIELDS) if (stable(before[f]) !== stable(after[f])) changed.push(f);
  if (!changed.length || !input.existingSecretKeys.length) return { changed, missing: [], ok: true, replaceSecrets: driverChanged };
  const incoming = input.incomingSecrets ?? {};
  if (driverChanged) {
    const anySupplied = Object.values(incoming).some((v) => v !== null && isSuppliedSecret(v));
    const missing = anySupplied ? [] : [...input.existingSecretKeys];
    return { changed, missing, ok: missing.length === 0, replaceSecrets: true };
  }
  const missing = input.existingSecretKeys.filter((k) => !isSuppliedSecret(incoming[k]));
  return { changed, missing, ok: missing.length === 0, replaceSecrets: false };
}

const SAFE_CODE = /\b(EOUTBOUNDBLOCKED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EAUTH|ENOAUTH|ETLS|EENVELOPE|EMESSAGE|ESOCKET|ECONNECTION|EDNS|EPROTOCOL)\b/;

/**
 * Client-facing provider test result. In production a failure never echoes driver/remote text
 * (response bodies, SMTP banners, SDK error dumps): only a generic message plus the HTTP status
 * or error code when one is recognisable. Outside production a short excerpt is kept.
 */
export function publicTestResult(result: TestResult, env: Record<string, string | undefined> = process.env): TestResult {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  if (result.ok) return { ...result, message: clip(result.message, 300) };
  if (!isProductionEnv(env)) return { ok: false, message: clip(result.message, 300) };
  const msg = result.message ?? '';
  const status = /\bHTTP (\d{3})\b/.exec(msg)?.[1] ?? (typeof result.details?.status === 'number' ? String(result.details.status) : undefined);
  const blocked = /Refusing to connect|not allowed|Unsupported URL scheme|embedded credentials|endpoint (host )?must/i.test(msg);
  const code = blocked ? 'EOUTBOUNDBLOCKED' : SAFE_CODE.exec(msg)?.[1];
  const hint = [status ? `HTTP ${status}` : undefined, code].filter(Boolean).join(', ');
  const base = blocked ? 'Connection test failed: the configured endpoint is not allowed (it must be a public internet address)' : 'Connection test failed';
  return { ok: false, message: hint ? `${base} (${hint})` : base };
}
