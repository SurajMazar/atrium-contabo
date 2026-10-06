import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { SiteBriefSchema, type RewriteMode } from '@atrium/agent';
import type { Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AccessService } from '../../common/access.service';
import { Access, CurrentAccess, CurrentUser, Public, type AccessContext, type AppRequest, type AuthUser } from '../../common/decorators';
import { superAdminNeedsMfa } from '../../common/auth.guard';
import { forbidden, unauthorized } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';
import { AiLimiter, AI_LIMITS, tooManyAiRequests } from './ai-limits';
import { AiService } from './ai.service';
import { JWT_AUDIENCE, JWT_ISSUER } from '../auth/jwt';

const id = z.string().max(64).optional();
const GenerateSite = z.object({ brief: SiteBriefSchema, prompt: z.string().max(4000).optional(), provider: z.string().max(40).optional(), model: z.string().max(100).optional(), integrationId: id });
const Edit = z.object({ prompt: z.string().trim().min(2).max(4000), pageId: id, nodeId: id, index: z.number().int().min(0).max(500).optional(), provider: z.string().max(40).optional(), model: z.string().max(100).optional() });
const Rewrite = z.object({ text: z.string().min(1).max(10_000), mode: z.enum(['rewrite', 'shorten', 'expand', 'professional', 'luxurious', 'casual', 'seo', 'translate']), locale: z.string().max(10).optional(), context: z.string().max(1000).optional() });
/** `confirm: true` is required when the stored proposal has requiresConfirmation (409 CONFIRMATION_REQUIRED otherwise). */
const Apply = z.object({ confirm: z.boolean().optional() }).strict();
/** `force: true` (website.update) reverts even though the draft changed after the AI change was applied. */
const Revert = z.object({ force: z.boolean().optional() }).strict();

/** Per-IP limit for model-backed / state-changing AI routes. */
const AI_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
    private readonly limiter: AiLimiter,
    private readonly jwt: JwtService,
  ) {}

  @Get('ai/models')
  models() {
    return this.ai.models();
  }

  @Throttle(AI_THROTTLE)
  @Access(['ai.use', 'website.create'], 'organization', 'orgId')
  @Post('organizations/:orgId/ai/generate-site')
  generateSite(@Param('orgId') orgId: string, @Body(new ZodBody(GenerateSite)) body: z.infer<typeof GenerateSite>, @CurrentUser() user: AuthUser) {
    return this.ai.generateSite(orgId, body, user);
  }

  @Access('ai.use', 'organization', 'orgId')
  @Get('organizations/:orgId/ai/status')
  status(@Param('orgId') orgId: string, @CurrentAccess() access: AccessContext, @CurrentUser() user: AuthUser) {
    return this.ai.status(orgId, access, user);
  }

  @Access('ai.use', 'organization', 'orgId')
  @Get('organizations/:orgId/ai/usage')
  usage(@Param('orgId') orgId: string, @CurrentAccess() access: AccessContext) {
    // Organization-wide AI spend is not for members limited to specific websites.
    this.access.assertOrganizationWide(access);
    return this.ai.usage(orgId);
  }

  @Access('page.read', 'aiGeneration', 'id')
  @Get('ai/generations/:id')
  generation(@Param('id') id: string) {
    return this.ai.generation(id);
  }

  /** Mint a single-use, 60 s ticket for the SSE stream (so no bearer token ends up in URLs / logs). */
  @Throttle(AI_THROTTLE)
  @Access('page.read', 'aiGeneration', 'id')
  @HttpCode(200)
  @Post('ai/generations/:id/stream-ticket')
  streamTicket(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.limiter.issueStreamTicket(user.id, id);
  }

  /**
   * Server-sent progress stream. EventSource can't set headers, so it authenticates with
   * `?ticket=` from POST …/stream-ticket. Public at the guard level: the handler verifies the
   * ticket (or, for backwards compatibility, a bearer header / legacy `?access_token=`) and then
   * re-checks access (page.read on the generation).
   * TODO(auth.guard owner): apply @AllowQueryToken() here once it exists in common/decorators.ts,
   * and drop the legacy ?access_token= branch in streamUser() after the admin uses tickets.
   */
  @Public()
  @Get('ai/generations/:id/events')
  async events(@Param('id') id: string, @Query('ticket') ticket: string | undefined, @Req() req: AppRequest, @Res() res: Response) {
    const user = await this.streamUser(id, ticket, req);
    const access = await this.access.check(user, 'aiGeneration', id, 'page.read');
    // Same rule as the auth guard: a super admin reaching into another tenant needs an MFA-verified session.
    if (access.superAdminOverride && superAdminNeedsMfa() && !user.mfaVerified) throw forbidden('Platform administration requires a session signed in with two-factor authentication');
    const release = await this.limiter.acquire(`stream:${user.id}`, AI_LIMITS.streamsPerUser(), AI_LIMITS.streamTtlMs);
    if (!release) throw tooManyAiRequests('Too many open progress streams');
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      let last = '';
      let closed = false;
      req.on('close', () => (closed = true));
      const started = Date.now();
      while (!closed && Date.now() - started < 15 * 60_000) {
        const g = await this.ai.generation(id);
        const payload = JSON.stringify(g);
        if (payload !== last) {
          res.write(`event: progress\ndata: ${payload}\n\n`);
          last = payload;
        } else res.write(': keep-alive\n\n');
        if (['SUCCEEDED', 'FAILED', 'REVERTED'].includes(g.status)) {
          res.write(`event: done\ndata: ${payload}\n\n`);
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      await release();
      res.end();
    }
  }

  /** Single-use ticket, or the bearer header with exactly the auth guard's checks (no tokens in URLs). */
  private async streamUser(generationId: string, ticket: string | undefined, req: AppRequest): Promise<AuthUser & { mfaVerified?: boolean }> {
    if (ticket) {
      const userId = await this.limiter.consumeStreamTicket(ticket, generationId);
      if (!userId) throw unauthorized('Invalid or expired stream ticket');
      const u = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, isSuperAdmin: true, disabledAt: true } });
      if (!u || u.disabledAt) throw unauthorized();
      return { id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin, sessionId: 'stream-ticket', mfaVerified: false };
    }
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized();
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(token, { secret: env().JWT_ACCESS_SECRET, algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    } catch {
      throw unauthorized('Session expired');
    }
    const session = await this.prisma.client.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, mfaVerified: true, user: { select: { id: true, email: true, name: true, isSuperAdmin: true, disabledAt: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.id !== payload.sub || session.user.disabledAt) throw unauthorized('Session expired');
    return { id: session.user.id, email: session.user.email, name: session.user.name, isSuperAdmin: session.user.isSuperAdmin, sessionId: payload.sid, mfaVerified: session.mfaVerified };
  }

  @Throttle(AI_THROTTLE)
  @Access('ai.use', 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/edit')
  edit(@Param('id') id: string, @Body(new ZodBody(Edit)) body: z.infer<typeof Edit>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.ai.propose(id, body, 'edit', user, access);
  }

  @Throttle(AI_THROTTLE)
  @Access(['ai.use', 'page.create'], 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/generate-page')
  generatePage(@Param('id') id: string, @Body(new ZodBody(Edit)) body: z.infer<typeof Edit>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.ai.propose(id, body, 'page', user, access);
  }

  @Throttle(AI_THROTTLE)
  @Access(['ai.use', 'page.update'], 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/generate-section')
  generateSection(@Param('id') id: string, @Body(new ZodBody(Edit.extend({ pageId: z.string().max(64) }))) body: z.infer<typeof Edit> & { pageId: string }, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.ai.propose(id, body, 'section', user, access);
  }

  @Throttle(AI_THROTTLE)
  @Access(['ai.use', 'page.update'], 'aiGeneration', 'id')
  @HttpCode(200)
  @Post('ai/generations/:id/apply')
  apply(@Param('id') id: string, @Body(new ZodBody(Apply)) body: z.infer<typeof Apply>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.ai.apply(id, user, access, body);
  }

  @Throttle(AI_THROTTLE)
  @Access(['ai.use', 'page.update'], 'aiGeneration', 'id')
  @HttpCode(200)
  @Post('ai/generations/:id/revert')
  revert(@Param('id') id: string, @Body(new ZodBody(Revert)) body: z.infer<typeof Revert>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.ai.revert(id, user, access, body);
  }

  @Throttle(AI_THROTTLE)
  @Access('ai.use', 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/rewrite')
  rewrite(@Param('id') id: string, @Body(new ZodBody(Rewrite)) body: { text: string; mode: RewriteMode; locale?: string; context?: string }, @CurrentUser() user: AuthUser) {
    return this.ai.rewrite(id, body, user);
  }

  @Throttle(AI_THROTTLE)
  @Access(['ai.use', 'seo.manage'], 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/seo')
  seo(@Param('id') id: string, @Body(new ZodBody(z.object({ pageId: z.string().max(64) }))) body: { pageId: string }, @CurrentUser() user: AuthUser) {
    return this.ai.seo(id, body.pageId, user);
  }

  @Access('page.read', 'website', 'id')
  @Get('websites/:id/ai/generations')
  history(@Param('id') id: string) {
    return this.ai.history(id);
  }
}
