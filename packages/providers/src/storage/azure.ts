import { Readable } from 'node:stream';
import { z } from 'zod';
import type { ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { defineDriver, ProviderError, type TestResult } from '../driver';
import { encodeKeyPath, joinPrefix, normalizeKey, probeStorage, toBuffer, trimSlash } from './shared';
import type { PutObjectInput, StorageProvider, StoredObject } from './types';

export const azureConfigSchema = z.object({
  accountName: z.string().min(1),
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
type AzureModule = typeof import('@azure/storage-blob');

function toProviderError(err: unknown, action: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { statusCode?: number; code?: string; message?: string };
  const status = e.statusCode ?? 0;
  return new ProviderError(`azure-blob: ${action} failed — ${e.code ?? status}: ${e.message ?? String(err)}`, PROVIDER, status >= 500 || status === 429 || status === 0, err);
}

export class AzureBlobStorageProvider implements StorageProvider {
  readonly driver = PROVIDER;
  private loaded?: Promise<{ az: AzureModule; container: ContainerClient; credential?: StorageSharedKeyCredential }>;

  constructor(
    private readonly config: z.output<typeof azureConfigSchema>,
    private readonly secrets: z.output<typeof azureSecretsSchema>,
  ) {}

  private get endpoint() {
    return trimSlash(this.config.endpoint ?? `https://${this.config.accountName}.blob.core.windows.net`);
  }

  private load() {
    this.loaded ??= import('@azure/storage-blob').then((az) => {
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
      throw toProviderError(err, 'upload');
    }
  }

  async download(key: string): Promise<Buffer> {
    const { container } = await this.load();
    try {
      return await container.getBlobClient(this.k(key)).downloadToBuffer();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) throw new ProviderError(`azure-blob: object not found: ${key}`, PROVIDER, false, err);
      throw toProviderError(err, 'download');
    }
  }

  async delete(key: string): Promise<void> {
    const { container } = await this.load();
    try {
      await container.getBlobClient(this.k(key)).deleteIfExists();
    } catch (err) {
      throw toProviderError(err, 'delete');
    }
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const { container } = await this.load();
    try {
      const source = await this.sasUrl(this.k(fromKey), 'r', 600);
      const poller = await container.getBlobClient(this.k(toKey)).beginCopyFromURL(source);
      await poller.pollUntilDone();
    } catch (err) {
      throw toProviderError(err, 'copy');
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
      throw toProviderError(err, 'exists');
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
  create: (config, secrets): StorageProvider => new AzureBlobStorageProvider(config, secrets),
});
