import { createHash } from 'node:crypto';
import { ProviderError } from '../driver';
import type { DeploymentFile } from './types';

/** Normalise file content to a Buffer (strings are encoded as UTF-8). */
export function toBuffer(content: Buffer | string): Buffer {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
}

export function sha1Hex(data: Buffer | string): string {
  return createHash('sha1').update(data).digest('hex');
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Normalise a deployment file path: POSIX separators, no leading `./` or `/`.
 * Rejects path traversal so a malformed snapshot can never escape the project root.
 */
export function normalizeFilePath(provider: string, path: string): string {
  const p = path.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  if (!p || p.split('/').some((seg) => seg === '..' || seg === '')) {
    throw new ProviderError(`${provider}: invalid deployment file path "${path}"`, provider, false);
  }
  return p;
}

export interface DigestedFile {
  /** Normalised relative path (no leading slash). */
  path: string;
  buffer: Buffer;
  size: number;
  sha1: string;
}

/** Hash every file once (sha1 hex + size). Duplicate paths keep the last occurrence. */
export function digestFiles(provider: string, files: DeploymentFile[]): DigestedFile[] {
  const byPath = new Map<string, DigestedFile>();
  for (const f of files) {
    const path = normalizeFilePath(provider, f.path);
    const buffer = toBuffer(f.content);
    byPath.set(path, { path, buffer, size: buffer.byteLength, sha1: sha1Hex(buffer) });
  }
  return [...byPath.values()];
}

/** Group files by digest so identical content is uploaded only once. */
export function uniqueByDigest<F extends { sha1: string }>(files: F[]): Map<string, F> {
  const map = new Map<string, F>();
  for (const f of files) if (!map.has(f.sha1)) map.set(f.sha1, f);
  return map;
}

/** Run `fn` over `items` with at most `limit` promises in flight; preserves result order. */
export async function mapWithConcurrency<I, O>(items: readonly I[], limit: number, fn: (item: I, index: number) => Promise<O>): Promise<O[]> {
  const results = new Array<O>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as I, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** URL-encode each path segment, keeping `/` separators. Returns a leading-slash path. */
export function encodePathSegments(path: string): string {
  return `/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** File extension without the dot (lowercased), or '' when there is none. */
export function fileExtension(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  cjs: 'application/javascript',
  json: 'application/json',
  map: 'application/json',
  webmanifest: 'application/manifest+json',
  txt: 'text/plain',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[fileExtension(path)] ?? 'application/octet-stream';
}

/** Response body carried by a ProviderError produced by `httpRequest`, if any. */
export function errorBody(err: unknown): unknown {
  if (err instanceof ProviderError && err.cause && typeof err.cause === 'object' && 'body' in err.cause) {
    return (err.cause as { body: unknown }).body;
  }
  return undefined;
}

/** ISO timestamp from epoch milliseconds / ISO string; undefined when absent or invalid. */
export function toIso(value: number | string | null | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
