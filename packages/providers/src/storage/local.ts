import { createReadStream, createWriteStream, mkdirSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { isProductionEnv } from '../net/policy';
import { encodeKeyPath, joinPrefix, normalizeKey, probeStorage, signLocalUrl, trimSlash } from './shared';
import type { PutObjectInput, StorageProvider, StoredObject } from './types';

export const localStorageConfigSchema = z.object({
  /**
   * Directory on the API/worker host (shared volume in multi-node setups). Only honoured for the
   * platform (env) configuration — organization providers are always jailed to
   * `<LOCAL_STORAGE_DIR>/orgs/<organizationId>`.
   */
  directory: z.string().min(1).default('./storage'),
  /** Public base URL that serves the directory (the API's /v1/storage route). */
  publicBaseUrl: z.string().min(1),
  keyPrefix: z.string().optional(),
  signedUrlTtlSeconds: z.number().int().min(60).default(3600),
});
/** HMAC secret for signed URLs; the API verifies with `verifyLocalSignedUrl`. */
export const localStorageSecretsSchema = z.object({ signingSecret: z.string().min(16).optional() });

const PROVIDER = 'local';

/** Platform local-storage root: LOCAL_STORAGE_DIR (default ./storage), absolute. */
export function localStorageRoot(env: Record<string, string | undefined> = process.env): string {
  return resolve(env.LOCAL_STORAGE_DIR || './storage');
}

/** Key prefix that jails an organization's `local` provider: `orgs/<organizationId>`. */
export function tenantLocalScope(organizationId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(organizationId)) throw new ProviderError('local: invalid organization id', PROVIDER, false);
  return `orgs/${organizationId}`;
}

/** True when `child` is `parent` or inside it (both absolute, already resolved). */
export function isWithin(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

export class LocalStorageProvider implements StorageProvider {
  readonly driver = PROVIDER;
  /** Filesystem root that public URLs/keys are relative to. */
  private readonly root: string;
  /** Tenant jail inside root (`orgs/<id>`), undefined for the platform provider. */
  private readonly scope?: string;
  /** Directory every path must stay inside (root, or root/scope). */
  private readonly base: string;
  private realBase?: string;

  constructor(
    private readonly config: z.output<typeof localStorageConfigSchema>,
    private readonly secrets: z.output<typeof localStorageSecretsSchema>,
    ctx: DriverContext = TENANT_CONTEXT,
  ) {
    if (ctx.network === 'trusted') {
      this.root = resolve(config.directory);
    } else {
      // Organization providers never choose a directory (arbitrary file read/write otherwise).
      if (isProductionEnv(ctx.env ?? process.env)) throw new ProviderError('local: the local filesystem driver is not available for organization storage in production', PROVIDER, false);
      if (!ctx.organizationId) throw new ProviderError('local: organization storage requires an organization id', PROVIDER, false);
      this.root = localStorageRoot(ctx.env ?? process.env);
      this.scope = tenantLocalScope(ctx.organizationId);
    }
    this.base = this.scope ? join(this.root, this.scope) : this.root;
  }

  private fullKey(key: string): string {
    const k = normalizeKey(joinPrefix(this.config.keyPrefix, normalizeKey(key, PROVIDER)), PROVIDER);
    return joinPrefix(this.scope, k);
  }

  /** Real (symlink-resolved) base directory, created on first use. */
  private realBaseDir(): string {
    if (!this.realBase) {
      mkdirSync(this.base, { recursive: true });
      this.realBase = realpathSync(this.base);
    }
    return this.realBase;
  }

  /** Resolve symlinks on the deepest existing ancestor of `p` and require it to stay in the jail. */
  private assertRealContainment(p: string): void {
    const realBase = this.realBaseDir();
    let probe = p;
    for (;;) {
      try {
        const real = realpathSync(probe);
        if (!isWithin(realBase, real)) throw new ProviderError('local: key escapes storage root', PROVIDER, false);
        return;
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err;
        const parent = dirname(probe);
        if (parent === probe || !isWithin(this.base, parent)) return;
        probe = parent;
      }
    }
  }

  /** Absolute path for a key, guaranteed to stay inside the storage root (incl. through symlinks). */
  pathFor(key: string): string {
    const p = resolve(this.root, this.fullKey(key));
    if (!p.startsWith(this.base + sep)) throw new ProviderError(`local: key escapes storage root`, PROVIDER, false);
    this.assertRealContainment(p);
    return p;
  }

  async upload(input: PutObjectInput): Promise<StoredObject> {
    const path = this.pathFor(input.key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
      if (input.body instanceof Readable) await pipeline(input.body, createWriteStream(tmp));
      else await writeFile(tmp, input.body);
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw new ProviderError(`local: upload failed: ${(err as Error).message}`, PROVIDER, false, err);
    }
    const s = await stat(path);
    return { key: input.key, size: s.size, contentType: input.contentType };
  }

  async download(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new ProviderError(code === 'ENOENT' ? `local: object not found: ${key}` : `local: read failed: ${(err as Error).message}`, PROVIDER, false, err);
    }
  }

  /** Stream access for the API's file-serving route. */
  createReadStream(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const to = this.pathFor(toKey);
    await mkdir(dirname(to), { recursive: true });
    await rename(this.pathFor(fromKey), to);
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const to = this.pathFor(toKey);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(this.pathFor(fromKey), to);
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.pathFor(key))).isFile();
    } catch {
      return false;
    }
  }

  getPublicUrl(key: string): string {
    return `${trimSlash(this.config.publicBaseUrl)}/${encodeKeyPath(this.fullKey(key))}`;
  }

  async getSignedUrl(key: string, opts: { expiresInSeconds?: number; disposition?: string } = {}): Promise<string> {
    const secret = this.secrets.signingSecret;
    if (!secret) throw new ProviderError('local: signed URLs require a signingSecret', PROVIDER, false);
    const fullKey = this.fullKey(key);
    const expires = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? this.config.signedUrlTtlSeconds);
    const sig = signLocalUrl(secret, { key: fullKey, expires, disposition: opts.disposition });
    const u = new URL(`${trimSlash(this.config.publicBaseUrl)}/${encodeKeyPath(fullKey)}`, 'http://placeholder');
    u.searchParams.set('expires', String(expires));
    if (opts.disposition) u.searchParams.set('disposition', opts.disposition);
    u.searchParams.set('sig', sig);
    return /^https?:\/\//.test(this.config.publicBaseUrl) ? u.toString() : `${u.pathname}${u.search}`;
  }

  async getUploadUrl(key: string, contentType: string, expiresInSeconds = 900) {
    const secret = this.secrets.signingSecret;
    if (!secret) throw new ProviderError('local: direct uploads require a signingSecret', PROVIDER, false);
    const fullKey = this.fullKey(key);
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = signLocalUrl(secret, { key: fullKey, expires, op: 'put', contentType });
    const url = `${trimSlash(this.config.publicBaseUrl)}/${encodeKeyPath(fullKey)}?op=put&expires=${expires}&sig=${sig}`;
    return { url, method: 'PUT' as const, headers: { 'Content-Type': contentType } };
  }

  test(): Promise<TestResult> {
    return probeStorage(this, this.scope ? 'Local storage' : `Local storage (${this.root})`);
  }
}

export const localStorageDriver = defineDriver({
  kind: 'storage',
  id: 'local',
  name: 'Local filesystem',
  description: 'Stores files on the server filesystem (development or single-node installs; use a shared volume for multiple nodes).',
  configSchema: localStorageConfigSchema,
  secretsSchema: localStorageSecretsSchema,
  create: (config, secrets, ctx): StorageProvider => new LocalStorageProvider(config, secrets, ctx),
});
