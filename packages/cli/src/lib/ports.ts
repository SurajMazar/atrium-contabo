import { createConnection, createServer } from 'node:net';
import type { EnvFile } from './env';

/** Port settings in .env with their defaults and the env keys whose URLs embed them. */
export const PORT_KEYS = {
  ADMIN_PORT: { default: 3000, service: 'admin', derived: ['ADMIN_URL', 'CORS_ORIGINS'] },
  RENDERER_PORT: {
    default: 3001,
    service: 'renderer',
    derived: ['RENDERER_URL', 'PLATFORM_SITES_DOMAIN', 'PREVIEW_URL', 'CORS_ORIGINS'],
  },
  API_PORT: { default: 4000, service: 'api', derived: ['API_URL', 'LOCAL_STORAGE_PUBLIC_URL'] },
  ATRIUM_PG_PORT: { default: 55432, service: 'postgres', derived: ['DATABASE_URL'] },
  ATRIUM_REDIS_PORT: { default: 56379, service: 'redis', derived: ['REDIS_URL'] },
  ATRIUM_S3_PORT: { default: 59000, service: 's3', derived: ['S3_ENDPOINT', 'S3_PUBLIC_URL'] },
  ATRIUM_SMTP_PORT: { default: 51025, service: 'mailpit', derived: ['SMTP_PORT'] },
  ATRIUM_MAILPIT_PORT: { default: 58025, service: 'mailpit', derived: [] },
} as const;

export type PortKey = keyof typeof PORT_KEYS;
export const INFRA_PORT_KEYS: PortKey[] = [
  'ATRIUM_PG_PORT',
  'ATRIUM_REDIS_PORT',
  'ATRIUM_S3_PORT',
  'ATRIUM_SMTP_PORT',
  'ATRIUM_MAILPIT_PORT',
];
export const APP_PORT_KEYS: PortKey[] = ['ADMIN_PORT', 'RENDERER_PORT', 'API_PORT'];

/** Is something accepting connections on host:port? */
export function isListening(port: number, host = '127.0.0.1', timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    const done = (v: boolean) => {
      sock.removeAllListeners();
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.once('error', (err: NodeJS.ErrnoException) =>
      resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'),
    );
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/** A port is free when nothing listens on it and we could bind it ourselves. */
export async function isPortFree(port: number): Promise<boolean> {
  if (await isListening(port)) return false;
  return (await canBind(port, '0.0.0.0')) && (await canBind(port, '127.0.0.1'));
}

export type PortChecker = (port: number) => Promise<boolean>;

/** First free port at or after `preferred`, skipping `taken`. */
export async function findFreePort(
  preferred: number,
  isFree: PortChecker = isPortFree,
  taken: Set<number> = new Set(),
  maxTries = 200,
): Promise<number> {
  for (let p = preferred; p < preferred + maxTries && p <= 65535; p++) {
    if (taken.has(p)) continue;
    if (await isFree(p)) return p;
  }
  throw new Error(`No free port found in ${preferred}-${preferred + maxTries}`);
}

export interface PortPlan {
  key: PortKey;
  wanted: number;
  chosen: number;
  changed: boolean;
}

/**
 * Pick ports for the given keys. `current` holds configured values; keys listed
 * in `ours` are already bound by Atrium itself (e.g. running infra containers)
 * and are kept as-is. Chosen ports never collide with each other.
 */
export async function pickPorts(
  keys: PortKey[],
  current: Partial<Record<PortKey, number>>,
  isFree: PortChecker = isPortFree,
  ours: Set<PortKey> = new Set(),
): Promise<PortPlan[]> {
  const taken = new Set<number>();
  const plans: PortPlan[] = [];
  for (const key of keys) {
    const wanted = current[key] ?? PORT_KEYS[key].default;
    let chosen = wanted;
    if (!ours.has(key) && (taken.has(wanted) || !(await isFree(wanted))))
      chosen = await findFreePort(wanted + 1, isFree, taken);
    taken.add(chosen);
    plans.push({ key, wanted, chosen, changed: chosen !== wanted });
  }
  return plans;
}

/** Replace `:old` with `:new` for local hosts inside a URL-ish value. */
export function replacePortInValue(value: string, from: number, to: number): string {
  const re = new RegExp(
    `((?:localhost|127\\.0\\.0\\.1|\\[::1\\]|[a-z0-9.-]*\\.localhost):)${from}(?![0-9])`,
    'g',
  );
  return value.replace(re, `$1${to}`);
}

/**
 * Apply port changes to an env file: sets the port key and rewrites derived
 * URLs (DATABASE_URL, API_URL, CORS_ORIGINS…) that still point at the old port.
 */
export function applyPorts(
  env: EnvFile,
  plans: Array<{ key: PortKey; from: number; to: number }>,
): string[] {
  const touched: string[] = [];
  for (const { key, from, to } of plans) {
    if (from === to) continue;
    env.set(key, String(to));
    touched.push(key);
    for (const d of PORT_KEYS[key].derived) {
      const v = env.get(d);
      if (v === undefined) continue;
      const next =
        d === 'SMTP_PORT' ? (v === String(from) ? String(to) : v) : replacePortInValue(v, from, to);
      if (next !== v) {
        env.set(d, next);
        touched.push(d);
      }
    }
  }
  return touched;
}

export function currentPorts(env: EnvFile | null): Partial<Record<PortKey, number>> {
  const out: Partial<Record<PortKey, number>> = {};
  for (const key of Object.keys(PORT_KEYS) as PortKey[]) {
    const v = Number(env?.get(key));
    out[key] = Number.isInteger(v) && v > 0 ? v : PORT_KEYS[key].default;
  }
  return out;
}
