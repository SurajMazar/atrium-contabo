import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { ProviderError, type TestResult } from '../driver';
import type { StorageProvider } from './types';

/** Validate + normalize an object key: no leading slash, no `..`/empty segments, no backslashes. */
export function normalizeKey(key: string, provider = 'storage'): string {
  const k = key.replace(/^\/+/, '');
  if (!k || k.includes('\\') || k.split('/').some((seg) => seg === '..' || seg === '.' || seg === '') || /[\u0000-\u001f]/.test(k)) {
    throw new ProviderError(`${provider}: invalid object key "${key}"`, provider, false);
  }
  return k;
}

export function joinPrefix(prefix: string | undefined, key: string): string {
  const p = (prefix ?? '').replace(/^\/+|\/+$/g, '');
  return p ? `${p}/${key}` : key;
}

/** Encode each path segment for use in a URL while keeping `/` separators. */
export function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export async function toBuffer(body: Buffer | Uint8Array | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

// ───────────────────────── Signed URLs for the local driver ─────────────────────────

export interface LocalSignatureInput {
  key: string;
  expires: number;
  disposition?: string;
  /** `get` for downloads, `put` for direct uploads. */
  op?: 'get' | 'put';
  contentType?: string;
}

function signaturePayload(i: LocalSignatureInput): string {
  return [i.op ?? 'get', i.key, String(i.expires), i.disposition ?? '', i.contentType ?? ''].join('\n');
}

export function signLocalUrl(secret: string, input: LocalSignatureInput): string {
  return createHmac('sha256', secret).update(signaturePayload(input)).digest('base64url');
}

/**
 * Verify a local-storage signed URL (used by the API's storage route). Checks expiry and the
 * HMAC in constant time. `params` are the URL query values: `expires`, `sig`, optional `disposition`.
 */
export function verifyLocalSignedUrl(
  secret: string,
  key: string,
  params: { expires?: string | null; sig?: string | null; disposition?: string | null; op?: 'get' | 'put'; contentType?: string | null },
  now = Date.now(),
): boolean {
  if (!params.expires || !params.sig) return false;
  const expires = Number(params.expires);
  if (!Number.isFinite(expires) || expires * 1000 < now) return false;
  const expected = Buffer.from(signLocalUrl(secret, { key, expires, disposition: params.disposition ?? undefined, op: params.op, contentType: params.contentType ?? undefined }));
  const actual = Buffer.from(params.sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Shared test(): write, read back and delete a small probe object. */
export async function probeStorage(provider: StorageProvider, label: string): Promise<TestResult> {
  const key = `.atrium-probe/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.txt`;
  const payload = `atrium storage probe ${new Date().toISOString()}`;
  const started = Date.now();
  try {
    await provider.upload({ key, body: Buffer.from(payload), contentType: 'text/plain', visibility: 'private' });
    const back = await provider.download(key);
    if (back.toString('utf8') !== payload) throw new Error('read-back mismatch');
    await provider.delete(key);
    return { ok: true, message: `${label}: write/read/delete succeeded`, details: { latencyMs: Date.now() - started } };
  } catch (err) {
    await provider.delete(key).catch(() => undefined);
    return { ok: false, message: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}
