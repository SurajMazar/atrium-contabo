import { ProviderError } from './driver';
import { guardedFetch, OutboundBlockedError, readBodyLimited, ResponseTooLargeError } from './net/guard';
import { isProductionEnv, type NetworkPolicy } from './net/policy';

/**
 * Thin fetch wrapper shared by every HTTP-based adapter (email/SMS/captcha/deployment).
 * Uses the global `fetch` so tests can stub it with `vi.stubGlobal('fetch', …)`.
 *
 * - JSON bodies are serialized automatically (plain objects/arrays).
 * - Non-2xx responses throw `ProviderError` (retryable for 408/425/429/5xx and network errors).
 * - Error messages include a truncated response excerpt, never request headers (which hold secrets).
 *   In production remote bodies are NOT echoed unless the endpoint is a fixed vendor API
 *   (`revealErrorBody`), so a tenant-chosen URL can't turn errors into a read primitive.
 * - Every request goes through the outbound guard (`net/guard.ts`): `network: 'public-only'`
 *   (the default) restricts targets to public addresses (validated at connect time), follows at
 *   most 3 re-validated redirects and caps the response size.
 */
export type HttpBody = string | Buffer | Uint8Array | URLSearchParams | FormData | Record<string, unknown> | unknown[] | undefined;

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: HttpBody;
  /** Default 30s. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Status codes that should not throw (e.g. 404 when probing for existence). */
  allowStatus?: number[];
  /** Response parsing; `auto` parses JSON when the content-type says so. */
  responseType?: 'auto' | 'json' | 'text' | 'buffer' | 'none';
  /** Outbound policy: `public-only` (default; tenant config) or `trusted` (platform env config). */
  network?: NetworkPolicy;
  /** Max response bytes (default 1 MB for text/json, 50 MB for `buffer`). */
  maxResponseBytes?: number;
  /** Fixed vendor endpoint: error bodies may be shown even in production. */
  revealErrorBody?: boolean;
}

export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function buildUrl(url: string, query?: HttpRequestOptions['query']): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function isPlainJson(body: HttpBody): body is Record<string, unknown> | unknown[] {
  if (body === undefined || body === null) return false;
  if (typeof body === 'string' || body instanceof URLSearchParams || body instanceof Uint8Array) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  return typeof body === 'object';
}

export function excerpt(text: string, max = 500): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Extract a human-readable error message from common API error shapes. */
export function extractErrorMessage(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === 'string') return excerpt(data);
  if (typeof data !== 'object') return String(data);
  const d = data as Record<string, unknown>;
  const err = d.error;
  if (typeof err === 'string') return typeof d.message === 'string' ? `${err}: ${d.message}` : err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.code ? `${String(e.code)}: ${e.message}` : e.message;
  }
  if (typeof d.message === 'string') return d.message;
  if (Array.isArray(d.errors) && d.errors.length) {
    return d.errors
      .map((x) => (x && typeof x === 'object' && 'message' in x ? String((x as { message: unknown }).message) : String(x)))
      .join('; ');
  }
  if (typeof d.detail === 'string') return d.detail;
  if (typeof d.Message === 'string') return d.Message;
  return excerpt(JSON.stringify(d));
}

export async function httpRequest<T = unknown>(provider: string, url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) if (v !== undefined) headers[k] = v;
  let body: RequestInit['body'] | undefined;
  if (isPlainJson(opts.body)) {
    body = JSON.stringify(opts.body);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  } else if (opts.body !== undefined) {
    body = opts.body as RequestInit['body'];
  }
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const finalUrl = buildUrl(url, opts.query);
  const host = (() => {
    try {
      return new URL(finalUrl).host;
    } catch {
      return 'invalid URL';
    }
  })();
  let res: Response;
  try {
    res = await guardedFetch(finalUrl, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal }, { network: opts.network ?? 'public-only' });
  } catch (err) {
    const blocked = err instanceof OutboundBlockedError ? err : (err as { cause?: unknown })?.cause instanceof OutboundBlockedError ? ((err as { cause: OutboundBlockedError }).cause) : undefined;
    if (blocked) throw new ProviderError(`${provider}: ${blocked.message}`, provider, false, blocked);
    const name = err instanceof Error ? err.name : '';
    const msg = name === 'TimeoutError' ? `request timed out after ${opts.timeoutMs ?? 30_000}ms` : networkMessage(err);
    throw new ProviderError(`${provider}: network error calling ${host}: ${msg}`, provider, true, err);
  }
  const type = opts.responseType ?? 'auto';
  const limit = opts.maxResponseBytes ?? (type === 'buffer' ? DEFAULT_MAX_BUFFER_BYTES : DEFAULT_MAX_RESPONSE_BYTES);
  let data: unknown = undefined;
  try {
    if (type === 'none' || res.status === 204 || opts.method === 'HEAD') {
      await res.body?.cancel().catch(() => undefined);
    } else {
      const { buffer } = await readBodyLimited(res, limit, 'throw');
      if (type === 'buffer') data = buffer;
      else {
        const text = buffer.toString('utf8');
        const ct = res.headers.get('content-type') ?? '';
        if (type === 'json' || (type === 'auto' && (ct.includes('json') || /^\s*[[{]/.test(text)))) {
          try {
            data = text ? JSON.parse(text) : undefined;
          } catch {
            data = text;
          }
        } else data = text;
      }
    }
  } catch (err) {
    if (err instanceof ResponseTooLargeError) throw new ProviderError(`${provider}: response from ${host} exceeds ${limit} bytes`, provider, false, err);
    throw new ProviderError(`${provider}: failed reading response from ${host}: ${networkMessage(err)}`, provider, true, err);
  }
  if (!res.ok && !(opts.allowStatus ?? []).includes(res.status)) {
    const reveal = opts.revealErrorBody || !isProductionEnv();
    const detail = reveal ? excerpt(extractErrorMessage(data) ?? res.statusText ?? '', 300) : '';
    throw new ProviderError(`${provider}: HTTP ${res.status}${detail ? ` — ${detail}` : ' (remote error details hidden)'}`, provider, RETRYABLE_STATUS.has(res.status), {
      status: res.status,
      body: typeof data === 'string' ? excerpt(data, 500) : data,
    });
  }
  return { status: res.status, ok: res.ok, headers: res.headers, data: data as T };
}

/** Error text for network failures (codes only; never remote content). */
function networkMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof OutboundBlockedError) return cause.message;
  const code = (cause as NodeJS.ErrnoException | undefined)?.code ?? (err as NodeJS.ErrnoException).code;
  if (cause instanceof Error) return code ? `${cause.message} (${code})` : cause.message;
  return code ? `${err.message} (${code})` : err.message;
}

export function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/** Status code carried by a ProviderError produced by `httpRequest`, if any. */
export function errorStatus(err: unknown): number | undefined {
  if (err instanceof ProviderError && err.cause && typeof err.cause === 'object' && 'status' in err.cause) {
    const s = (err.cause as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}
