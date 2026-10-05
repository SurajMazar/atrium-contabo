import { randomBytes } from 'node:crypto';

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
  JWT_ACCESS_SECRET: {
    bytes: 48,
    encoding: 'base64url',
    minLength: 32,
    description: 'Signs 15-minute access tokens',
  },
  JWT_REFRESH_SECRET: {
    bytes: 48,
    encoding: 'base64url',
    minLength: 32,
    description: 'Signs refresh tokens',
  },
  ENCRYPTION_KEY: {
    bytes: 32,
    encoding: 'base64',
    minLength: 44,
    exactBytes: 32,
    description: 'AES-256-GCM key for provider secrets at rest',
  },
  RENDERER_SECRET: {
    bytes: 32,
    encoding: 'base64url',
    minLength: 32,
    description: 'Shared secret between API and renderer',
  },
  ANALYTICS_SALT: {
    bytes: 24,
    encoding: 'base64url',
    minLength: 24,
    description: 'Salt for privacy-preserving visitor hashes',
  },
};

/** Extra secrets generated for production environments (`setup production`). */
export const INFRA_SECRETS: Record<string, SecretSpec> = {
  // hex keeps it URL-safe inside DATABASE_URL
  POSTGRES_PASSWORD: {
    bytes: 24,
    encoding: 'hex',
    minLength: 16,
    description: 'PostgreSQL password',
  },
  S3_ACCESS_KEY_ID: {
    bytes: 16,
    encoding: 'hex',
    minLength: 16,
    description: 'Object storage access key (self-hosted S3)',
  },
  S3_SECRET_ACCESS_KEY: {
    bytes: 30,
    encoding: 'base64url',
    minLength: 32,
    description: 'Object storage secret key (self-hosted S3)',
  },
  SEED_ADMIN_PASSWORD: {
    bytes: 18,
    encoding: 'base64url',
    minLength: 12,
    description: 'Initial super-admin password',
  },
};

/** Values shipped in .env.example that must never be used outside local development. */
export const KNOWN_EXAMPLE_VALUES = new Set([
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  'change-me-access-secret-change-me-access-secret',
  'change-me-refresh-secret-change-me-refresh-secret',
  'change-me-renderer-secret',
  'change-me-analytics-salt',
]);

export function randomSecret(bytes: number, encoding: SecretEncoding = 'base64url'): string {
  return randomBytes(bytes).toString(encoding);
}

export function generateSecret(key: string): string {
  const spec = APP_SECRETS[key] ?? INFRA_SECRETS[key];
  if (!spec) return randomSecret(32);
  return randomSecret(spec.bytes, spec.encoding);
}

export interface SecretAssessment {
  ok: boolean;
  reason?: 'missing' | 'placeholder' | 'example' | 'too-short' | 'wrong-length' | 'low-entropy';
  message?: string;
}

/** Judge whether a secret value is acceptable. */
export function assessSecret(key: string, value: string | undefined): SecretAssessment {
  const spec = APP_SECRETS[key] ?? INFRA_SECRETS[key];
  if (!value) return { ok: false, reason: 'missing', message: 'not set' };
  if (KNOWN_EXAMPLE_VALUES.has(value))
    return { ok: false, reason: 'example', message: 'still the .env.example value' };
  if (/change[-_]?me/i.test(value))
    return { ok: false, reason: 'placeholder', message: 'contains a "change-me" placeholder' };
  if (spec?.exactBytes) {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== spec.exactBytes || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      return {
        ok: false,
        reason: 'wrong-length',
        message: `must be ${spec.exactBytes} bytes, base64-encoded (openssl rand -base64 ${spec.exactBytes})`,
      };
    }
  }
  if (spec && value.length < spec.minLength)
    return { ok: false, reason: 'too-short', message: `shorter than ${spec.minLength} characters` };
  if (new Set(value).size < Math.min(8, Math.floor(value.length / 3)))
    return { ok: false, reason: 'low-entropy', message: 'too few distinct characters' };
  return { ok: true };
}

/** Keys whose values are secret and must be masked in output. */
export function isSecretKey(key: string): boolean {
  if (key in APP_SECRETS || key in INFRA_SECRETS) return true;
  return /(SECRET|PASSWORD|PASSWD|TOKEN|SALT|PRIVATE|_KEY$|_KEY_ID$|API_KEY|CREDENTIALS)/.test(key);
}

/** Keys whose values are URLs that may embed credentials. */
export function isUrlKey(key: string): boolean {
  return /(_URL|_DSN|_URI)$/.test(key);
}
