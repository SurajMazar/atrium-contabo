import { lookup as dnsLookup } from 'node:dns/promises';
import { Agent as HttpAgent, type AgentOptions as HttpAgentOptions } from 'node:http';
import { Agent as HttpsAgent, type AgentOptions as HttpsAgentOptions } from 'node:https';
import type { LookupFunction } from 'node:net';
import { Agent, buildConnector, type Dispatcher } from 'undici';
import { classifyIp, ipVersion } from './ip';
import { allowsPrivate, type NetworkPolicy } from './policy';

/**
 * Central outbound-request guard (SSRF defence) for every tenant-controlled network access:
 * provider endpoints (SMS gateways, email API base URLs, S3/Azure endpoints, AI base URLs,
 * SMTP hosts), webhooks and form HTTP actions.
 *
 * Layers:
 *  1. `assertOutboundUrl` — syntactic: http(s) only, no credentials, IP literals must be public.
 *  2. `resolvePublicAddresses` — DNS: every resolved address must be public.
 *  3. Connect-time enforcement — the undici dispatcher / http(s) agents resolve, validate and
 *     connect to the *validated* address, so DNS rebinding between check and connect is moot.
 *  4. `guardedFetch` — manual redirects (re-validated, max 3), `readBodyLimited` — size caps.
 */

export class OutboundBlockedError extends Error {
  readonly code = 'EOUTBOUNDBLOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'OutboundBlockedError';
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: HostResolver = async (hostname) => {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

export interface GuardOptions {
  /** Permit private/loopback/link-local targets (local development; see `outboundAllowPrivate`). */
  allowPrivate?: boolean;
  /** Allowed URL schemes (default http/https). */
  protocols?: readonly string[];
  /** DNS resolver override (tests). */
  resolver?: HostResolver;
}

const DEFAULT_PROTOCOLS = ['http:', 'https:'] as const;

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function normalizeHost(host: string): string {
  return stripBrackets(host.trim()).replace(/\.+$/, '').toLowerCase();
}

/** Names that never resolve to something public (refused without a DNS round trip). */
function isLocalName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa') || !host.includes('.');
}

/** Throws unless `address` (an IP literal) is public or private targets are allowed. */
export function assertPublicAddress(address: string, opts: Pick<GuardOptions, 'allowPrivate'> = {}, label = address): void {
  const c = classifyIp(address);
  if (!c) throw new OutboundBlockedError(`Refusing to connect to ${label}: not an IP address`);
  if (!c.public && !opts.allowPrivate) throw new OutboundBlockedError(`Refusing to connect to ${label}: ${c.reason ?? 'non-public'} address`);
}

/**
 * Syntactic URL check (no DNS): scheme allow-list, no embedded credentials, and IP-literal
 * hosts must be public. The WHATWG URL parser normalizes legacy IPv4 spellings first
 * (`http://0x7f000001`, `http://2130706433` → `127.0.0.1`), so those are caught here too.
 */
export function assertOutboundUrl(raw: string | URL, opts: GuardOptions = {}): URL {
  let url: URL;
  try {
    url = raw instanceof URL ? new URL(raw.href) : new URL(raw);
  } catch {
    throw new OutboundBlockedError('Invalid URL');
  }
  const protocols = opts.protocols ?? DEFAULT_PROTOCOLS;
  if (!protocols.includes(url.protocol)) throw new OutboundBlockedError(`Unsupported URL scheme ${url.protocol}`);
  if (url.username || url.password) throw new OutboundBlockedError('URLs with embedded credentials are not allowed');
  const host = normalizeHost(url.hostname);
  if (!host) throw new OutboundBlockedError('URL has no host');
  if (opts.allowPrivate) return url;
  if (ipVersion(host)) assertPublicAddress(host, opts, host);
  else if (isLocalName(host)) throw new OutboundBlockedError(`Refusing to connect to ${host}: local/internal host name`);
  return url;
}

/**
 * Resolve `hostname` (or accept an IP literal) and require every address to be public.
 * Returns the validated addresses — callers must connect to one of THESE, never re-resolve.
 */
export async function resolvePublicAddresses(hostname: string, opts: GuardOptions = {}): Promise<ResolvedAddress[]> {
  const host = normalizeHost(hostname);
  if (!host) throw new OutboundBlockedError('Missing host');
  const v = ipVersion(host);
  if (v) {
    assertPublicAddress(host, opts, host);
    return [{ address: host, family: v }];
  }
  if (!opts.allowPrivate && isLocalName(host)) throw new OutboundBlockedError(`Refusing to connect to ${host}: local/internal host name`);
  let addresses: ResolvedAddress[];
  try {
    addresses = await (opts.resolver ?? systemResolver)(host);
  } catch (err) {
    const e = new Error(`DNS lookup failed for ${host}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`) as NodeJS.ErrnoException;
    e.code = (err as NodeJS.ErrnoException).code ?? 'EDNS';
    throw e;
  }
  if (!addresses.length) throw new OutboundBlockedError(`DNS lookup for ${host} returned no addresses`);
  if (!opts.allowPrivate) {
    for (const a of addresses) {
      const c = classifyIp(a.address);
      if (!c?.public) throw new OutboundBlockedError(`Refusing to connect to ${host}: resolves to a ${c?.reason ?? 'non-public'} address`);
    }
  }
  return addresses;
}

/** Full URL check: syntax + DNS (used at create/update time, e.g. webhook URLs). */
export async function assertPublicUrl(raw: string | URL, opts: GuardOptions = {}): Promise<URL> {
  const url = assertOutboundUrl(raw, opts);
  if (!opts.allowPrivate) await resolvePublicAddresses(url.hostname, opts);
  return url;
}

// ───────────────────────────── Connect-time enforcement ─────────────────────────────

/**
 * `lookup` for node:net / http(s).Agent: resolves, validates and only hands back validated
 * addresses. NOTE: Node skips `lookup` for IP-literal hosts — validate those with
 * `assertOutboundUrl` before creating the client.
 */
export function createGuardedLookup(opts: GuardOptions = {}): LookupFunction {
  return ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
    const o = (typeof options === 'object' && options ? options : typeof options === 'number' ? { family: options } : {}) as { all?: boolean; family?: number | string };
    const fam = o.family === 'IPv4' || o.family === 4 ? 4 : o.family === 'IPv6' || o.family === 6 ? 6 : 0;
    resolvePublicAddresses(hostname, opts).then(
      (all) => {
        const list = fam ? all.filter((a) => a.family === fam) : all;
        if (!list.length) {
          const err = new Error(`No ${fam ? `IPv${fam} ` : ''}address for ${hostname}`) as NodeJS.ErrnoException;
          err.code = 'ENOTFOUND';
          return callback(err);
        }
        if (o.all) callback(null, list.map((a) => ({ address: a.address, family: a.family })));
        else callback(null, list[0]!.address, list[0]!.family);
      },
      (err: unknown) => callback(err),
    );
  }) as unknown as LookupFunction;
}

/** http/https agents whose connections are validated at connect time (AWS SDK, misc clients). */
export function createGuardedAgents(opts: GuardOptions = {}, agentOptions: HttpAgentOptions & HttpsAgentOptions = {}): { httpAgent: HttpAgent; httpsAgent: HttpsAgent } {
  const lookup = createGuardedLookup(opts);
  return {
    httpAgent: new HttpAgent({ keepAlive: true, ...agentOptions, lookup }),
    httpsAgent: new HttpsAgent({ keepAlive: true, ...agentOptions, lookup }),
  };
}

/**
 * undici dispatcher (for `fetch(url, { dispatcher })`) whose connector resolves + validates the
 * host and dials the validated IP (TLS servername stays the original host name, so certificate
 * verification is unchanged). Covers IP literals and redirects followed by the same dispatcher.
 */
export function createGuardedDispatcher(opts: GuardOptions = {}, connectTimeoutMs = 10_000): Dispatcher {
  const connect = buildConnector({ timeout: connectTimeoutMs });
  return new Agent({
    connect(options, callback) {
      const host = stripBrackets(options.hostname);
      resolvePublicAddresses(host, opts).then(
        (addresses) => {
          const target = addresses[0]!;
          const servername = options.servername || (ipVersion(host) ? undefined : host);
          connect({ ...options, hostname: target.address, ...(servername ? { servername } : {}) }, callback);
        },
        (err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), null),
      );
    },
  });
}

let sharedDispatcher: Dispatcher | undefined;
/** Process-wide guarded dispatcher (public-only, system DNS). */
export function publicOnlyDispatcher(): Dispatcher {
  sharedDispatcher ??= createGuardedDispatcher();
  return sharedDispatcher;
}

// ───────────────────────────── fetch wrapper ─────────────────────────────

export interface GuardedFetchOptions {
  /** `trusted` skips every check (platform providers configured from env). Default `public-only`. */
  network?: NetworkPolicy;
  /** Override the env-derived OUTBOUND_ALLOW_PRIVATE decision (tests, worker settings). */
  allowPrivate?: boolean;
  /** Redirect hops to follow (default 3). 0 = return the 3xx response as-is. */
  maxRedirects?: number;
  /** fetch implementation (default global fetch; tests inject mocks). */
  fetch?: typeof fetch;
  resolver?: HostResolver;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/** Copy request headers into a plain record (original name casing preserved for plain objects). */
function headerRecord(h: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => (out[k] = v));
  else if (Array.isArray(h)) for (const [k, v] of h) out[k!] = v!;
  else for (const [k, v] of Object.entries(h)) if (v !== undefined) out[k] = String(v);
  return out;
}
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie)$|token|secret|signature|api[-_]?key|auth/i;

/**
 * `fetch` with the outbound guard applied: URL validated, connections validated at connect
 * time, redirects handled manually (each hop re-validated; credentials dropped cross-origin).
 */
export async function guardedFetch(input: string | URL, init: RequestInit = {}, opts: GuardedFetchOptions = {}): Promise<Response> {
  const trusted = opts.network === 'trusted';
  const allowPrivate = trusted || (opts.allowPrivate ?? allowsPrivate(opts.network));
  const guard: GuardOptions = { allowPrivate, resolver: opts.resolver };
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const maxRedirects = opts.maxRedirects ?? 3;
  const dispatcher = allowPrivate ? undefined : opts.resolver ? createGuardedDispatcher(guard) : publicOnlyDispatcher();

  let url = trusted ? new URL(String(input)) : assertOutboundUrl(input, guard);
  let method = (init.method ?? 'GET').toUpperCase();
  let body = init.body;
  const headers = headerRecord(init.headers);
  const dropHeader = (name: string) => {
    for (const k of Object.keys(headers)) if (k.toLowerCase() === name) delete headers[k];
  };
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(url.href, { ...init, method, headers, body, redirect: 'manual', ...(dispatcher ? { dispatcher } : {}) } as RequestInit);
    const location = REDIRECT.has(res.status) ? res.headers.get('location') : null;
    if (!location || maxRedirects === 0) return res;
    await res.body?.cancel().catch(() => undefined);
    if (hop >= maxRedirects) throw new OutboundBlockedError(`Too many redirects (>${maxRedirects})`);
    const next = trusted ? new URL(location, url) : assertOutboundUrl(new URL(location, url), guard);
    if (next.origin !== url.origin) for (const name of Object.keys(headers)) if (SENSITIVE_HEADER.test(name)) delete headers[name];
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      if (method !== 'HEAD') method = 'GET';
      body = undefined;
      dropHeader('content-type');
      dropHeader('content-length');
    }
    url = next;
  }
}

export class ResponseTooLargeError extends Error {
  readonly code = 'ERESPONSETOOLARGE';
  constructor(readonly limit: number) {
    super(`Response body exceeds ${limit} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Read a response body with a byte cap. `mode: 'truncate'` returns the first `maxBytes` and
 * aborts the rest; `mode: 'throw'` raises ResponseTooLargeError.
 */
export async function readBodyLimited(res: Response, maxBytes: number, mode: 'truncate' | 'throw' = 'throw'): Promise<{ buffer: Buffer; truncated: boolean }> {
  const declared = Number(res.headers.get('content-length') ?? NaN);
  if (mode === 'throw' && Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!res.body) return { buffer: Buffer.alloc(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      if (total + chunk.length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        if (mode === 'throw') throw new ResponseTooLargeError(maxBytes);
        chunks.push(chunk.subarray(0, maxBytes - total));
        total = maxBytes;
        return { buffer: Buffer.concat(chunks), truncated: true };
      }
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    reader.releaseLock?.();
  }
  return { buffer: Buffer.concat(chunks), truncated: false };
}

/** Convenience: capped UTF-8 text (truncating). */
export async function readTextLimited(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const { buffer, truncated } = await readBodyLimited(res, maxBytes, 'truncate');
  return { text: buffer.toString('utf8'), truncated };
}

/**
 * A `fetch`-compatible function for SDKs (OpenAI/Anthropic `fetch` option) that applies the
 * guard: URL validated and connections pinned to validated public addresses.
 */
export function createGuardedSdkFetch(opts: Omit<GuardedFetchOptions, 'maxRedirects'> = {}): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const trusted = opts.network === 'trusted';
    const allowPrivate = trusted || (opts.allowPrivate ?? allowsPrivate(opts.network));
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (allowPrivate) return fetchImpl(input, init);
    const url = input instanceof Request ? input.url : String(input);
    assertOutboundUrl(url, { allowPrivate });
    const dispatcher = opts.resolver ? createGuardedDispatcher({ resolver: opts.resolver }) : publicOnlyDispatcher();
    return fetchImpl(input, { ...(init ?? {}), dispatcher } as RequestInit);
  }) as typeof fetch;
}

// ───────────────────────────── SMTP ─────────────────────────────

export const SMTP_ALLOWED_PORTS = [25, 465, 587, 2525] as const;

export interface SmtpTarget {
  /** Validated IP address to connect to. */
  host: string;
  port: number;
  /** Original host name for TLS SNI + certificate verification (undefined for IP literals). */
  servername?: string;
}

/**
 * Validate a tenant SMTP host/port: port allow-list (25/465/587/2525) and public addresses only
 * (unless private targets are allowed). Returns the validated IP to connect to.
 */
export async function resolveSmtpTarget(host: string, port: number, opts: GuardOptions = {}): Promise<SmtpTarget> {
  const name = normalizeHost(host);
  if (!name || /[\s/@:?#]/.test(stripBrackets(host.trim())) && !ipVersion(name)) throw new OutboundBlockedError('Invalid SMTP host');
  if (!opts.allowPrivate && !(SMTP_ALLOWED_PORTS as readonly number[]).includes(port)) {
    throw new OutboundBlockedError(`SMTP port ${port} is not allowed (use ${SMTP_ALLOWED_PORTS.join(', ')})`);
  }
  const [first] = await resolvePublicAddresses(name, opts);
  return { host: first!.address, port, servername: ipVersion(name) ? undefined : name };
}
