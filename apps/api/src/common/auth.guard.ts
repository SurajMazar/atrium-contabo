import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../config/env';
import { AccessService } from './access.service';
import { ACCESS, IS_PUBLIC, SUPER_ADMIN, type AccessRule, type AppRequest } from './decorators';
import { forbidden, unauthorized } from './errors';
import { PrismaService } from './prisma.service';

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/** Global guard: authenticates the bearer token, then enforces @Access / @SuperAdminOnly rules. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.access_token as string | undefined);
    if (!token) throw unauthorized();
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: env().JWT_ACCESS_SECRET });
    } catch {
      throw unauthorized('Session expired');
    }
    const session = await this.prisma.client.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, user: { select: { id: true, email: true, name: true, isSuperAdmin: true, disabledAt: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.id !== payload.sub || session.user.disabledAt) throw unauthorized('Session expired');
    req.user = { id: session.user.id, email: session.user.email, name: session.user.name, isSuperAdmin: session.user.isSuperAdmin, sessionId: payload.sid };

    if (this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN, [ctx.getHandler(), ctx.getClass()]) && !req.user.isSuperAdmin) throw forbidden('Super administrators only');

    const rule = this.reflector.get<AccessRule | undefined>(ACCESS, ctx.getHandler());
    if (rule) {
      const raw = req.params[rule.param];
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (!id) throw forbidden();
      req.access = await this.access.check(req.user, rule.resource, id, rule.permission);
    }
    return true;
  }
}
