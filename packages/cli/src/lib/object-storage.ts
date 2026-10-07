/**
 * S3 client settings for the platform bucket, from `.env`: `STORAGE_DRIVER=s3` reads S3_*,
 * `STORAGE_DRIVER=r2` reads R2_* (the R2 S3 endpoint is derived from the account id + jurisdiction,
 * like the `r2` storage driver in packages/providers).
 */
export interface S3Settings {
  bucket?: string;
  endpoint?: string;
  region: string;
  forcePathStyle: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /** Names of the variables to point people at in hints. */
  keyVars: string;
}

export function r2Endpoint(accountId: string, jurisdiction?: string): string {
  const j = jurisdiction && jurisdiction !== 'default' ? `${jurisdiction}.` : '';
  return `https://${accountId.toLowerCase()}.${j}r2.cloudflarestorage.com`;
}

export function s3Settings(v: Record<string, string | undefined>): S3Settings {
  if (v.STORAGE_DRIVER === 'r2') {
    return {
      bucket: v.R2_BUCKET,
      endpoint: v.R2_ACCOUNT_ID ? r2Endpoint(v.R2_ACCOUNT_ID, v.R2_JURISDICTION) : undefined,
      region: 'auto',
      forcePathStyle: true,
      credentials: v.R2_ACCESS_KEY_ID
        ? { accessKeyId: v.R2_ACCESS_KEY_ID, secretAccessKey: v.R2_SECRET_ACCESS_KEY ?? '' }
        : undefined,
      keyVars: 'R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY',
    };
  }
  return {
    bucket: v.S3_BUCKET,
    endpoint: v.S3_ENDPOINT || undefined,
    region: v.S3_REGION ?? 'us-east-1',
    forcePathStyle: v.S3_FORCE_PATH_STYLE === 'true',
    credentials: v.S3_ACCESS_KEY_ID
      ? { accessKeyId: v.S3_ACCESS_KEY_ID, secretAccessKey: v.S3_SECRET_ACCESS_KEY ?? '' }
      : undefined,
    keyVars: 'S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY',
  };
}
