/**
 * Outbound network policy.
 *
 * - `trusted`     — platform providers configured by the operator from env (platform SMTP,
 *                   platform S3/SeaweedFS, platform Vercel…). No address restrictions.
 * - `public-only` — anything configured by a tenant (provider/integration rows, webhook URLs,
 *                   form HTTP actions). Only public addresses, unless OUTBOUND_ALLOW_PRIVATE.
 */
export type NetworkPolicy = 'public-only' | 'trusted';

type Env = Record<string, string | undefined>;

const TRUE = new Set(['1', 'true', 'yes', 'on']);
const FALSE = new Set(['0', 'false', 'no', 'off']);

export function isProductionEnv(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Whether tenant-configured outbound requests may reach private/loopback/link-local addresses.
 * `OUTBOUND_ALLOW_PRIVATE` wins when set to a boolean-ish value; otherwise the default is
 * `false` in production and `true` everywhere else (local development against mailpit/MinIO…).
 */
export function outboundAllowPrivate(env: Env = process.env): boolean {
  const raw = env.OUTBOUND_ALLOW_PRIVATE?.trim().toLowerCase();
  if (raw && TRUE.has(raw)) return true;
  if (raw && FALSE.has(raw)) return false;
  return !isProductionEnv(env);
}

/** Effective "may this request reach private addresses" decision for a policy. */
export function allowsPrivate(network: NetworkPolicy | undefined, env: Env = process.env): boolean {
  return network === 'trusted' || outboundAllowPrivate(env);
}

/**
 * Remote response text that may be shown to users. In production remote bodies are never
 * echoed (a tenant-pointed endpoint must not turn error messages into a read primitive);
 * elsewhere a short excerpt is kept for debugging.
 */
export function remoteExcerpt(text: unknown, max = 200, env: Env = process.env): string | undefined {
  if (isProductionEnv(env)) return undefined;
  if (text === undefined || text === null) return undefined;
  const s = (typeof text === 'string' ? text : JSON.stringify(text) ?? String(text)).replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
