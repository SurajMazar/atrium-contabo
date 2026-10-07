import { Readable } from 'node:stream';
import { z } from 'zod';
import type { S3Client } from '@aws-sdk/client-s3';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { assertOutboundUrl, createGuardedAgents } from '../net/guard';
import { allowsPrivate, remoteExcerpt } from '../net/policy';
import { encodeKeyPath, joinPrefix, normalizeKey, probeStorage, toBuffer, trimSlash } from './shared';
import type { PutObjectInput, StorageProvider, StoredObject } from './types';

export const s3ConfigSchema = z.object({
  bucket: z.string().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/, 'Invalid bucket name'),
  /** AWS region or provider region id (`auto` for R2) — becomes part of the endpoint host name. */
  region: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'Invalid region').default('us-east-1'),
  /** Custom endpoint for S3-compatible services (R2, MinIO, SeaweedFS, Oracle, Spaces, B2). Empty = AWS. */
  endpoint: z.string().url().optional(),
  forcePathStyle: z.boolean().default(false),
  accessKeyId: z.string().optional().describe('Leave empty to use the default AWS credential chain (IAM role)'),
  /** Public base URL (CDN or bucket website) used for public objects, e.g. https://cdn.example.com. */
  publicUrl: z.string().url().optional(),
  keyPrefix: z.string().optional(),
  /** Send `public-read` ACL for public uploads. Disable for R2 / buckets with ACLs disabled (use a bucket policy instead). */
  usePublicAcl: z.boolean().default(false),
  serverSideEncryption: z.enum(['none', 'AES256', 'aws:kms']).default('none'),
  defaultCacheControl: z.string().default('public, max-age=31536000, immutable'),
  signedUrlTtlSeconds: z.number().int().min(60).max(604_800).default(3600),
});
export const s3SecretsSchema = z.object({ secretAccessKey: z.string().optional(), sessionToken: z.string().optional() });
export type S3Config = z.output<typeof s3ConfigSchema>;

const PROVIDER = 's3';
type S3Module = typeof import('@aws-sdk/client-s3');

function toProviderError(err: unknown, action: string, trusted = true): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { name?: string; message?: string; code?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode ?? 0;
  const retryable = Boolean(e.$retryable) || status >= 500 || status === 429 || e.name === 'SlowDown' || e.name === 'TimeoutError';
  // SDK messages can embed the remote response (deserialization errors) — hidden in production for tenant endpoints.
  const detail = trusted ? (e.message ?? String(err)) : (remoteExcerpt(e.message ?? String(err), 300) ?? (status ? `HTTP ${status}` : (e.code ?? 'request failed')));
  return new ProviderError(`s3: ${action} failed — ${e.name ?? 'Error'}: ${detail}`, PROVIDER, retryable, err);
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}

export class S3StorageProvider implements StorageProvider {
  readonly driver: string = PROVIDER;
  private sdk?: Promise<{ s3: S3Module; client: S3Client }>;

  constructor(
    private readonly config: S3Config,
    private readonly secrets: z.output<typeof s3SecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  private load() {
    this.sdk ??= import('@aws-sdk/client-s3').then((s3) => {
      const c = this.config;
      // Tenant endpoints: syntactic check (IP literals bypass `lookup`) + connections pinned to
      // validated public addresses via agents with a guarded DNS lookup.
      const guarded = !allowsPrivate(this.ctx.network);
      if (guarded && c.endpoint) {
        try {
          assertOutboundUrl(c.endpoint);
        } catch (err) {
          throw new ProviderError(`s3: endpoint rejected — ${(err as Error).message}`, PROVIDER, false, err);
        }
      }
      const client = new s3.S3Client({
        ...(guarded ? { requestHandler: { ...createGuardedAgents(), requestTimeout: 60_000 } } : {}),
        region: c.region,
        endpoint: c.endpoint,
        forcePathStyle: c.forcePathStyle,
        credentials: c.accessKeyId && this.secrets.secretAccessKey ? { accessKeyId: c.accessKeyId, secretAccessKey: this.secrets.secretAccessKey, sessionToken: this.secrets.sessionToken } : undefined,
        // S3-compatible services frequently reject the newer default integrity checksums.
        requestChecksumCalculation: c.endpoint ? 'WHEN_REQUIRED' : 'WHEN_SUPPORTED',
        responseChecksumValidation: c.endpoint ? 'WHEN_REQUIRED' : 'WHEN_SUPPORTED',
      });
      return { s3, client };
    });
    return this.sdk;
  }

  private get trusted(): boolean {
    return this.ctx.network === 'trusted';
  }

  private k(key: string): string {
    return joinPrefix(this.config.keyPrefix, normalizeKey(key, PROVIDER));
  }

  async upload(input: PutObjectInput): Promise<StoredObject> {
    const { s3, client } = await this.load();
    // Streams of unknown length are buffered (PutObject needs a content length).
    const body = input.body instanceof Readable && input.contentLength === undefined ? await toBuffer(input.body) : input.body;
    try {
      const out = await client.send(
        new s3.PutObjectCommand({
          Bucket: this.config.bucket,
          Key: this.k(input.key),
          Body: body,
          ContentType: input.contentType,
          ContentLength: input.contentLength ?? (Buffer.isBuffer(body) || body instanceof Uint8Array ? body.byteLength : undefined),
          CacheControl: input.cacheControl ?? (input.visibility === 'private' ? 'private, max-age=0' : this.config.defaultCacheControl),
          Metadata: input.metadata,
          ACL: input.visibility === 'public' && this.config.usePublicAcl ? 'public-read' : undefined,
          ServerSideEncryption: this.config.serverSideEncryption === 'none' ? undefined : this.config.serverSideEncryption,
        }),
      );
      return { key: input.key, etag: out.ETag?.replace(/"/g, ''), size: Buffer.isBuffer(body) || body instanceof Uint8Array ? body.byteLength : input.contentLength, contentType: input.contentType };
    } catch (err) {
      throw toProviderError(err, 'upload', this.trusted);
    }
  }

  async download(key: string): Promise<Buffer> {
    const { s3, client } = await this.load();
    try {
      const out = await client.send(new s3.GetObjectCommand({ Bucket: this.config.bucket, Key: this.k(key) }));
      if (!out.Body) return Buffer.alloc(0);
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) throw new ProviderError(`s3: object not found: ${key}`, PROVIDER, false, err);
      throw toProviderError(err, 'download', this.trusted);
    }
  }

  async delete(key: string): Promise<void> {
    const { s3, client } = await this.load();
    try {
      await client.send(new s3.DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.k(key) }));
    } catch (err) {
      if (!isNotFound(err)) throw toProviderError(err, 'delete', this.trusted);
    }
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const { s3, client } = await this.load();
    try {
      await client.send(
        new s3.CopyObjectCommand({
          Bucket: this.config.bucket,
          Key: this.k(toKey),
          CopySource: `${this.config.bucket}/${encodeKeyPath(this.k(fromKey))}`,
          MetadataDirective: 'COPY',
        }),
      );
    } catch (err) {
      throw toProviderError(err, 'copy', this.trusted);
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.copy(fromKey, toKey);
    await this.delete(fromKey);
  }

  async exists(key: string): Promise<boolean> {
    const { s3, client } = await this.load();
    try {
      await client.send(new s3.HeadObjectCommand({ Bucket: this.config.bucket, Key: this.k(key) }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw toProviderError(err, 'head', this.trusted);
    }
  }

  getPublicUrl(key: string): string {
    const path = encodeKeyPath(this.k(key));
    const c = this.config;
    if (c.publicUrl) return `${trimSlash(c.publicUrl)}/${path}`;
    if (c.endpoint) {
      const ep = new URL(c.endpoint);
      return c.forcePathStyle ? `${trimSlash(c.endpoint)}/${c.bucket}/${path}` : `${ep.protocol}//${c.bucket}.${ep.host}/${path}`;
    }
    return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${path}`;
  }

  async getSignedUrl(key: string, opts: { expiresInSeconds?: number; disposition?: string } = {}): Promise<string> {
    const [{ s3, client }, presigner] = await Promise.all([this.load(), import('@aws-sdk/s3-request-presigner')]);
    const cmd = new s3.GetObjectCommand({ Bucket: this.config.bucket, Key: this.k(key), ResponseContentDisposition: opts.disposition });
    return presigner.getSignedUrl(client, cmd, { expiresIn: opts.expiresInSeconds ?? this.config.signedUrlTtlSeconds });
  }

  async getUploadUrl(key: string, contentType: string, expiresInSeconds = 900) {
    const [{ s3, client }, presigner] = await Promise.all([this.load(), import('@aws-sdk/s3-request-presigner')]);
    const cmd = new s3.PutObjectCommand({ Bucket: this.config.bucket, Key: this.k(key), ContentType: contentType });
    const url = await presigner.getSignedUrl(client, cmd, { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-type']) });
    return { url, method: 'PUT' as const, headers: { 'Content-Type': contentType } };
  }

  test(): Promise<TestResult> {
    return probeStorage(this, `S3 bucket ${this.config.bucket}${this.config.endpoint ? ` @ ${new URL(this.config.endpoint).host}` : ''}`);
  }
}

export const s3Driver = defineDriver({
  kind: 'storage',
  id: 's3',
  name: 'S3-compatible object storage',
  description: 'Amazon S3 and S3-compatible services: MinIO, SeaweedFS, Oracle Object Storage, DigitalOcean Spaces, Backblaze B2 (Cloudflare R2 has its own driver).',
  configSchema: s3ConfigSchema,
  secretsSchema: s3SecretsSchema,
  presets: [
    { id: 'aws-s3', name: 'Amazon S3', config: { region: 'us-east-1', forcePathStyle: false } },
    { id: 'cloudflare-r2', name: 'Cloudflare R2', config: { region: 'auto', endpoint: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com', forcePathStyle: true, usePublicAcl: false } },
    { id: 'minio', name: 'MinIO', config: { region: 'us-east-1', endpoint: 'http://localhost:9000', forcePathStyle: true } },
    { id: 'seaweedfs', name: 'SeaweedFS (local dev)', config: { region: 'us-east-1', endpoint: 'http://localhost:59000', forcePathStyle: true, bucket: 'atrium-media', publicUrl: 'http://localhost:59000/atrium-media' } },
    { id: 'oracle', name: 'Oracle Object Storage (S3 compatibility)', config: { region: '<REGION>', endpoint: 'https://<NAMESPACE>.compat.objectstorage.<REGION>.oraclecloud.com', forcePathStyle: true } },
    { id: 'digitalocean-spaces', name: 'DigitalOcean Spaces', config: { region: 'nyc3', endpoint: 'https://nyc3.digitaloceanspaces.com', forcePathStyle: false, usePublicAcl: true } },
    { id: 'backblaze-b2', name: 'Backblaze B2 (S3 API)', config: { region: 'us-west-004', endpoint: 'https://s3.us-west-004.backblazeb2.com', forcePathStyle: true } },
  ],
  create: (config, secrets, ctx): StorageProvider => new S3StorageProvider(config, secrets, ctx),
});
