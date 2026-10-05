export interface AtriumClientOptions {
  /** e.g. `/api/v1` in the admin (proxied) or `https://api.example.com/v1`. */
  baseUrl: string;
  /** Returns the current access token (or null). */
  getToken?: () => string | null | undefined;
  /** Called on 401; return a fresh token to retry once, or null to give up. */
  onUnauthorized?: () => Promise<string | null>;
  fetch?: typeof fetch;
  /** Include cookies (needed for the refresh-token cookie). */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export class AtriumApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AtriumApiError';
  }
  get isConflict() {
    return this.status === 409;
  }
  get isValidation() {
    return this.status === 422 || this.code === 'VALIDATION';
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Return the raw Response (downloads, SSE). */
  raw?: boolean;
}

export class HttpClient {
  constructor(private readonly opts: AtriumClientOptions) {}

  url(path: string, query?: Query): string {
    const base = this.opts.baseUrl.replace(/\/$/, '');
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return `${base}${path}${qs ? `?${qs}` : ''}`;
  }

  async request<T>(method: string, path: string, o: RequestOptions = {}, retried = false): Promise<T> {
    const f = this.opts.fetch ?? fetch;
    const headers: Record<string, string> = { Accept: 'application/json', ...this.opts.headers, ...o.headers };
    const token = this.opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (o.body instanceof FormData) body = o.body;
    else if (o.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(o.body);
    }
    const res = await f(this.url(path, o.query), { method, headers, body, signal: o.signal, credentials: this.opts.credentials ?? 'include' });
    if (res.status === 401 && !retried && this.opts.onUnauthorized && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/login')) {
      const fresh = await this.opts.onUnauthorized();
      if (fresh) return this.request<T>(method, path, o, true);
    }
    if (o.raw) {
      if (!res.ok) throw await this.toError(res);
      return res as unknown as T;
    }
    if (!res.ok) throw await this.toError(res);
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? await res.json() : await res.text()) as T;
  }

  private async toError(res: Response): Promise<AtriumApiError> {
    try {
      const data = (await res.json()) as ApiErrorBody;
      return new AtriumApiError(res.status, data.error?.code ?? 'ERROR', data.error?.message ?? res.statusText, data.error?.details, data.requestId);
    } catch {
      return new AtriumApiError(res.status, 'ERROR', res.statusText);
    }
  }

  get<T>(path: string, query?: Query, o: Omit<RequestOptions, 'query'> = {}) {
    return this.request<T>('GET', path, { ...o, query });
  }
  post<T>(path: string, body?: unknown, o: RequestOptions = {}) {
    return this.request<T>('POST', path, { ...o, body });
  }
  put<T>(path: string, body?: unknown, o: RequestOptions = {}) {
    return this.request<T>('PUT', path, { ...o, body });
  }
  patch<T>(path: string, body?: unknown, o: RequestOptions = {}) {
    return this.request<T>('PATCH', path, { ...o, body });
  }
  delete<T = void>(path: string, o: RequestOptions = {}) {
    return this.request<T>('DELETE', path, o);
  }
}
