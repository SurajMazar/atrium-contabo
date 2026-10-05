import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

loadDotenv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
loadDotenv({ quiet: true });

const bool = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().default('http://localhost:4000'),
  ADMIN_URL: z.string().default('http://localhost:3000'),
  RENDERER_URL: z.string().default('http://localhost:3001'),
  PREVIEW_URL: z.string().default('http://localhost:3001'),
  PLATFORM_SITES_DOMAIN: z.string().default('sites.localhost:3001'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:56379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  ENCRYPTION_KEY: z.string(),
  RENDERER_SECRET: z.string().min(8),
  ANALYTICS_SALT: z.string().default('atrium'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.default(false),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  TRUST_PROXY: bool.default(true),
  MAIL_FROM: z.string().default('Atrium <no-reply@atrium.localhost>'),
  AI_DEFAULT_PROVIDER: z.string().default('anthropic'),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  UPLOAD_MAX_MB: z.coerce.number().default(100),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  DISABLE_QUEUES: bool.default(false),
  SWAGGER: bool.default(true),
  /** DNS targets customers point custom domains at (platform-hosted mode). */
  PLATFORM_CNAME_TARGET: z.string().default('cname.atrium.example.com'),
  PLATFORM_INGRESS_IP: z.string().default('203.0.113.10'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** `{slug}.{PLATFORM_SITES_DOMAIN}` URL for a website. */
export function platformUrl(slug: string): string {
  const domain = env().PLATFORM_SITES_DOMAIN;
  const secure = !/localhost|\.test(:|$)/.test(domain);
  return `${secure ? 'https' : 'http'}://${slug}.${domain}`;
}
