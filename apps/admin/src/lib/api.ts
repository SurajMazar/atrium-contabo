'use client';

import { createAtriumClient, type AtriumClient, type AuthResult } from '@atrium/sdk';

/**
 * Shared API client for the admin + builder.
 *
 * - Access token lives in memory only (never localStorage).
 * - The refresh token is an httpOnly cookie (`atrium_rt`), sent automatically
 *   to `/api/v1/auth/*` because calls are same-origin through the Next proxy.
 * - Any 401 triggers one single-flight `/auth/refresh`; concurrent requests
 *   share the same in-flight refresh and retry once with the new token.
 */

export const API_BASE_URL = '/api/v1';

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResult | null> | null = null;
type Listener = (result: AuthResult | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Subscribe to token refresh outcomes (used by the session provider). */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(result: AuthResult | null) {
  for (const l of listeners) l(result);
}

/**
 * Exchange the refresh cookie for a new access token. Single-flight: callers
 * arriving while a refresh is pending await the same promise.
 */
export function refreshAccessToken(): Promise<AuthResult | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          accessToken = null;
          emit(null);
          return null;
        }
        const data = (await res.json()) as AuthResult;
        accessToken = data.accessToken;
        emit(data);
        return data;
      } catch {
        // Network failure: keep the current token, report no fresh result.
        return null;
      } finally {
        // Release on next tick so simultaneous 401s coalesce.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

export const api: AtriumClient = createAtriumClient({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  getToken: () => accessToken,
  onUnauthorized: async () => {
    const r = await refreshAccessToken();
    return r?.accessToken ?? null;
  },
});

export function useApi(): AtriumClient {
  return api;
}

/**
 * Authenticated fetch for things the SDK returns raw (downloads, SSE, XHR-less
 * streaming). Retries once after a refresh on 401.
 */
export async function authFetch(input: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(input, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && !retried) {
    const r = await refreshAccessToken();
    if (r) return authFetch(input, init, true);
  }
  return res;
}

/** Download a file from an authenticated endpoint (export CSV, site zip…). */
export async function downloadAuthenticated(url: string, fallbackName: string): Promise<void> {
  const res = await authFetch(url);
  if (!res.ok) {
    let message = res.statusText || 'Download failed';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export interface UploadProgressOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Multipart upload via XHR so we get upload progress events. Resolves with the
 * parsed JSON body; rejects with `{ status, body }` on non-2xx.
 */
export function uploadWithProgress<T>(url: string, form: FormData, opts: UploadProgressOptions = {}, retried = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = xhr.responseText;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (xhr.status === 401 && !retried) {
        refreshAccessToken().then((r) => {
          if (r) uploadWithProgress<T>(url, form, opts, true).then(resolve, reject);
          else reject(new UploadError(401, body));
        }, reject);
      } else reject(new UploadError(xhr.status, body));
    };
    xhr.onerror = () => reject(new UploadError(0, null));
    xhr.onabort = () => reject(new UploadError(-1, null));
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

export class UploadError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: { message?: string } }).error?.message ?? 'Upload failed')
        : status === 0
          ? 'Network error'
          : status === -1
            ? 'Upload cancelled'
            : 'Upload failed';
    super(msg);
    this.name = 'UploadError';
  }
  get code(): string | undefined {
    return this.body && typeof this.body === 'object' && 'error' in this.body ? (this.body as { error?: { code?: string } }).error?.code : undefined;
  }
  get details(): unknown {
    return this.body && typeof this.body === 'object' && 'error' in this.body ? (this.body as { error?: { details?: unknown } }).error?.details : undefined;
  }
}

/** Human-readable message for any thrown error (AtriumApiError or other). */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!err) return fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  return fallback;
}
