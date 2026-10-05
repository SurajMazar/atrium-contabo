import type { Response } from 'express';
import { env } from '../config/env';
import type { AppRequest } from './decorators';

/**
 * Refresh-token cookie. In production (and when no COOKIE_DOMAIN is configured) it
 * is a `__Host-` cookie: Secure, host-only, Path=/ — it can never be set or read by
 * sibling subdomains such as customer sites under the platform domain.
 */
export const LEGACY_REFRESH_COOKIE = 'atrium_rt';
export function refreshCookieName(): string {
  const e = env();
  return e.NODE_ENV === 'production' && !e.COOKIE_DOMAIN ? '__Host-atrium_rt' : LEGACY_REFRESH_COOKIE;
}
export const REFRESH_COOKIE = LEGACY_REFRESH_COOKIE;

export function readRefreshCookie(req: AppRequest): string | undefined {
  const cookies = (req as { cookies?: Record<string, string> }).cookies ?? {};
  return cookies[refreshCookieName()] ?? cookies[LEGACY_REFRESH_COOKIE];
}

function cookieDomain(): string | undefined {
  const d = env().COOKIE_DOMAIN;
  return d && d !== 'localhost' ? d : undefined;
}

export function sessionMeta(req: AppRequest) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
}

export function setRefreshCookie(res: Response, token: string) {
  const name = refreshCookieName();
  res.cookie(name, token, {
    httpOnly: true,
    secure: name.startsWith('__Host-') || env().COOKIE_SECURE || env().NODE_ENV === 'production',
    sameSite: 'lax',
    // path "/" so the cookie also reaches the admin's same-origin proxy (/api/v1/auth/*); required for __Host-.
    path: '/',
    domain: name.startsWith('__Host-') ? undefined : cookieDomain(),
    maxAge: env().REFRESH_TTL_DAYS * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response) {
  const name = refreshCookieName();
  res.clearCookie(name, { path: '/', secure: name.startsWith('__Host-') || undefined, domain: name.startsWith('__Host-') ? undefined : cookieDomain() });
  if (name !== LEGACY_REFRESH_COOKIE) res.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/', domain: cookieDomain() });
}

/** Cursor pagination helper: fetch limit+1 rows ordered by (createdAt desc, id desc). */
export function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export function limitOf(v: unknown, def = 50, max = 200) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
}
