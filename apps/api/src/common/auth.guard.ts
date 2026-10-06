import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../config/env';
import { JWT_ALGORITHMS, JWT_AUDIENCE, JWT_ISSUER } from '../modules/auth/jwt';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { ACCESS, ALLOW_QUERY_TOKEN, IS_PUBLIC, SUPER_ADMIN, type AccessRule, type AppRequest } from './decorators';
import { ApiError, forbidden, unauthorized } from './errors';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/** Platform admins must use a second factor (default on in production; SUPER_ADMIN_REQUIRE_MFA overrides). */
export function superAdminNeedsMfa(): boolean {
  const e = env() as ReturnType<typeof env> & { SUPER_ADMIN_REQUIRE_MFA?: boolean };
  return e.SUPER_ADMIN_REQUIRE_MFA ?? e.NODE_ENV === 'production';
}

/** Global guard: authenticates the bearer token, then enforces @Access / @SuperAdminOnly rules. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const allowQuery = this.reflector.getAllAndOverride<boolean>(ALLOW_QUERY_TOKEN, [ctx.getHandler(), ctx.getClass()]);
    const token = header?.startsWith('Bearer ') ? header.slice(7) : allowQuery ? (req.query.access_token as string | undefined) : undefined;
    if (!token) throw unauthorized();
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: env().JWT_ACCESS_SECRET, algorithms: [...JWT_ALGORITHMS], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    } catch {
      throw unauthorized('Session expired');
    }
    if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string') throw unauthorized('Session expired');
    const session = await this.prisma.client.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, mfaVerified: true, user: { select: { id: true, email: true, name: true, isSuperAdmin: true, disabledAt: true, mfaEnabled: true, passwordChangeRequired: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.id !== payload.sub || session.user.disabledAt) throw unauthorized('Session expired');
    const mfaVerified = session.user.mfaEnabled && session.mfaVerified;
    req.user = { id: session.user.id, email: session.user.email, name: session.user.name, isSuperAdmin: session.user.isSuperAdmin, sessionId: payload.sid, mfaVerified };
    // An account someone else created (they know its password) works only for /auth/* — sign out,
    // `me`, and choosing a new password — until its owner sets their own password.
    if (session.user.passwordChangeRequired && !/^\/v1\/auth\//.test(req.path ?? '')) {
      throw new ApiError(403, 'FORBIDDEN', 'Choose a new password to continue', { reason: 'PASSWORD_CHANGE_REQUIRED' });
    }

    const superAdminRoute = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN, [ctx.getHandler(), ctx.getClass()]);
    if (superAdminRoute) {
      if (!req.user.isSuperAdmin) throw forbidden('Super administrators only');
      this.assertSuperAdminMfa(mfaVerified);
    }

    const rule = this.reflector.get<AccessRule | undefined>(ACCESS, ctx.getHandler());
    if (rule) {
      const raw = req.params[rule.param];
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (!id) throw forbidden();
      req.access = await this.access.check(req.user, rule.resource, id, rule.permission);
      if (req.access.superAdminOverride) {
        this.assertSuperAdminMfa(mfaVerified);
        await this.auditOverride(req, rule.resource, id);
      }
    }
    return true;
  }

  private assertSuperAdminMfa(mfaVerified: boolean) {
    if (superAdminNeedsMfa() && !mfaVerified) throw new ApiError(403, 'FORBIDDEN', 'Platform administration requires a session signed in with two-factor authentication', { reason: 'MFA_REQUIRED' });
  }

  /**
   * Super-admin access into a tenant is never silent: every write is audited,
   * reads at most once per session/tenant/hour (to keep the log useful).
   */
  private async auditOverride(req: AppRequest, resource: string, id: string) {
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!write) {
      const key = `audit:override:${req.user!.sessionId}:${req.access!.organizationId}`;
      const first = await this.redis.client.set(key, '1', 'EX', 3600, 'NX').catch(() => 'OK');
      if (first !== 'OK') return;
    }
    await this.audit.log({
      organizationId: req.access!.organizationId,
      websiteId: req.access!.websiteId,
      actor: req.user,
      action: write ? 'platform.tenant_write' : 'platform.tenant_read',
      resourceType: resource,
      resourceId: id,
      summary: `Super admin ${req.user!.name} ${write ? 'changed' : 'viewed'} tenant data (${req.method} ${req.route?.path ?? req.path})`,
      req,
    });
  }
}
