import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, type AppRequest, type AuthUser } from '../../common/decorators';
import { env } from '../../config/env';
import { clearRefreshCookie, readRefreshCookie, sessionMeta, setRefreshCookie } from '../../common/http';
import { BrowserOriginGuard } from '../../common/origin.guard';
import { ZodBody } from '../../common/zod.pipe';
import { AuthService } from './auth.service';

const email = z.string().trim().email().max(254);
const Register = z.object({ name: z.string().trim().min(1).max(120), email, password: z.string().min(1).max(200), organizationName: z.string().trim().max(120).optional() });
const Login = z.object({ email, password: z.string().min(1).max(200) });
const Mfa = z.object({ challengeToken: z.string().min(10), code: z.string().min(6).max(20) });
const Code = z.object({ code: z.string().min(6).max(24), currentPassword: z.string().max(200).optional() });
const StepUp = z.object({ currentPassword: z.string().max(200).optional() }).default({});
/** Avatars are displayed to other members: https images only (no tracking via plain-http, no script URLs). */
const AvatarUrl = z.string().url().max(2000).refine((u) => /^https:\/\//i.test(u), 'Avatar must be an https URL');

/** Cookie-authenticated routes (login, refresh…) are guarded against cross-site requests. */
@UseGuards(BrowserOriginGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body(new ZodBody(Register)) body: z.infer<typeof Register>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(body, sessionMeta(req));
    setRefreshCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body(new ZodBody(Login)) body: z.infer<typeof Login>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body, sessionMeta(req));
    if ('mfaRequired' in r) return r;
    setRefreshCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mfa/verify')
  async verifyMfa(@Body(new ZodBody(Mfa)) body: z.infer<typeof Mfa>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.verifyMfa(body, sessionMeta(req));
    setRefreshCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(readRefreshCookie(req), sessionMeta(req));
      setRefreshCookie(res, r.refreshToken);
      return { accessToken: r.accessToken, user: r.user };
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    clearRefreshCookie(res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('password/forgot')
  forgot(@Body(new ZodBody(z.object({ email }))) body: { email: string }) {
    this.auth.forgotPassword(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('password/reset')
  async reset(@Body(new ZodBody(z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }))) body: { token: string; password: string }, @Req() req: AppRequest) {
    await this.auth.resetPassword(body.token, body.password, sessionMeta(req));
  }

  @HttpCode(204)
  @Post('password/change')
  async change(@CurrentUser() user: AuthUser, @Body(new ZodBody(z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }))) body: { currentPassword: string; newPassword: string }, @Req() req: AppRequest) {
    await this.auth.changePassword(user.id, user.sessionId, body.currentPassword, body.newPassword, sessionMeta(req));
  }

  /** Link from the verification email. Redirects to the admin login with a fixed, server-chosen URL. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('email/verify')
  async verifyEmail(@Query('token') token: string | undefined, @Res() res: Response) {
    const ok = typeof token === 'string' && token.length >= 10 && token.length <= 200 ? await this.auth.verifyEmail(token) : false;
    res.redirect(303, `${env().ADMIN_URL.replace(/\/$/, '')}/login?${ok ? 'verified=1' : 'verified=0'}`);
  }

  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('email/resend')
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body(new ZodBody(z.object({ name: z.string().trim().min(1).max(120).optional(), avatarUrl: AvatarUrl.nullable().optional(), locale: z.string().max(10).optional() }))) body: { name?: string; avatarUrl?: string | null; locale?: string }) {
    return this.auth.updateMe(user.id, body);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.sessions(user.id, user.sessionId);
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(user.id, id);
  }

  /** Step-up: needs the current password unless the session was created in the last few minutes. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/setup')
  setupMfa(@CurrentUser() user: AuthUser, @Body(new ZodBody(StepUp)) body: { currentPassword?: string }) {
    return this.auth.setupMfa(user.id, user.sessionId, body?.currentPassword);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/enable')
  enableMfa(@CurrentUser() user: AuthUser, @Body(new ZodBody(Code)) body: { code: string }) {
    return this.auth.enableMfa(user.id, user.sessionId, body.code);
  }

  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/disable')
  disableMfa(@CurrentUser() user: AuthUser, @Body(new ZodBody(Code)) body: { code: string; currentPassword?: string }) {
    return this.auth.disableMfa(user.id, user.sessionId, body.code, body.currentPassword);
  }
}
