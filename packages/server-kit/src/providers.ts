import {
  instantiateProvider,
  maskSecret,
  ProviderError,
  parseAddress,
  type AIProvider,
  type CaptchaVerifier,
  type DeploymentProvider,
  type EmailAddress,
  type EmailProvider,
  type ProviderKind,
  type SmsProvider,
  type StorageProvider,
} from '@atrium/providers';
import type { PrismaClient } from '@atrium/db';
import { decryptJson, deriveSecret, encryptJson } from './crypto';

// ───────────────────────────── Row shapes (subset of Prisma models) ─────────────────────────────

interface BaseProviderRow {
  id: string;
  organizationId: string;
  name: string;
  driver: string;
  config: unknown;
  secretsEnc: string | null;
  isDefault: boolean;
  updatedAt: Date;
}
export interface EmailProviderRow extends BaseProviderRow {
  websiteId: string | null;
  fromEmail: string;
  fromName: string | null;
}
export interface SmsProviderRow extends BaseProviderRow {
  websiteId: string | null;
}
export type StorageProviderRow = BaseProviderRow;
export interface IntegrationRow extends BaseProviderRow {
  websiteId: string | null;
  kind: 'AI' | 'DEPLOYMENT' | 'CAPTCHA' | 'ANALYTICS' | 'GIT' | 'SEARCH' | 'OTHER';
  enabled: boolean;
}

interface Delegate<T> {
  findFirst(args: { where: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>> }): Promise<T | null>;
}

/** Minimal structural view of the Prisma client used by the resolver (lets tests pass plain mocks). */
export interface ResolverPrisma {
  emailProvider: Delegate<EmailProviderRow>;
  smsProvider: Delegate<SmsProviderRow>;
  storageProvider: Delegate<StorageProviderRow>;
  integration: Delegate<IntegrationRow>;
  website: { findUnique(args: { where: { id: string }; select?: Record<string, boolean> }): Promise<{ id: string; organizationId: string; deploymentIntegrationId: string | null; deploymentProvider: string | null } | null> };
}

export type ResolutionSource = 'explicit' | 'website' | 'organization' | 'platform';

export interface ResolvedMeta<T> {
  /** The raw provider instance. */
  provider: T;
  /** Provider/integration row id; null for platform (env) fallbacks. */
  id: string | null;
  driver: string;
  name: string;
  source: ResolutionSource;
}
/**
 * A resolved provider is usable directly (`(await resolver.email(...)).send(...)`) and also
 * exposes resolution metadata (`.provider`, `.id`, `.source`, `.name`).
 */
export type Resolved<T> = T & ResolvedMeta<T>;
export type ResolvedEmail = Resolved<EmailProvider> & { from: EmailAddress };

/** Wrap an instance so its methods/props work as-is while metadata props are layered on top. */
export function withMeta<T extends object, M extends ResolvedMeta<T>>(instance: T, meta: M): T & M {
  return new Proxy(instance, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(meta, prop)) return (meta as Record<PropertyKey, unknown>)[prop];
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    has(target, prop) {
      return prop in meta || prop in target;
    },
    ownKeys(target) {
      return [...new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(meta)])];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (Object.prototype.hasOwnProperty.call(meta, prop)) {
        return { value: (meta as Record<PropertyKey, unknown>)[prop], writable: false, enumerable: true, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  }) as T & M;
}

export interface ProviderResolverOptions {
  env?: Record<string, string | undefined>;
  /** Instance cache TTL (default 60s). Instances are also keyed by the row's updatedAt. */
  cacheTtlMs?: number;
  /** Override secret decryption (tests). */
  decrypt?: (enc: string) => Record<string, unknown>;
}

const CAPTCHA_DRIVERS = ['recaptcha-v2', 'recaptcha-v3', 'turnstile', 'hcaptcha'] as const;

/**
 * Resolves provider instances for a tenant: explicit id → website default → organization
 * default → platform env fallback. Secrets are decrypted only in memory and never logged.
 */
export class ProviderResolver {
  private readonly db: ResolverPrisma;
  private readonly env: Record<string, string | undefined>;
  private readonly ttl: number;
  private readonly decrypt: (enc: string) => Record<string, unknown>;
  private readonly cache = new Map<string, { value: unknown; expiresAt: number; rowId: string | null }>();

  constructor(prisma: PrismaClient | ResolverPrisma, opts: ProviderResolverOptions = {}) {
    this.db = prisma as unknown as ResolverPrisma;
    this.env = opts.env ?? process.env;
    this.ttl = opts.cacheTtlMs ?? 60_000;
    this.decrypt = opts.decrypt ?? ((enc) => decryptJson<Record<string, unknown>>(enc));
  }

  /** Drop cached instances for a provider/integration id (call after updates/deletes), or everything. */
  invalidate(id?: string): void {
    if (!id) {
      this.cache.clear();
      return;
    }
    for (const [key, entry] of this.cache) if (entry.rowId === id || key.includes(`:${id}:`)) this.cache.delete(key);
  }

  private cached<T>(key: string, rowId: string | null, build: () => T): T {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const value = build();
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttl, rowId });
    return value;
  }

  private secretsOf(row: { secretsEnc: string | null; id: string }): Record<string, unknown> {
    if (!row.secretsEnc) return {};
    try {
      return this.decrypt(row.secretsEnc);
    } catch (err) {
      throw new ProviderError(`Could not decrypt secrets for provider ${row.id} (${(err as Error).message})`, 'resolver', false);
    }
  }

  private fromRow<K extends ProviderKind, R extends BaseProviderRow>(kind: K, row: R, source: ResolutionSource, extraConfig?: Record<string, unknown>) {
    const key = `${kind}:${row.id}:${row.updatedAt.getTime()}`;
    const provider = this.cached(key, row.id, () => {
      const config = { ...((row.config as Record<string, unknown>) ?? {}), ...(extraConfig ?? {}) };
      return instantiateProvider(kind, row.driver, config, this.secretsOf(row));
    });
    return { provider, id: row.id, driver: row.driver, name: row.name, source };
  }

  private wrap<T extends object, X extends object = object>(meta: ResolvedMeta<T>, extra?: X): Resolved<T> & X {
    return withMeta(meta.provider, { ...meta, ...(extra ?? ({} as X)) }) as Resolved<T> & X;
  }

  /** Generic lookup chain over a delegate. */
  private async lookup<R extends BaseProviderRow & { websiteId?: string | null }>(
    delegate: Delegate<R>,
    label: string,
    args: { organizationId: string; websiteId?: string | null; providerId?: string | null },
    extraWhere: Record<string, unknown> = {},
    supportsWebsite = true,
  ): Promise<{ row: R; source: ResolutionSource } | null> {
    if (args.providerId) {
      const row = await delegate.findFirst({ where: { id: args.providerId, organizationId: args.organizationId, ...extraWhere } });
      if (!row) throw new ProviderError(`${label} provider ${args.providerId} not found for this organization`, 'resolver', false);
      return { row, source: 'explicit' };
    }
    if (supportsWebsite && args.websiteId) {
      const row = await delegate.findFirst({ where: { organizationId: args.organizationId, websiteId: args.websiteId, ...extraWhere }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
      if (row) return { row, source: 'website' };
    }
    const orgWhere = supportsWebsite ? { websiteId: null } : {};
    const row =
      (await delegate.findFirst({ where: { organizationId: args.organizationId, isDefault: true, ...orgWhere, ...extraWhere } })) ??
      (await delegate.findFirst({ where: { organizationId: args.organizationId, ...orgWhere, ...extraWhere }, orderBy: { updatedAt: 'desc' } }));
    return row ? { row, source: 'organization' } : null;
  }

  // ───────────────────────────── Email ─────────────────────────────

  /** Email provider. `organizationId` null/undefined → platform SMTP (password resets, invitations). */
  async email(args: { organizationId?: string | null; websiteId?: string | null; providerId?: string | null } = {}): Promise<ResolvedEmail> {
    if (args.organizationId) {
      const found = await this.lookup(this.db.emailProvider, 'Email', { organizationId: args.organizationId, websiteId: args.websiteId, providerId: args.providerId });
      if (found) {
        const from = { email: found.row.fromEmail, name: found.row.fromName ?? undefined };
        return this.wrap(this.fromRow('email', found.row, found.source, { defaultFrom: from }), { from });
      }
    }
    return this.platformEmail();
  }

  platformEmail(): ResolvedEmail {
    const env = this.env;
    if (!env.SMTP_HOST) throw new ProviderError('No email provider configured and platform SMTP (SMTP_HOST) is not set', 'resolver', false);
    const from = parseAddress(env.MAIL_FROM || 'Atrium <no-reply@atrium.localhost>');
    const provider = this.cached('email:platform', null, () =>
      instantiateProvider(
        'email',
        'smtp',
        {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT ?? 587),
          secure: ['true', '1', 'yes'].includes((env.SMTP_SECURE ?? '').toLowerCase()),
          username: env.SMTP_USER || undefined,
          defaultFrom: from,
        },
        { password: env.SMTP_PASSWORD || undefined },
      ),
    );
    return this.wrap({ provider, id: null, driver: 'smtp', name: 'Platform SMTP', source: 'platform' }, { from });
  }

  // ───────────────────────────── SMS ─────────────────────────────

  async sms(args: { organizationId: string; websiteId?: string | null; providerId?: string | null }): Promise<Resolved<SmsProvider>> {
    const found = await this.lookup(this.db.smsProvider, 'SMS', args);
    if (!found) throw new ProviderError('No SMS provider is configured for this organization', 'resolver', false);
    return this.wrap(this.fromRow('sms', found.row, found.source));
  }

  // ───────────────────────────── Storage ─────────────────────────────

  /** Storage provider; without organization (or with no org provider) → platform storage from env. */
  async storage(args: { organizationId?: string | null; providerId?: string | null } = {}): Promise<Resolved<StorageProvider>> {
    if (args.organizationId) {
      const found = await this.lookup(this.db.storageProvider, 'Storage', { organizationId: args.organizationId, providerId: args.providerId }, {}, false);
      if (found) return this.wrap(this.fromRow('storage', found.row, found.source));
    } else if (args.providerId) {
      throw new ProviderError('providerId requires organizationId', 'resolver', false);
    }
    return this.platformStorage();
  }

  platformStorage(): Resolved<StorageProvider> {
    const env = this.env;
    const driver = (env.STORAGE_DRIVER || 'local') as 's3' | 'local' | 'azure-blob';
    const provider = this.cached(`storage:platform:${driver}`, null, () => {
      if (driver === 's3') {
        if (!env.S3_BUCKET) throw new ProviderError('STORAGE_DRIVER=s3 requires S3_BUCKET', 'resolver', false);
        return instantiateProvider(
          'storage',
          's3',
          {
            bucket: env.S3_BUCKET,
            region: env.S3_REGION || 'us-east-1',
            endpoint: env.S3_ENDPOINT || undefined,
            forcePathStyle: ['true', '1', 'yes'].includes((env.S3_FORCE_PATH_STYLE ?? '').toLowerCase()),
            accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
            publicUrl: env.S3_PUBLIC_URL || undefined,
          },
          { secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined },
        );
      }
      if (driver === 'azure-blob') {
        return instantiateProvider('storage', 'azure-blob', { accountName: env.AZURE_STORAGE_ACCOUNT, container: env.AZURE_STORAGE_CONTAINER }, { accountKey: env.AZURE_STORAGE_KEY });
      }
      return instantiateProvider(
        'storage',
        'local',
        { directory: env.LOCAL_STORAGE_DIR || './storage', publicBaseUrl: env.LOCAL_STORAGE_PUBLIC_URL || 'http://localhost:4000/v1/storage' },
        { signingSecret: localStorageSigningSecret(env) },
      );
    });
    return this.wrap({ provider, id: null, driver, name: 'Platform storage', source: 'platform' });
  }

  // ───────────────────────────── AI ─────────────────────────────

  /** AI provider: explicit integration → website → organization → platform keys (AI_DEFAULT_PROVIDER first). */
  async ai(args: { organizationId?: string | null; websiteId?: string | null; integrationId?: string | null; providerId?: string | null; driver?: string } = {}): Promise<Resolved<AIProvider>> {
    if (args.organizationId) {
      const found = await this.lookup(
        this.db.integration,
        'AI',
        { organizationId: args.organizationId, websiteId: args.websiteId, providerId: args.integrationId ?? args.providerId },
        { kind: 'AI', enabled: true, ...(args.driver ? { driver: args.driver } : {}) },
      );
      if (found) return this.wrap(this.fromRow('ai', found.row, found.source));
    }
    return this.platformAi(args.driver);
  }

  platformAi(preferred?: string): Resolved<AIProvider> {
    const env = this.env;
    const keys: Record<string, { key?: string; model?: string }> = {
      anthropic: { key: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL },
      openai: { key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
      gemini: { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
    };
    const order = [preferred, env.AI_DEFAULT_PROVIDER || 'anthropic', 'anthropic', 'openai', 'gemini'].filter((d): d is string => !!d && d in keys);
    const driver = order.find((d) => keys[d]!.key);
    if (!driver) throw new ProviderError('No AI provider configured: connect one in Integrations or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY', 'resolver', false);
    const { key, model } = keys[driver]!;
    const provider = this.cached(`ai:platform:${driver}`, null, () => instantiateProvider('ai', driver, model ? { defaultModel: model } : {}, { apiKey: key }));
    return this.wrap({ provider, id: null, driver, name: `Platform ${driver}`, source: 'platform' });
  }

  // ───────────────────────────── Captcha ─────────────────────────────

  /**
   * Captcha verifier for a website form. `kind` narrows to one driver (recaptcha-v3, turnstile…).
   * Fails closed: throws when nothing matching is configured (use `findCaptcha` for a nullable lookup).
   */
  async captcha(args: { organizationId: string; websiteId: string; integrationId?: string | null; kind?: string }): Promise<Resolved<CaptchaVerifier>> {
    const found = await this.findCaptcha(args);
    if (!found) throw new ProviderError(`No ${args.kind ?? 'captcha'} integration is configured for this website`, 'resolver', false);
    return found;
  }

  /** Nullable variant of `captcha()`. */
  async findCaptcha(args: { organizationId: string; websiteId: string; integrationId?: string | null; kind?: string }): Promise<Resolved<CaptchaVerifier> | null> {
    if (args.kind && !(CAPTCHA_DRIVERS as readonly string[]).includes(args.kind)) return null;
    const found = await this.lookup(this.db.integration, 'Captcha', { organizationId: args.organizationId, websiteId: args.websiteId, providerId: args.integrationId }, {
      kind: 'CAPTCHA',
      enabled: true,
      ...(args.kind ? { driver: args.kind } : {}),
    });
    return found ? this.wrap(this.fromRow('captcha', found.row, found.source)) : null;
  }

  // ───────────────────────────── Deployment ─────────────────────────────

  /**
   * Deployment provider for independent deployments: explicit integration → the website's
   * configured integration → website/org default DEPLOYMENT integration → platform VERCEL_TOKEN.
   * Use `platformDeployment()` for platform-hosted mode.
   */
  async deployment(args: { organizationId: string; websiteId?: string | null; integrationId?: string | null; providerId?: string | null; driver?: string }): Promise<Resolved<DeploymentProvider>> {
    let integrationId = args.integrationId ?? args.providerId;
    let driver = args.driver;
    if (!integrationId && args.websiteId) {
      const site = await this.db.website.findUnique({ where: { id: args.websiteId }, select: { id: true, organizationId: true, deploymentIntegrationId: true, deploymentProvider: true } });
      if (site && site.organizationId === args.organizationId) {
        integrationId = site.deploymentIntegrationId;
        driver ??= site.deploymentProvider ?? undefined;
      }
    }
    if (driver === 'self-hosted') return this.platformDeployment();
    const found = await this.lookup(
      this.db.integration,
      'Deployment',
      { organizationId: args.organizationId, websiteId: args.websiteId, providerId: integrationId },
      { kind: 'DEPLOYMENT', enabled: true, ...(driver && !integrationId ? { driver } : {}) },
    );
    if (found) return this.wrap(this.fromRow('deployment', found.row, found.source));
    if ((!driver || driver === 'vercel') && this.env.VERCEL_TOKEN) {
      const provider = this.cached('deployment:platform:vercel', null, () => instantiateProvider('deployment', 'vercel', { teamId: this.env.VERCEL_TEAM_ID || undefined }, { token: this.env.VERCEL_TOKEN }));
      return this.wrap({ provider, id: null, driver: 'vercel', name: 'Platform Vercel', source: 'platform' });
    }
    throw new ProviderError(`No ${driver ?? 'deployment'} integration is configured for this organization`, 'resolver', false);
  }

  /** Platform-hosted (self-hosted driver) built from PLATFORM_SITES_DOMAIN / ingress env. */
  platformDeployment(): Resolved<DeploymentProvider> {
    const provider = this.cached('deployment:platform:self-hosted', null, () => {
      const raw = this.env.PLATFORM_SITES_DOMAIN || 'sites.localhost';
      const [host, port] = raw.split(':') as [string, string | undefined];
      return instantiateProvider(
        'deployment',
        'self-hosted',
        {
          platformDomain: host,
          port: port ? Number(port) : undefined,
          protocol: host.endsWith('localhost') ? 'http' : 'https',
          ingressIPv4: this.env.PLATFORM_INGRESS_IPV4 || undefined,
          ingressCname: this.env.PLATFORM_INGRESS_CNAME || undefined,
        },
        {},
      );
    });
    return this.wrap({ provider, id: null, driver: 'self-hosted', name: 'Platform hosting', source: 'platform' });
  }
}

/** Secret for local-storage signed URLs: LOCAL_STORAGE_SIGNING_SECRET or derived from the encryption key. */
export function localStorageSigningSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.LOCAL_STORAGE_SIGNING_SECRET) return env.LOCAL_STORAGE_SIGNING_SECRET;
  try {
    return deriveSecret('local-storage-urls', env);
  } catch {
    return undefined;
  }
}

// ───────────────────────────── Client-safe serialization ─────────────────────────────

export const MASK_PREFIX = '••••';

function maskDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value ? maskSecret(value) : '';
  if (typeof value === 'number' || typeof value === 'boolean') return '••••••••';
  if (Array.isArray(value)) return value.map(maskDeep);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskDeep(v)]));
  return '••••••••';
}

export function isMasked(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(MASK_PREFIX);
}

/**
 * Client-safe representation of a provider/integration row: drops `secretsEnc`/`secretEnc`
 * and returns masked secret values (`••••••••abcd`) so forms can show which secrets are set.
 */
export function serializeProviderRecord<T extends { secretsEnc?: string | null; secretEnc?: string | null }>(
  row: T,
  decrypt: (enc: string) => Record<string, unknown> = (enc) => decryptJson<Record<string, unknown>>(enc),
): Omit<T, 'secretsEnc' | 'secretEnc'> & { secrets: Record<string, unknown>; hasSecrets: boolean; secretsError?: boolean } {
  const { secretsEnc, secretEnc, ...rest } = row;
  const enc = secretsEnc ?? secretEnc ?? null;
  let secrets: Record<string, unknown> = {};
  let secretsError: boolean | undefined;
  if (enc) {
    try {
      const plain = decrypt(enc);
      secrets = (maskDeep(plain && typeof plain === 'object' ? plain : { value: plain }) as Record<string, unknown>) ?? {};
    } catch {
      secretsError = true;
    }
  }
  return { ...rest, secrets, hasSecrets: Boolean(enc), ...(secretsError ? { secretsError } : {}) };
}

function mergeValues(existing: unknown, incoming: unknown): unknown {
  if (incoming === undefined || isMasked(incoming) || incoming === '') return existing;
  if (incoming === null) return undefined;
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming) && existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const out: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      const merged = mergeValues(out[k], v);
      if (merged === undefined) delete out[k];
      else out[k] = merged;
    }
    return out;
  }
  return incoming;
}

/**
 * Merge incoming secret fields into the existing encrypted blob:
 *  - key missing / `undefined` / masked (`••••…`) / empty string → keep the existing value
 *  - `null` → remove the secret
 *  - anything else → replace
 * Returns the new ciphertext, or null when no secrets remain. `incoming` undefined = unchanged.
 */
export function mergeSecrets(
  existingEnc: string | null | undefined,
  incoming: Record<string, unknown> | undefined,
  crypto: { decrypt: (enc: string) => Record<string, unknown>; encrypt: (value: Record<string, unknown>) => string } = { decrypt: (e) => decryptJson(e), encrypt: (v) => encryptJson(v) },
): string | null {
  if (incoming === undefined) return existingEnc ?? null;
  const existing = existingEnc ? crypto.decrypt(existingEnc) : {};
  const merged = (mergeValues(existing, incoming) as Record<string, unknown> | undefined) ?? {};
  const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
  return Object.keys(cleaned).length ? crypto.encrypt(cleaned) : null;
}
