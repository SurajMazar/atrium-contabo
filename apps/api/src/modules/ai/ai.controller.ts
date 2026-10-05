import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { SiteBriefSchema, type RewriteMode } from '@atrium/agent';
import type { Response } from 'express';
import { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { Access, CurrentUser, type AppRequest, type AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';
import { AiService } from './ai.service';

const GenerateSite = z.object({ brief: SiteBriefSchema, prompt: z.string().max(4000).optional(), provider: z.string().optional(), model: z.string().optional(), integrationId: z.string().optional() });
const Edit = z.object({ prompt: z.string().trim().min(2).max(4000), pageId: z.string().optional(), nodeId: z.string().optional(), index: z.number().int().optional(), provider: z.string().optional(), model: z.string().optional() });
const Rewrite = z.object({ text: z.string().min(1).max(10_000), mode: z.enum(['rewrite', 'shorten', 'expand', 'professional', 'luxurious', 'casual', 'seo', 'translate']), locale: z.string().max(10).optional(), context: z.string().max(1000).optional() });

@Controller()
export class AiController {
  constructor(private readonly ai: AiService, private readonly access: AccessService, private readonly prisma: PrismaService) {}

  @Get('ai/models')
  models() {
    return this.ai.models();
  }

  @Access(['ai.use', 'website.create'], 'organization', 'orgId')
  @Post('organizations/:orgId/ai/generate-site')
  generateSite(@Param('orgId') orgId: string, @Body(new ZodBody(GenerateSite)) body: z.infer<typeof GenerateSite>, @CurrentUser() user: AuthUser) {
    return this.ai.generateSite(orgId, body, user);
  }

  @Access('ai.use', 'organization', 'orgId')
  @Get('organizations/:orgId/ai/usage')
  usage(@Param('orgId') orgId: string) {
    return this.ai.usage(orgId);
  }

  @Access(undefined, 'aiGeneration', 'id')
  @Get('ai/generations/:id')
  generation(@Param('id') id: string) {
    return this.ai.generation(id);
  }

  /** Server-sent progress stream. EventSource can't set headers, so the token may be passed as ?access_token=. */
  @Access(undefined, 'aiGeneration', 'id')
  @Get('ai/generations/:id/events')
  async events(@Param('id') id: string, @Req() req: AppRequest, @Res() res: Response) {
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
    res.end();
  }

  @Access('ai.use', 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/edit')
  edit(@Param('id') id: string, @Body(new ZodBody(Edit)) body: z.infer<typeof Edit>, @CurrentUser() user: AuthUser) {
    return this.ai.propose(id, body, 'edit', user);
  }

  @Access(['ai.use', 'page.create'], 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/generate-page')
  generatePage(@Param('id') id: string, @Body(new ZodBody(Edit)) body: z.infer<typeof Edit>, @CurrentUser() user: AuthUser) {
    return this.ai.propose(id, body, 'page', user);
  }

  @Access(['ai.use', 'page.update'], 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/generate-section')
  generateSection(@Param('id') id: string, @Body(new ZodBody(Edit.extend({ pageId: z.string() }))) body: z.infer<typeof Edit> & { pageId: string }, @CurrentUser() user: AuthUser) {
    return this.ai.propose(id, body, 'section', user);
  }

  @Access(['ai.use', 'page.update'], 'aiGeneration', 'id')
  @HttpCode(200)
  @Post('ai/generations/:id/apply')
  apply(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.apply(id, user);
  }

  @Access(['ai.use', 'page.update'], 'aiGeneration', 'id')
  @HttpCode(200)
  @Post('ai/generations/:id/revert')
  revert(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.revert(id, user);
  }

  @Access('ai.use', 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/rewrite')
  rewrite(@Param('id') id: string, @Body(new ZodBody(Rewrite)) body: { text: string; mode: RewriteMode; locale?: string; context?: string }) {
    return this.ai.rewrite(id, body);
  }

  @Access(['ai.use', 'seo.manage'], 'website', 'id')
  @HttpCode(200)
  @Post('websites/:id/ai/seo')
  seo(@Param('id') id: string, @Body(new ZodBody(z.object({ pageId: z.string() }))) body: { pageId: string }) {
    return this.ai.seo(id, body.pageId);
  }

  @Access('page.read', 'website', 'id')
  @Get('websites/:id/ai/generations')
  history(@Param('id') id: string) {
    return this.ai.history(id);
  }
}
