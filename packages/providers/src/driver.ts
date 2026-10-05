import { z } from 'zod';

export type ProviderKind = 'storage' | 'email' | 'sms' | 'ai' | 'deployment' | 'captcha' | 'search';

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
  create(config: z.output<C>, secrets: z.output<S>): T;
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

/** Mask a secret for display: ••••••••abcd */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return '';
  return `••••••••${value.slice(-4)}`;
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
