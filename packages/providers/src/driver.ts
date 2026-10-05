import { z } from 'zod';
import type { NetworkPolicy } from './net/policy';

export type ProviderKind = 'storage' | 'email' | 'sms' | 'ai' | 'deployment' | 'captcha' | 'search';

/**
 * Where a provider instance comes from, passed to `create()`:
 *  - `network: 'public-only'` — tenant configuration (DB rows): outbound connections are limited
 *    to public addresses (unless OUTBOUND_ALLOW_PRIVATE), local storage is jailed per org.
 *  - `network: 'trusted'` — platform configuration from env (platform SMTP/S3/Vercel…).
 * Omitted context = `public-only` (fail closed).
 */
export interface DriverContext {
  network: NetworkPolicy;
  /** Owning organization (tenant rows); scopes the `local` storage driver to `orgs/<id>`. */
  organizationId?: string;
  /** Environment used for platform paths such as LOCAL_STORAGE_DIR (default process.env). */
  env?: Record<string, string | undefined>;
}

export const TENANT_CONTEXT: DriverContext = Object.freeze({ network: 'public-only' as const });
export const TRUSTED_CONTEXT: DriverContext = Object.freeze({ network: 'trusted' as const });

/**
 * A driver describes one adapter: its public config, its secret fields (stored
 * encrypted, never returned to clients) and a factory. The admin renders config
 * forms from the schemas; the API instantiates drivers with decrypted secrets.
 */
export interface ProviderDriver<C extends z.ZodType = z.ZodType, S extends z.ZodType = z.ZodType, T = unknown> {
  kind: ProviderKind;
  id: string;
  name: string;
  description: string;
  configSchema: C;
  secretsSchema: S;
  /** Optional presets (e.g. Gmail SMTP host/port). */
  presets?: Array<{ id: string; name: string; config: Partial<z.input<C>> }>;
  create(config: z.output<C>, secrets: z.output<S>, ctx?: DriverContext): T;
}

export function defineDriver<C extends z.ZodType, S extends z.ZodType, T>(d: ProviderDriver<C, S, T>): ProviderDriver<C, S, T> {
  return d;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryable = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Mask a secret for display: `••••••••abcd`. Short secrets (< 12 chars) reveal nothing —
 * showing the last 4 of an 8-char password would leak half of it.
 */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return '';
  return value.length < 12 ? '••••••••' : `••••••••${value.slice(-4)}`;
}

/** Describe a driver for clients: JSON schemas + which fields are secret. */
export function describeDriver(d: ProviderDriver) {
  return {
    kind: d.kind,
    id: d.id,
    name: d.name,
    description: d.description,
    config: z.toJSONSchema(d.configSchema, { io: 'input', unrepresentable: 'any' }),
    secrets: z.toJSONSchema(d.secretsSchema, { io: 'input', unrepresentable: 'any' }),
    presets: d.presets ?? [],
  };
}
