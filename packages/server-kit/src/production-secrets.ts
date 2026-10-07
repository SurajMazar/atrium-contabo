/**
 * Production secret & URL policy shared by the API, worker and CLI (`atrium setup check`).
 *
 * Dependency-free on purpose: the CLI imports this file straight from source (it must work before
 * the workspace is built) and the renderer mirrors the RENDERER_SECRET subset in apps/renderer/lib/env.ts
 * (the renderer cannot depend on server-kit because the exporter vendors the renderer's workspace deps).
 *
 * When NODE_ENV=production a process calls `assertProductionSecrets(env, spec)` at startup and REFUSES
 * TO START if a required secret is missing, too short, or still (derived from) a `.env.example`
 * placeholder, if the JWT access and refresh secrets are equal, if cookies are not Secure, or if a
 * public URL / CORS origin is not https or points at localhost. Outside production the same findings
 * are reported as a single warning so local development is unchanged.
 */

export type SecretEncoding = 'base64' | 'base64url' | 'hex';

export interface SecretSpec {
  bytes: number;
  encoding: SecretEncoding;
  /** Minimum acceptable length of the stored string. */
  minLength: number;
  /** Value must base64-decode to exactly this many bytes. */
  exactBytes?: number;
  description: string;
}

/** Secrets every environment needs; `atrium init` / `setup env` generate them. */
export const APP_SECRETS: Record<string, SecretSpec> = {
  JWT_ACCESS_SECRET: { bytes: 48, encoding: 'base64url', minLength: 32, description: 'Signs 15-minute access tokens' },
  JWT_REFRESH_SECRET: { bytes: 48, encoding: 'base64url', minLength: 32, description: 'Signs refresh tokens' },
  ENCRYPTION_KEY: { bytes: 32, encoding: 'base64', minLength: 44, exactBytes: 32, description: 'AES-256-GCM key for provider secrets at rest' },
  RENDERER_SECRET: { bytes: 32, encoding: 'base64url', minLength: 32, description: 'Shared secret between API and renderer' },
  ANALYTICS_SALT: { bytes: 24, encoding: 'base64url', minLength: 24, description: 'Salt for privacy-preserving visitor hashes' },
};

/** Extra secrets generated for production environments (`setup production`). */
export const INFRA_SECRETS: Record<string, SecretSpec> = {
  // hex keeps it URL-safe inside DATABASE_URL / REDIS_URL
  POSTGRES_PASSWORD: { bytes: 24, encoding: 'hex', minLength: 16, description: 'PostgreSQL owner password (migrations)' },
  POSTGRES_APP_PASSWORD: { bytes: 24, encoding: 'hex', minLength: 16, description: 'PostgreSQL application role password (DML only)' },
  REDIS_PASSWORD: { bytes: 24, encoding: 'hex', minLength: 16, description: 'Redis requirepass (BullMQ)' },
  S3_ACCESS_KEY_ID: { bytes: 16, encoding: 'hex', minLength: 16, description: 'Object storage access key (self-hosted S3)' },
  S3_SECRET_ACCESS_KEY: { bytes: 30, encoding: 'base64url', minLength: 32, description: 'Object storage secret key (self-hosted S3)' },
  SEED_ADMIN_PASSWORD: { bytes: 18, encoding: 'base64url', minLength: 12, description: 'Initial super-admin password' },
};

/** Values shipped in .env.example / dev fixtures that must never be used outside local development. */
export const KNOWN_EXAMPLE_VALUES: ReadonlySet<string> = new Set([
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  'change-me-access-secret-change-me-access-secret',
  'change-me-refresh-secret-change-me-refresh-secret',
  'change-me-renderer-secret',
  'change-me-analytics-salt',
  'atrium-secret',
  'Atrium!2026',
]);

/** Raw bytes of the example ENCRYPTION_KEY ("0123456789abcdef" twice), to catch re-encodings of it. */
const EXAMPLE_KEY_BYTES = '0123456789abcdef0123456789abcdef';

const PLACEHOLDER_PATTERNS: Array<[RegExp, string]> = [
  [/change[-_ ]?me/i, 'contains a "change-me" placeholder'],
  [/replace[-_ ]?me/i, 'contains a "REPLACE_ME" placeholder'],
  [/^(secret|password|changeit|test|dev|development|example|atrium|admin|default)$/i, 'is a well-known default'],
  [/<[^>]+>/, 'contains a <placeholder>'],
];

export interface SecretAssessment {
  ok: boolean;
  reason?: 'missing' | 'placeholder' | 'example' | 'too-short' | 'wrong-length' | 'low-entropy';
  message?: string;
}

function decodeBase64(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

/** Judge whether a secret value is acceptable for its key (spec from APP_SECRETS/INFRA_SECRETS unless given). */
export function assessSecret(key: string, value: string | undefined, spec: SecretSpec | undefined = APP_SECRETS[key] ?? INFRA_SECRETS[key]): SecretAssessment {
  if (!value) return { ok: false, reason: 'missing', message: 'not set' };
  if (KNOWN_EXAMPLE_VALUES.has(value)) return { ok: false, reason: 'example', message: 'still the .env.example value' };
  for (const example of KNOWN_EXAMPLE_VALUES) {
    if (example.length >= 12 && value.includes(example)) return { ok: false, reason: 'example', message: 'derived from the .env.example value' };
  }
  for (const [re, message] of PLACEHOLDER_PATTERNS) if (re.test(value)) return { ok: false, reason: 'placeholder', message };
  if (spec?.exactBytes) {
    const decoded = decodeBase64(value);
    if (!decoded || decoded.length !== spec.exactBytes) {
      return { ok: false, reason: 'wrong-length', message: `must be ${spec.exactBytes} bytes, base64-encoded (openssl rand -base64 ${spec.exactBytes})` };
    }
    if (new TextDecoder().decode(decoded) === EXAMPLE_KEY_BYTES) return { ok: false, reason: 'example', message: 'still the .env.example key' };
    if (new Set(decoded).size < 12) return { ok: false, reason: 'low-entropy', message: 'too few distinct bytes' };
  }
  if (spec && value.length < spec.minLength) return { ok: false, reason: 'too-short', message: `shorter than ${spec.minLength} characters` };
  if (new Set(value).size < Math.min(8, Math.floor(value.length / 3))) return { ok: false, reason: 'low-entropy', message: 'too few distinct characters' };
  return { ok: true };
}

/** `keyId:base64,keyId:base64` keyring (ENCRYPTION_KEYS) — every key must be a valid 32-byte key. */
export function assessKeyring(value: string | undefined): SecretAssessment {
  if (!value) return { ok: false, reason: 'missing', message: 'not set' };
  for (const entry of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    const idx = entry.indexOf(':');
    if (idx <= 0) return { ok: false, reason: 'wrong-length', message: 'entries must look like keyId:base64key' };
    const a = assessSecret('ENCRYPTION_KEY', entry.slice(idx + 1));
    if (!a.ok) return { ...a, message: `key "${entry.slice(0, idx)}" ${a.message}` };
  }
  return { ok: true };
}

const LOOPBACK_HOST = /^(localhost|.*\.localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\]|::1?)$/i;

/** True when a URL's host is loopback/localhost (http://localhost:3000, https://x.localhost, 127.0.0.1…). */
export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOST.test(new URL(value).hostname);
  } catch {
    return /(^|\/\/|@)(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(value);
  }
}

/** Problem with a public URL in production, or undefined when it is an https, non-local URL. */
export function publicUrlProblem(value: string | undefined, allowLoopback = false): string | undefined {
  if (!value) return 'not set';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `"${value}" is not a URL`;
  }
  if (/replace[-_]?me/i.test(value)) return `"${value}" is a placeholder`;
  if (allowLoopback && LOOPBACK_HOST.test(url.hostname)) return undefined;
  if (url.protocol !== 'https:') return `"${value}" must use https://`;
  if (LOOPBACK_HOST.test(url.hostname)) return `"${value}" points at localhost`;
  return undefined;
}

const truthy = (v: unknown) => v === true || (typeof v === 'string' && ['true', '1', 'yes', 'on'].includes(v.toLowerCase()));

export interface ProductionCheckSpec {
  /** Secrets that must be present and strong (ENCRYPTION_KEY is also satisfied by a valid ENCRYPTION_KEYS keyring). */
  required?: string[];
  /** Secrets validated only when set. */
  optional?: string[];
  /** Keys holding public URLs: must be https and not localhost (skipped when unset unless also in `requiredUrls`). */
  urls?: string[];
  /** URL keys that must be set. */
  requiredUrls?: string[];
  /** Keys holding comma-separated origin lists (CORS_ORIGINS). */
  originLists?: string[];
  /** Require COOKIE_SECURE to be effectively true. */
  cookieSecure?: boolean;
  /** Pairs of keys whose values must differ (JWT access vs refresh). */
  distinct?: Array<[string, string]>;
}

/** Secrets/URLs the API checks in production. */
export const API_PRODUCTION_SPEC: ProductionCheckSpec = {
  required: ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'RENDERER_SECRET', 'ANALYTICS_SALT'],
  optional: ['LOCAL_STORAGE_SIGNING_SECRET'],
  urls: ['ADMIN_URL', 'API_URL', 'RENDERER_URL', 'PREVIEW_URL', 'MEDIA_ORIGIN', 'S3_PUBLIC_URL', 'R2_PUBLIC_URL'],
  requiredUrls: ['ADMIN_URL', 'API_URL', 'RENDERER_URL'],
  originLists: ['CORS_ORIGINS'],
  cookieSecure: true,
  distinct: [['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']],
};

/** Secrets/URLs the worker checks in production (it signs nothing, but encrypts/decrypts provider secrets). */
export const WORKER_PRODUCTION_SPEC: ProductionCheckSpec = {
  required: ['ENCRYPTION_KEY'],
  optional: ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'RENDERER_SECRET', 'ANALYTICS_SALT'],
  urls: ['ADMIN_URL', 'API_URL', 'RENDERER_URL', 'PREVIEW_URL', 'S3_PUBLIC_URL', 'R2_PUBLIC_URL'],
  requiredUrls: ['ADMIN_URL', 'API_URL', 'RENDERER_URL'],
  distinct: [['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']],
};

export interface ProductionCheckOptions {
  /** 'secrets' limits the check to secret strength (what development warns about); default 'all'. */
  scope?: 'all' | 'secrets';
  /**
   * Allow loopback URLs (http://localhost…) and non-Secure cookies — ONLY when every public URL is
   * loopback, i.e. a production build running on a workstation/CI (`atrium start --prod` sets
   * ATRIUM_ALLOW_LOCALHOST_PRODUCTION=1). Secrets are still enforced. Defaults to that env var.
   */
  allowLoopback?: boolean;
}

/** Every production-policy violation for `env` (empty = compliant). Values are never echoed for secrets. */
export function productionConfigIssues(env: Record<string, unknown>, spec: ProductionCheckSpec, opts: ProductionCheckOptions = {}): string[] {
  const str = (k: string) => {
    const v = env[k];
    return v === undefined || v === null || v === '' ? undefined : String(v).trim() || undefined;
  };
  const issues: string[] = [];
  const allowLoopbackFlag = opts.allowLoopback ?? truthy(env.ATRIUM_ALLOW_LOCALHOST_PRODUCTION);
  const urlKeys = [...new Set([...(spec.urls ?? []), ...(spec.requiredUrls ?? [])])];
  const allUrls = [...urlKeys.map(str), ...(spec.originLists ?? []).flatMap((k) => (str(k) ?? '').split(','))].map((s) => s?.trim()).filter((s): s is string => !!s);
  // The loopback allowance only applies when nothing points at a real host.
  const allowLoopback = allowLoopbackFlag && allUrls.length > 0 && allUrls.every(isLoopbackUrl);

  for (const k of spec.required ?? []) {
    if (k === 'ENCRYPTION_KEY' && !str('ENCRYPTION_KEY') && str('ENCRYPTION_KEYS')) continue;
    const a = assessSecret(k, str(k));
    if (!a.ok) issues.push(`${k} ${a.message}${a.reason === 'missing' ? ' (required in production)' : ''} — generate one with \`atrium config set ${k} --generate\``);
  }
  for (const k of spec.optional ?? []) {
    const v = str(k);
    if (v === undefined) continue;
    const a = assessSecret(k, v);
    if (!a.ok) issues.push(`${k} ${a.message}`);
  }
  if ((spec.required ?? []).includes('ENCRYPTION_KEY') && str('ENCRYPTION_KEYS')) {
    const a = assessKeyring(str('ENCRYPTION_KEYS'));
    if (!a.ok) issues.push(`ENCRYPTION_KEYS ${a.message}`);
  }
  for (const [a, b] of spec.distinct ?? []) {
    if (str(a) && str(a) === str(b)) issues.push(`${a} and ${b} must be different secrets`);
  }
  if (opts.scope === 'secrets') return issues;
  for (const k of urlKeys) {
    const v = str(k);
    if (v === undefined && !(spec.requiredUrls ?? []).includes(k)) continue;
    const p = publicUrlProblem(v, allowLoopback);
    if (p) issues.push(`${k} ${p}`);
  }
  for (const k of spec.originLists ?? []) {
    const origins = (str(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!origins.length) issues.push(`${k} is empty`);
    for (const o of origins) {
      if (o === '*') issues.push(`${k} must not contain "*"`);
      else {
        const p = publicUrlProblem(o, allowLoopback);
        if (p) issues.push(`${k}: ${p}`);
      }
    }
  }
  if (spec.cookieSecure && !allowLoopback) {
    const v = env.COOKIE_SECURE;
    if (v !== undefined && v !== '' && !truthy(v)) issues.push('COOKIE_SECURE must be true (auth cookies over https only)');
  }
  return issues;
}

export class ProductionConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Refusing to start: insecure production configuration (NODE_ENV=production):\n${issues.map((i) => `  - ${i}`).join('\n')}\nFix the values above (see .env.example and docs/deployment) — they are never defaulted in production.`);
    this.name = 'ProductionConfigError';
  }
}

/**
 * Enforce the production policy. NODE_ENV=production (or `opts.nodeEnv`) → throws ProductionConfigError
 * on any violation. Otherwise → checks secrets only, calls `warn` once with a summary (if provided) and returns the issues.
 */
export function assertProductionSecrets(
  env: Record<string, unknown>,
  spec: ProductionCheckSpec,
  opts: ProductionCheckOptions & { nodeEnv?: string; warn?: (message: string) => void } = {},
): string[] {
  const nodeEnv = opts.nodeEnv ?? (env.NODE_ENV as string | undefined);
  if (nodeEnv === 'production') {
    const issues = productionConfigIssues(env, spec, { ...opts, scope: 'all' });
    if (issues.length) throw new ProductionConfigError(issues);
    return issues;
  }
  // Development/test: only weak secrets are worth a hint (localhost URLs and http cookies are expected).
  const issues = productionConfigIssues(env, spec, { ...opts, scope: 'secrets' });
  if (!issues.length) return issues;
  opts.warn?.(`[atrium] ${issues.length} setting(s) would block a production start (fine for local development): ${issues.map((i) => i.split(' — ')[0]).join('; ')}`);
  return issues;
}
