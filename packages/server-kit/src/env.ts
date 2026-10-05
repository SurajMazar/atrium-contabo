import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** "true"/"1"/"yes"/"on" → true; "false"/"0"/"no"/"off"/"" → false. (z.coerce.boolean treats "false" as true.) */
export const boolish = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : typeof v === 'boolean' ? v : ['true', '1', 'yes', 'on'].includes(v.toLowerCase())));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));
const int = (def: number) => z.coerce.number().int().default(def);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  ADMIN_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  RENDERER_URL: z.string().url().default('http://localhost:3001'),
  PREVIEW_URL: optionalString,
  PLATFORM_SITES_DOMAIN: z.string().default('sites.localhost:3001'),
  PLATFORM_INGRESS_IPV4: optionalString,
  PLATFORM_INGRESS_CNAME: optionalString,

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  QUEUE_PREFIX: z.string().default('atrium'),

  ENCRYPTION_KEY: optionalString,
  ENCRYPTION_KEYS: optionalString,
  ENCRYPTION_KEY_ID: optionalString,
  JWT_ACCESS_SECRET: optionalString,
  JWT_REFRESH_SECRET: optionalString,
  RENDERER_SECRET: optionalString,
  ANALYTICS_SALT: optionalString,

  STORAGE_DRIVER: z.enum(['s3', 'local', 'azure-blob']).default('local'),
  S3_ENDPOINT: optionalString,
  S3_PUBLIC_URL: optionalString,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: boolish(false),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  LOCAL_STORAGE_PUBLIC_URL: z.string().default('http://localhost:4000/v1/storage'),
  LOCAL_STORAGE_SIGNING_SECRET: optionalString,
  AZURE_STORAGE_ACCOUNT: optionalString,
  AZURE_STORAGE_CONTAINER: optionalString,
  AZURE_STORAGE_KEY: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: int(587),
  SMTP_SECURE: boolish(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().default('Atrium <no-reply@atrium.localhost>'),

  AI_DEFAULT_PROVIDER: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,

  VERCEL_TOKEN: optionalString,
  VERCEL_TEAM_ID: optionalString,

  SENTRY_DSN: optionalString,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
});

export type AtriumEnv = z.output<typeof EnvSchema>;

/** Walk up from `start` to find the workspace root `.env` (stops at pnpm-workspace.yaml or filesystem root). */
export function findEnvFile(start = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

let loaded = false;

/** Load the root `.env` into process.env once (existing variables win). Safe to call repeatedly. */
export function loadDotenvOnce(path?: string): string | undefined {
  if (loaded && !path) return undefined;
  loaded = true;
  const file = path ?? findEnvFile();
  if (file) loadDotenv({ path: file, quiet: true });
  return file;
}

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validate the environment shared by API/worker/CLI. `required` lists keys that must be
 * present for the calling process (e.g. ['ENCRYPTION_KEY'] for the worker).
 */
export function loadEnv(opts: { dotenv?: boolean; source?: Record<string, string | undefined>; required?: Array<keyof AtriumEnv> } = {}): AtriumEnv {
  if (opts.dotenv !== false && !opts.source) loadDotenvOnce();
  const source = opts.source ?? process.env;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) throw new EnvValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const missing = (opts.required ?? []).filter((k) => {
    // Either ENCRYPTION_KEY or a rotated ENCRYPTION_KEYS keyring satisfies the encryption requirement.
    if (k === 'ENCRYPTION_KEY') return !parsed.data.ENCRYPTION_KEY && !parsed.data.ENCRYPTION_KEYS;
    return parsed.data[k] === undefined || parsed.data[k] === '';
  });
  if (missing.length) throw new EnvValidationError(missing.map((k) => `${String(k)} is required`));
  return parsed.data;
}
