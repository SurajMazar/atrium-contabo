import { z } from 'zod';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { S3StorageProvider } from './s3';
import { probeStorage } from './shared';
import type { StorageProvider } from './types';

/**
 * Cloudflare R2 through its S3 API. R2 differs from S3 in ways that are easy to get wrong with the
 * generic driver, so this driver fixes them: the endpoint comes from the account id (and data
 * jurisdiction), the region is always `auto`, there are no object ACLs or SSE headers (R2 encrypts
 * everything at rest), and the S3 endpoint is never publicly readable — public files need the
 * bucket's custom domain or r2.dev URL.
 */
export const R2_JURISDICTIONS = ['default', 'eu', 'fedramp'] as const;
export type R2Jurisdiction = (typeof R2_JURISDICTIONS)[number];

/** S3 API endpoint of an R2 account: `https://<account>.[eu.|fedramp.]r2.cloudflarestorage.com`. */
export function r2Endpoint(accountId: string, jurisdiction: R2Jurisdiction = 'default'): string {
  return `https://${accountId.toLowerCase()}.${jurisdiction === 'default' ? '' : `${jurisdiction}.`}r2.cloudflarestorage.com`;
}

export const r2ConfigSchema = z.object({
  accountId: z
    .string()
    .regex(/^[a-fA-F0-9]{32}$/, 'The Cloudflare account ID is 32 hexadecimal characters (dashboard → R2 → Account details)')
    .meta({ title: 'Account ID', description: 'Cloudflare dashboard → R2 → Account details', 'x-placeholder': '0123456789abcdef0123456789abcdef' }),
  bucket: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'R2 bucket names are 3–63 lowercase letters, numbers and hyphens')
    .meta({ title: 'Bucket', 'x-placeholder': 'atrium-media' }),
  jurisdiction: z
    .enum(R2_JURISDICTIONS)
    .default('default')
    .meta({ title: 'Jurisdiction', description: 'Must match the bucket: buckets created in the EU or FedRAMP jurisdiction have their own endpoint.', enumNames: ['Default', 'European Union (EU)', 'FedRAMP'] }),
  accessKeyId: z.string().min(1, 'Enter the access key ID of an R2 API token').meta({ title: 'Access key ID', description: 'R2 → Manage API tokens → an "Object Read & Write" token for this bucket' }),
  publicUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u), 'Use the https URL of the bucket’s custom domain or r2.dev subdomain')
    .meta({ title: 'Public URL', description: 'Custom domain (recommended) or r2.dev URL connected to the bucket. Media on your sites is served from here.', 'x-placeholder': 'https://media.example.com' }),
  keyPrefix: z.string().optional().meta({ title: 'Key prefix', description: 'Optional folder inside the bucket, to share it between environments' }),
  defaultCacheControl: z.string().default('public, max-age=31536000, immutable').meta({ title: 'Cache-Control' }),
  signedUrlTtlSeconds: z.number().int().min(60).max(604_800).default(3600).meta({ title: 'Signed URL lifetime (seconds)' }),
});
export const r2SecretsSchema = z.object({
  secretAccessKey: z.string().min(1, 'Enter the secret access key of the R2 API token').meta({ title: 'Secret access key' }),
});
export type R2Config = z.output<typeof r2ConfigSchema>;

const PROVIDER = 'r2';

export class R2StorageProvider extends S3StorageProvider {
  override readonly driver = PROVIDER;

  constructor(
    private readonly r2: R2Config,
    secrets: z.output<typeof r2SecretsSchema>,
    ctx: DriverContext = TENANT_CONTEXT,
  ) {
    if (!secrets.secretAccessKey) throw new ProviderError('r2: the secret access key is missing', PROVIDER, false);
    super(
      {
        bucket: r2.bucket,
        region: 'auto',
        endpoint: r2Endpoint(r2.accountId, r2.jurisdiction),
        forcePathStyle: true,
        accessKeyId: r2.accessKeyId,
        publicUrl: r2.publicUrl,
        keyPrefix: r2.keyPrefix,
        usePublicAcl: false,
        serverSideEncryption: 'none',
        defaultCacheControl: r2.defaultCacheControl,
        signedUrlTtlSeconds: r2.signedUrlTtlSeconds,
      },
      { secretAccessKey: secrets.secretAccessKey },
      ctx,
    );
  }

  override test(): Promise<TestResult> {
    return probeStorage(this, `R2 bucket ${this.r2.bucket}${this.r2.jurisdiction === 'default' ? '' : ` (${this.r2.jurisdiction})`}`);
  }
}

export const r2Driver = defineDriver({
  kind: 'storage',
  id: 'r2',
  name: 'Cloudflare R2',
  description: 'Cloudflare R2 object storage (no egress fees). Needs an R2 API token and a public custom domain or r2.dev URL on the bucket.',
  configSchema: r2ConfigSchema,
  secretsSchema: r2SecretsSchema,
  create: (config, secrets, ctx): StorageProvider => new R2StorageProvider(config, secrets, ctx),
});
