import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env';
import { Public, type AppRequest } from '../../common/decorators';
import { forbidden, notFound } from '../../common/errors';
import { safeEqual } from '../../common/tokens';
import { ZodBody } from '../../common/zod.pipe';
import { PublishingService } from '../publishing/publishing.service';
import { PublicService, type UploadedPart } from './public.service';

const Collect = z.object({ websiteId: z.string().min(5).max(40), type: z.string().max(20), path: z.string().max(500), referrer: z.string().max(500).optional(), name: z.string().max(100).optional(), props: z.record(z.string(), z.unknown()).optional() });

function assertRenderer(secret: string | undefined) {
  if (!secret || !safeEqual(secret, env().RENDERER_SECRET)) throw forbidden('Renderer authentication required');
}

@Public()
@Controller()
export class PublicController {
  constructor(private readonly svc: PublicService, private readonly publishing: PublishingService) {}

  @SkipThrottle()
  @Get('public/sites/resolve')
  async resolve(@Query('host') host: string, @Headers('x-renderer-secret') secret: string | undefined, @Headers('if-none-match') inm: string | undefined, @Res() res: Response) {
    assertRenderer(secret);
    if (!host) throw notFound('Site');
    const { etag, ...snapshot } = await this.svc.resolve(host);
    res.setHeader('ETag', etag).setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (inm === etag) return res.status(304).end();
    return res.json(snapshot);
  }

  @SkipThrottle()
  @Get('public/preview')
  preview(@Query('token') token: string, @Query('password') password: string | undefined, @Headers('x-renderer-secret') secret: string | undefined) {
    assertRenderer(secret);
    return this.publishing.resolvePreview(token, password);
  }

  @SkipThrottle()
  @Get('public/domains/check')
  async domainCheck(@Query('domain') domain: string, @Res() res: Response) {
    const ok = domain ? await this.svc.domainAllowed(domain) : false;
    res.status(ok ? 200 : 404).send(ok ? 'ok' : 'unknown');
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('public/forms/:formId/submit')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 25 * 1024 * 1024, files: 10 } }))
  submit(@Param('formId') formId: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: UploadedPart[] | undefined, @Req() req: AppRequest) {
    const parsed = typeof body.values === 'string' ? { ...body, values: JSON.parse(body.values as string) } : body;
    return this.svc.submit(formId, parsed as never, { ip: req.ip, userAgent: req.headers['user-agent'], referrer: req.headers.referer, origin: req.headers.origin }, files ?? []);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(204)
  @Post('public/analytics/collect')
  async collect(@Body(new ZodBody(Collect)) body: z.infer<typeof Collect>, @Req() req: AppRequest) {
    await this.svc.collect(body, { ip: req.ip, userAgent: req.headers['user-agent'], country: (req.headers['cf-ipcountry'] ?? req.headers['x-vercel-ip-country'] ?? req.headers['x-country']) as string | undefined, dnt: req.headers.dnt === '1' || req.headers['sec-gpc'] === '1' });
  }

  /** Files for the `local` storage driver. Private keys are never served here. */
  @SkipThrottle()
  @Get('storage/*key')
  async storage(@Param('key') key: string | string[], @Res() res: Response) {
    const rel = (Array.isArray(key) ? key.join('/') : key).replace(/^\/+/, '');
    if (rel.startsWith('private/') || rel.includes('..')) throw forbidden();
    const root = path.resolve(env().LOCAL_STORAGE_DIR);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) throw forbidden();
    try {
      await fs.access(file);
    } catch {
      throw notFound('File');
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(file);
  }
}
