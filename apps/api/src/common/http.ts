import type { Response } from 'express';
import { env } from '../config/env';
import type { AppRequest } from './decorators';

export const REFRESH_COOKIE = 'atrium_rt';

export function sessionMeta(req: AppRequest) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env().COOKIE_SECURE || env().NODE_ENV === 'production',
    sameSite: 'lax',
    // path "/" so the cookie also reaches the admin's same-origin proxy (/api/v1/auth/*)
    path: '/',
    domain: env().COOKIE_DOMAIN && env().COOKIE_DOMAIN !== 'localhost' ? env().COOKIE_DOMAIN : undefined,
    maxAge: env().REFRESH_TTL_DAYS * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/', domain: env().COOKIE_DOMAIN && env().COOKIE_DOMAIN !== 'localhost' ? env().COOKIE_DOMAIN : undefined });
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
