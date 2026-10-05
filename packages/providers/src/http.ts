import { ProviderError } from './driver';

/**
 * Thin fetch wrapper shared by every HTTP-based adapter (email/SMS/captcha/deployment).
 * Uses the global `fetch` so tests can stub it with `vi.stubGlobal('fetch', …)`.
 *
 * - JSON bodies are serialized automatically (plain objects/arrays).
 * - Non-2xx responses throw `ProviderError` (retryable for 408/425/429/5xx and network errors).
 * - Error messages include a truncated response excerpt, never request headers (which hold secrets).
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
}

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
  let res: Response;
  try {
    res = await fetch(finalUrl, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const msg = name === 'TimeoutError' ? `request timed out after ${opts.timeoutMs ?? 30_000}ms` : err instanceof Error ? err.message : String(err);
    throw new ProviderError(`${provider}: network error calling ${new URL(finalUrl).host}: ${msg}`, provider, true, err);
  }
  const type = opts.responseType ?? 'auto';
  let data: unknown = undefined;
  if (type !== 'none' && res.status !== 204 && opts.method !== 'HEAD') {
    if (type === 'buffer') data = Buffer.from(await res.arrayBuffer());
    else {
      const text = await res.text();
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
  if (!res.ok && !(opts.allowStatus ?? []).includes(res.status)) {
    const detail = extractErrorMessage(data) ?? res.statusText;
    throw new ProviderError(`${provider}: HTTP ${res.status} — ${detail}`, provider, RETRYABLE_STATUS.has(res.status), {
      status: res.status,
      body: typeof data === 'string' ? excerpt(data, 2000) : data,
    });
  }
  return { status: res.status, ok: res.ok, headers: res.headers, data: data as T };
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
