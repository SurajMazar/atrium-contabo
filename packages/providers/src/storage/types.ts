import type { Readable } from 'node:stream';
import type { TestResult } from '../driver';

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | Readable;
  contentType: string;
  contentLength?: number;
  cacheControl?: string;
  metadata?: Record<string, string>;
  /** Public objects are readable via getPublicUrl; private require signed URLs. */
  visibility?: 'public' | 'private';
}

export interface StoredObject {
  key: string;
  size?: number;
  etag?: string;
  contentType?: string;
}

/** Business logic depends only on this interface — never on S3/Azure SDKs. */
export interface StorageProvider {
  readonly driver: string;
  upload(input: PutObjectInput): Promise<StoredObject>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  move(fromKey: string, toKey: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getPublicUrl(key: string): string;
  getSignedUrl(key: string, opts?: { expiresInSeconds?: number; disposition?: string }): Promise<string>;
  /** Pre-signed direct browser upload (optional; falls back to API proxy upload). */
  getUploadUrl?(key: string, contentType: string, expiresInSeconds?: number): Promise<{ url: string; headers?: Record<string, string>; method: 'PUT' | 'POST'; fields?: Record<string, string> }>;
  test(): Promise<TestResult>;
}
