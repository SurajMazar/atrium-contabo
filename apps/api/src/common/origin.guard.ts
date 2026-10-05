import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../config/env';
import { forbidden } from './errors';

/** Origins allowed to drive cookie-based auth (the admin app and configured CORS origins). */
export function trustedOrigins(): Set<string> {
  const e = env();
  const out = new Set(e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));
  try {
    out.add(new URL(e.ADMIN_URL).origin);
  } catch {
    /* ignore malformed */
  }
  return out;
}

/**
 * Pure decision used by BrowserOriginGuard (exported for tests).
 * - JSON only: HTML forms can send urlencoded/multipart/text "simple" requests cross-site without a preflight.
 * - If the browser says where the request came from (Origin / Sec-Fetch-Site), it must be one of ours.
 * - Non-browser clients (no Origin, no Sec-Fetch-*) are allowed: they cannot ride a victim's cookies.
 */
export function originDecision(req: { method: string; headers: Record<string, string | string[] | undefined> }, allowed: Set<string>): string | null {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return null;
  const h = (k: string) => {
    const v = req.headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const type = (h('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const length = Number(h('content-length') ?? '0');
  if (length > 0 && type !== 'application/json') return 'Send this request as JSON';
  const origin = h('origin');
  if (origin && origin !== 'null' && !allowed.has(origin)) return 'Cross-site request blocked';
  if (origin === 'null') return 'Cross-site request blocked';
  const site = h('sec-fetch-site');
  if (!origin && site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return 'Cross-site request blocked';
  return null;
}

/** CSRF defence for cookie-authenticated auth endpoints (login CSRF, refresh, logout). */
@Injectable()
export class BrowserOriginGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const reason = originDecision(req, trustedOrigins());
    if (reason) throw forbidden(reason);
    return true;
  }
}
