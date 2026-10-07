import { API_PRODUCTION_SPEC, assertProductionSecrets } from '@atrium/server-kit';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

loadDotenv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
loadDotenv({ quiet: true });

const bool = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === 'true' || v === '1');
/** Optional boolean: unset/"" → undefined so the default can depend on NODE_ENV. */
const optionalBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v === true || ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase())));
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

/**
 * Express `trust proxy`: "false" (default — do not trust X-Forwarded-*), "true" (trust everything —
 * only when the API is reachable exclusively through your proxy), a hop count ("1" = one proxy such as
 * Caddy/ALB/ingress-nginx in front), or a comma list of addresses/subnets/names
 * ("loopback,uniquelocal" = trust private-network proxies). Pass the value straight to `app.set('trust proxy', …)`.
 */
const trustProxy = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v): boolean | number | string => {
    if (v === undefined || v === '') return false;
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    if (['true', 'yes', 'on'].includes(s)) return true;
    if (['false', 'no', 'off', '0'].includes(s)) return false;
    if (/^\d+$/.test(s)) return Number(s);
    return v.trim();
  });

const EnvSchema = z
  .object({
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
    /** Visitor-hash salt. Development falls back to "atrium"; production has NO default (startup fails). */
    ANALYTICS_SALT: optionalString,
    COOKIE_DOMAIN: z.string().optional(),
    /** Secure (https-only) auth cookies. Default: true in production, false otherwise; "false" in production refuses to start. */
    COOKIE_SECURE: optionalBool,
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    /** See `trustProxy` above. Default false; production templates set it explicitly. */
    TRUST_PROXY: trustProxy,
    /** Allow outbound requests (webhooks, HTTP actions, link previews, imports) to private/loopback/link-local IPs. Default: false in production, true otherwise. */
    OUTBOUND_ALLOW_PRIVATE: optionalBool,
    /** Super admins must have MFA enabled to use /admin endpoints. Default: true in production, false otherwise. */
    SUPER_ADMIN_REQUIRE_MFA: optionalBool,
    /** Anyone may create an account. Default: false in production (accounts only through invitations), true otherwise. */
    OPEN_SIGNUP: optionalBool,
    /** Separate cookieless origin user uploads are served from (e.g. https://media.example.com). Optional. */
    MEDIA_ORIGIN: optionalString.pipe(z.string().url().optional()),
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
  })
  .transform((e) => {
    const production = e.NODE_ENV === 'production';
    return {
      ...e,
      ANALYTICS_SALT: e.ANALYTICS_SALT ?? (production ? '' : 'atrium'),
      COOKIE_SECURE: e.COOKIE_SECURE ?? production,
      OUTBOUND_ALLOW_PRIVATE: e.OUTBOUND_ALLOW_PRIVATE ?? !production,
      SUPER_ADMIN_REQUIRE_MFA: e.SUPER_ADMIN_REQUIRE_MFA ?? production,
      OPEN_SIGNUP: e.OPEN_SIGNUP ?? !production,
    };
  });

export type Env = z.output<typeof EnvSchema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    }
    // NODE_ENV=production: refuse to start with missing/weak/placeholder secrets, non-https or localhost
    // public URLs, or insecure cookies. Elsewhere: a single warning about weak secrets.
    // Raw env is checked (not the defaulted values) so e.g. an unset ANALYTICS_SALT is caught.
    assertProductionSecrets({ ...process.env, COOKIE_SECURE: parsed.data.COOKIE_SECURE }, API_PRODUCTION_SPEC, {
      nodeEnv: parsed.data.NODE_ENV,
      warn: parsed.data.NODE_ENV === 'development' ? (m) => console.warn(m) : undefined,
    });
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
