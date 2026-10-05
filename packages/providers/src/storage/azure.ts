import { Readable } from 'node:stream';
import { z } from 'zod';
import type { ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { assertOutboundUrl, resolvePublicAddresses } from '../net/guard';
import { allowsPrivate, remoteExcerpt } from '../net/policy';
import { encodeKeyPath, joinPrefix, normalizeKey, probeStorage, toBuffer, trimSlash } from './shared';
import type { PutObjectInput, StorageProvider, StoredObject } from './types';

export const azureConfigSchema = z.object({
  accountName: z.string().regex(/^[a-z0-9]{3,24}$/, 'Storage account names are 3–24 lowercase letters/digits'),
  container: z.string().min(3),
  /** Blob service endpoint override (Azurite, sovereign clouds). Default https://{account}.blob.core.windows.net */
  endpoint: z.string().url().optional(),
  /** CDN / custom domain for public blobs (container must allow anonymous blob read). */
  publicUrl: z.string().url().optional(),
  keyPrefix: z.string().optional(),
  defaultCacheControl: z.string().default('public, max-age=31536000, immutable'),
  signedUrlTtlSeconds: z.number().int().min(60).default(3600),
});
export const azureSecretsSchema = z.object({
  /** Shared key — required for SAS signed URLs. */
  accountKey: z.string().optional(),
  connectionString: z.string().optional(),
});

const PROVIDER = 'azure-blob';

/** Blob service DNS suffixes of the public and sovereign Azure clouds. */
export const AZURE_BLOB_SUFFIXES = ['.blob.core.windows.net', '.blob.core.chinacloudapi.cn', '.blob.core.usgovcloudapi.net', '.blob.core.cloudapi.de'] as const;

/** Effective blob endpoint of a connection string (`BlobEndpoint`, or protocol + account + suffix). */
export function azureConnectionStringEndpoint(connectionString: string): string | undefined {
  const parts = new Map<string, string>();
  for (const seg of connectionString.split(';')) {
    const i = seg.indexOf('=');
    if (i > 0) parts.set(seg.slice(0, i).trim().toLowerCase(), seg.slice(i + 1).trim());
  }
  if ((parts.get('usedevelopmentstorage') ?? '').toLowerCase() === 'true') return 'http://127.0.0.1:10000/devstoreaccount1';
  if (parts.get('blobendpoint')) return parts.get('blobendpoint');
  const account = parts.get('accountname');
  if (!account) return undefined;
  return `${parts.get('defaultendpointsprotocol') ?? 'https'}://${account}.blob.${parts.get('endpointsuffix') ?? 'core.windows.net'}`;
}

/**
 * Tenant Azure endpoints must be the real Azure blob service (https, an Azure blob DNS suffix):
 * arbitrary endpoints would let a tenant point our signed requests at internal services.
 */
export function assertAzureEndpoint(endpoint: string): URL {
  const url = assertOutboundUrl(endpoint);
  if (url.protocol !== 'https:') throw new ProviderError('azure-blob: endpoint must use https', PROVIDER, false);
  const host = url.hostname.toLowerCase();
  if (!AZURE_BLOB_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)) {
    throw new ProviderError(`azure-blob: endpoint host must end with ${AZURE_BLOB_SUFFIXES.join(', ')}`, PROVIDER, false);
  }
  return url;
}
type AzureModule = typeof import('@azure/storage-blob');

function toProviderError(err: unknown, action: string, trusted = true): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { statusCode?: number; code?: string; message?: string };
  const status = e.statusCode ?? 0;
  const detail = trusted ? (e.message ?? String(err)) : (remoteExcerpt(e.message ?? String(err), 300) ?? 'request failed');
  return new ProviderError(`azure-blob: ${action} failed — ${e.code ?? status}: ${detail}`, PROVIDER, status >= 500 || status === 429 || status === 0, err);
}

export class AzureBlobStorageProvider implements StorageProvider {
  readonly driver = PROVIDER;
  private loaded?: Promise<{ az: AzureModule; container: ContainerClient; credential?: StorageSharedKeyCredential }>;

  constructor(
    private readonly config: z.output<typeof azureConfigSchema>,
    private readonly secrets: z.output<typeof azureSecretsSchema>,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  private get trusted(): boolean {
    return this.ctx.network === 'trusted';
  }

  /** Tenant configuration: only real Azure blob endpoints, resolving to public addresses. */
  private async assertEndpoints(): Promise<void> {
    if (allowsPrivate(this.ctx.network)) return;
    const endpoints = [this.endpoint];
    if (!this.secrets.accountKey && this.secrets.connectionString) {
      const ep = azureConnectionStringEndpoint(this.secrets.connectionString);
      if (!ep) throw new ProviderError('azure-blob: connection string has no AccountName/BlobEndpoint', PROVIDER, false);
      endpoints.push(ep);
    }
    for (const ep of endpoints) {
      try {
        const url = assertAzureEndpoint(ep);
        await resolvePublicAddresses(url.hostname);
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(`azure-blob: endpoint rejected — ${(err as Error).message}`, PROVIDER, false, err);
      }
    }
  }

  private get endpoint() {
    return trimSlash(this.config.endpoint ?? `https://${this.config.accountName}.blob.core.windows.net`);
  }

  private load() {
    this.loaded ??= this.assertEndpoints().then(() => import('@azure/storage-blob')).then((az) => {
      let service;
      let credential: StorageSharedKeyCredential | undefined;
      if (this.secrets.accountKey) {
        credential = new az.StorageSharedKeyCredential(this.config.accountName, this.secrets.accountKey);
        service = new az.BlobServiceClient(this.endpoint, credential);
      } else if (this.secrets.connectionString) {
        service = az.BlobServiceClient.fromConnectionString(this.secrets.connectionString);
        const key = /AccountKey=([^;]+)/.exec(this.secrets.connectionString)?.[1];
        if (key) credential = new az.StorageSharedKeyCredential(this.config.accountName, key);
      } else {
        throw new ProviderError('azure-blob: configure an account key or connection string', PROVIDER, false);
      }
      return { az, container: service.getContainerClient(this.config.container), credential };
    }).catch((err: unknown) => {
      this.loaded = undefined;
      throw err;
    });
    return this.loaded;
  }

  private k(key: string) {
    return joinPrefix(this.config.keyPrefix, normalizeKey(key, PROVIDER));
  }

  async upload(input: PutObjectInput): Promise<StoredObject> {
    const { container } = await this.load();
    const blob = container.getBlockBlobClient(this.k(input.key));
    const headers = { blobContentType: input.contentType, blobCacheControl: input.cacheControl ?? (input.visibility === 'private' ? 'private, max-age=0' : this.config.defaultCacheControl) };
    try {
      let size: number | undefined;
      let etag: string | undefined;
      if (input.body instanceof Readable) {
        const res = await blob.uploadStream(input.body, 4 * 1024 * 1024, 4, { blobHTTPHeaders: headers, metadata: input.metadata });
        etag = res.etag;
        size = input.contentLength;
      } else {
        const buf = await toBuffer(input.body);
        const res = await blob.uploadData(buf, { blobHTTPHeaders: headers, metadata: input.metadata });
        etag = res.etag;
        size = buf.byteLength;
      }
      return { key: input.key, size, etag: etag?.replace(/"/g, ''), contentType: input.contentType };
    } catch (err) {
      throw toProviderError(err, 'upload', this.trusted);
    }
  }

  async download(key: string): Promise<Buffer> {
    const { container } = await this.load();
    try {
      return await container.getBlobClient(this.k(key)).downloadToBuffer();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) throw new ProviderError(`azure-blob: object not found: ${key}`, PROVIDER, false, err);
      throw toProviderError(err, 'download', this.trusted);
    }
  }

  async delete(key: string): Promise<void> {
    const { container } = await this.load();
    try {
      await container.getBlobClient(this.k(key)).deleteIfExists();
    } catch (err) {
      throw toProviderError(err, 'delete', this.trusted);
    }
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const { container } = await this.load();
    try {
      const source = await this.sasUrl(this.k(fromKey), 'r', 600);
      const poller = await container.getBlobClient(this.k(toKey)).beginCopyFromURL(source);
      await poller.pollUntilDone();
    } catch (err) {
      throw toProviderError(err, 'copy', this.trusted);
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.copy(fromKey, toKey);
    await this.delete(fromKey);
  }

  async exists(key: string): Promise<boolean> {
    const { container } = await this.load();
    try {
      return await container.getBlobClient(this.k(key)).exists();
    } catch (err) {
      throw toProviderError(err, 'exists', this.trusted);
    }
  }

  getPublicUrl(key: string): string {
    const path = encodeKeyPath(this.k(key));
    if (this.config.publicUrl) return `${trimSlash(this.config.publicUrl)}/${path}`;
    return `${this.endpoint}/${this.config.container}/${path}`;
  }

  private async sasUrl(fullKey: string, permissions: string, ttlSeconds: number, extra: { contentDisposition?: string; contentType?: string } = {}): Promise<string> {
    const { az, container, credential } = await this.load();
    if (!credential) throw new ProviderError('azure-blob: signed URLs require the account key', PROVIDER, false);
    const startsOn = new Date(Date.now() - 5 * 60_000);
    const expiresOn = new Date(Date.now() + ttlSeconds * 1000);
    const sas = az
      .generateBlobSASQueryParameters(
        { containerName: this.config.container, blobName: fullKey, permissions: az.BlobSASPermissions.parse(permissions), startsOn, expiresOn, protocol: this.endpoint.startsWith('https') ? az.SASProtocol.Https : az.SASProtocol.HttpsAndHttp, ...extra },
        credential,
      )
      .toString();
    return `${container.getBlobClient(fullKey).url}?${sas}`;
  }

  getSignedUrl(key: string, opts: { expiresInSeconds?: number; disposition?: string } = {}): Promise<string> {
    return this.sasUrl(this.k(key), 'r', opts.expiresInSeconds ?? this.config.signedUrlTtlSeconds, { contentDisposition: opts.disposition });
  }

  async getUploadUrl(key: string, contentType: string, expiresInSeconds = 900) {
    const url = await this.sasUrl(this.k(key), 'cw', expiresInSeconds);
    return { url, method: 'PUT' as const, headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType } };
  }

  test(): Promise<TestResult> {
    return probeStorage(this, `Azure container ${this.config.container}`);
  }
}

export const azureBlobDriver = defineDriver({
  kind: 'storage',
  id: 'azure-blob',
  name: 'Azure Blob Storage',
  description: 'Microsoft Azure Blob Storage with SAS signed URLs.',
  configSchema: azureConfigSchema,
  secretsSchema: azureSecretsSchema,
  presets: [{ id: 'azurite', name: 'Azurite (local emulator)', config: { accountName: 'devstoreaccount1', endpoint: 'http://127.0.0.1:10000/devstoreaccount1' } }],
  create: (config, secrets, ctx): StorageProvider => new AzureBlobStorageProvider(config, secrets, ctx),
});
