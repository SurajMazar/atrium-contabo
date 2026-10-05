import { getSession, saveSession, type StoredSession } from './config';
import { CliError } from './ui';

export class ApiError extends CliError {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(`API ${status} ${code}: ${message}`, status === 401 ? 'Run `atrium login` (or pass --token).' : undefined);
    this.name = 'ApiError';
  }
}

export class ApiUnreachableError extends CliError {
  constructor(public readonly url: string, cause: string) {
    super(`Cannot reach the Atrium API at ${url} (${cause})`, 'Start it with `atrium start --only api` or pass --api <url>.');
    this.name = 'ApiUnreachableError';
  }
}

export interface RequestOpts {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  form?: FormData;
  /** Return the raw Response (downloads). */
  raw?: boolean;
  /** Skip auth (public endpoints). */
  anonymous?: boolean;
  timeoutMs?: number;
}

function jwtExpiry(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Extract `name=value` for the refresh cookie from Set-Cookie headers. */
export function extractRefreshCookie(setCookies: string[], preferred = 'atrium_rt'): { name: string; value: string } | undefined {
  const parsed = setCookies
    .map((c) => c.split(';')[0] ?? '')
    .map((kv) => ({ name: kv.slice(0, kv.indexOf('=')).trim(), value: kv.slice(kv.indexOf('=') + 1).trim() }))
    .filter((c) => c.name && c.value);
  return parsed.find((c) => c.name === preferred) ?? parsed.find((c) => /rt|refresh/i.test(c.name));
}

/**
 * Small REST client for the CLI. Sessions are stored per API URL in
 * ~/.config/atrium/credentials.json; access tokens refresh automatically using
 * the stored refresh cookie (rotated on every refresh, like the admin app).
 */
export class ApiClient {
  readonly base: string;

  constructor(
    apiUrl: string,
    private readonly explicitToken?: string,
  ) {
    this.base = apiUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  }

  get v1(): string {
    return `${this.base}/v1`;
  }

  session(): StoredSession | undefined {
    return getSession(this.base);
  }

  hasAuth(): boolean {
    return !!this.explicitToken || !!this.session()?.accessToken || !!this.session()?.refreshToken;
  }

  private async fetchRaw(method: string, path: string, opts: RequestOpts, token?: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
    const qs = opts.query
      ? Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const url = `${this.v1}${path}${qs ? `?${qs}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'atrium-cli', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | FormData | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    try {
      return await fetch(url, { method, headers, body, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000), redirect: 'manual' });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      throw new ApiUnreachableError(this.base, e.cause?.code ?? e.message);
    }
  }

  private async toError(res: Response): Promise<ApiError> {
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown }; message?: string | string[] };
      const msg = data.error?.message ?? (Array.isArray(data.message) ? data.message.join('; ') : data.message) ?? res.statusText;
      return new ApiError(res.status, data.error?.code ?? 'ERROR', msg, data.error?.details);
    } catch {
      return new ApiError(res.status, 'ERROR', res.statusText);
    }
  }

  async isUp(timeoutMs = 2500): Promise<boolean> {
    try {
      const res = await fetch(`${this.v1}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async accessToken(): Promise<string | undefined> {
    if (this.explicitToken) return this.explicitToken;
    const s = this.session();
    if (!s) return undefined;
    if (s.accessToken && (!s.accessExpiresAt || s.accessExpiresAt - Date.now() > 30_000)) return s.accessToken;
    return (await this.refresh()) ?? undefined;
  }

  /** Rotate the refresh token and store the new access token. */
  async refresh(): Promise<string | null> {
    const s = this.session();
    if (!s?.refreshToken) return null;
    const res = await this.fetchRaw('POST', '/auth/refresh', {}, undefined, { Cookie: `${s.refreshCookie ?? 'atrium_rt'}=${s.refreshToken}` });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; user?: { id: string; email: string } };
    const rotated = extractRefreshCookie(res.headers.getSetCookie?.() ?? [], s.refreshCookie);
    saveSession(this.base, {
      ...s,
      accessToken: data.accessToken,
      accessExpiresAt: jwtExpiry(data.accessToken),
      refreshToken: rotated?.value ?? s.refreshToken,
      refreshCookie: rotated?.name ?? s.refreshCookie,
      savedAt: new Date().toISOString(),
    });
    return data.accessToken;
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const token = opts.anonymous ? undefined : await this.accessToken();
    let res = await this.fetchRaw(method, path, opts, token);
    if (res.status === 401 && !opts.anonymous && !this.explicitToken) {
      const fresh = await this.refresh();
      if (fresh) res = await this.fetchRaw(method, path, opts, fresh);
    }
    if (!res.ok) throw await this.toError(res);
    if (opts.raw) return res as unknown as T;
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('json') ? await res.json() : await res.text()) as T;
  }

  get<T = unknown>(path: string, query?: RequestOpts['query']) {
    return this.request<T>('GET', path, { query });
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body });
  }
  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }

  /** Password login (with optional MFA code callback). Persists the session. */
  async login(email: string, password: string, mfaCode?: () => Promise<string>): Promise<StoredSession> {
    let res = await this.fetchRaw('POST', '/auth/login', { body: { email, password } });
    if (!res.ok) throw await this.toError(res);
    let data = (await res.json()) as { accessToken?: string; user?: { id: string; email: string }; mfaRequired?: boolean; challengeToken?: string };
    if (data.mfaRequired) {
      if (!mfaCode) throw new CliError('This account requires MFA', 'Run `atrium login` interactively.');
      const code = await mfaCode();
      res = await this.fetchRaw('POST', '/auth/mfa/verify', { body: { challengeToken: data.challengeToken, code } });
      if (!res.ok) throw await this.toError(res);
      data = (await res.json()) as typeof data;
    }
    if (!data.accessToken) throw new CliError('Login response did not include an access token');
    const cookie = extractRefreshCookie(res.headers.getSetCookie?.() ?? []);
    const session: StoredSession = {
      email: data.user?.email ?? email,
      userId: data.user?.id,
      accessToken: data.accessToken,
      accessExpiresAt: jwtExpiry(data.accessToken),
      refreshToken: cookie?.value,
      refreshCookie: cookie?.name,
      savedAt: new Date().toISOString(),
    };
    saveSession(this.base, session);
    return session;
  }

  async logout(): Promise<void> {
    const s = this.session();
    if (!s?.refreshToken) return;
    await this.fetchRaw('POST', '/auth/logout', {}, s.accessToken, { Cookie: `${s.refreshCookie ?? 'atrium_rt'}=${s.refreshToken}` }).catch(() => undefined);
  }
}

// ───────────────────────── Domain helpers ─────────────────────────

export interface Membership {
  organization: { id: string; name: string; slug: string; planKey?: string };
  role: { id: string; key: string; name: string };
  permissions: string[];
}

export interface Me {
  user: { id: string; email: string; name: string; isSuperAdmin?: boolean };
  memberships: Membership[];
}

export interface WebsiteSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  primaryDomain?: string | null;
  publishedAt?: string | null;
  updatedAt?: string;
  organizationId?: string;
}

export function itemsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { items?: unknown }).items)) return (res as { items: T[] }).items;
  return [];
}

export async function getMe(api: ApiClient): Promise<Me> {
  return api.get<Me>('/auth/me');
}

export function pickOrg(me: Me, wanted?: string): Membership['organization'] {
  const orgs = me.memberships.map((m) => m.organization);
  if (wanted) {
    const o = orgs.find((x) => x.id === wanted || x.slug === wanted);
    if (!o) throw new CliError(`Organization "${wanted}" not found for ${me.user.email}`, `Available: ${orgs.map((x) => x.slug).join(', ') || '(none)'}`);
    return o;
  }
  if (orgs.length === 1) return orgs[0]!;
  if (!orgs.length) throw new CliError(`${me.user.email} is not a member of any organization`, 'Create one with `atrium new-org <name> --owner <email>`.');
  throw new CliError('Multiple organizations — specify one with --org <slug>', `Available: ${orgs.map((x) => x.slug).join(', ')} (or set a default: atrium use --org <slug>)`);
}

export async function listOrgWebsites(api: ApiClient, orgId: string): Promise<WebsiteSummary[]> {
  return itemsOf<WebsiteSummary>(await api.get(`/organizations/${orgId}/websites`, { limit: 200 })).map((w) => ({ ...w, organizationId: w.organizationId ?? orgId }));
}

/** Find a website by slug or id across the caller's organizations. */
export async function findWebsite(api: ApiClient, slugOrId: string, orgHint?: string): Promise<WebsiteSummary & { orgSlug: string }> {
  const me = await getMe(api);
  const orgs = orgHint ? [pickOrg(me, orgHint)] : me.memberships.map((m) => m.organization);
  for (const org of orgs) {
    const sites = await listOrgWebsites(api, org.id);
    const hit = sites.find((s) => s.slug === slugOrId || s.id === slugOrId);
    if (hit) return { ...hit, orgSlug: org.slug };
  }
  throw new CliError(`Website "${slugOrId}" not found`, 'List websites with `atrium list-sites`.');
}
