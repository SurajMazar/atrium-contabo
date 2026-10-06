import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res, UploadedFiles, UseInterceptors, UseGuards } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { FORM_FILE_HARD_LIMIT, FormUploadGate } from './form-upload.gate';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env';
import { Public, type AppRequest } from '../../common/decorators';
import { localStorageSigningSecret } from '@atrium/server-kit';
import { verifyLocalSignedUrl } from '@atrium/providers';
import { INLINE_TYPES } from '../../common/file-safety';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { safeEqual } from '../../common/tokens';
import { ZodBody } from '../../common/zod.pipe';
import { PublishingService } from '../publishing/publishing.service';
import { PublicService, type UploadedPart } from './public.service';

const Collect = z.object({
  websiteId: z.string().min(5).max(40),
  type: z.string().max(20),
  path: z.string().max(500),
  referrer: z.string().max(500).optional(),
  name: z.string().max(100).optional(),
  // Event properties are stored: keep them small, flat and scalar.
  props: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).refine((p) => Object.keys(p).length <= 20, 'Too many properties').optional(),
});

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
  // Guards run before interceptors: the form is checked before any upload is buffered.
  @UseGuards(FormUploadGate)
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: FORM_FILE_HARD_LIMIT, files: 5, fields: 200, fieldSize: 100_000, parts: 210 } }))
  submit(@Param('formId') formId: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: UploadedPart[] | undefined, @Req() req: AppRequest) {
    let parsed: Record<string, unknown> = body ?? {};
    if (typeof body?.values === 'string') {
      try {
        parsed = { ...body, values: JSON.parse(body.values) as unknown };
      } catch {
        throw badRequest('Malformed form data');
      }
    }
    if (parsed.values !== undefined && (typeof parsed.values !== 'object' || parsed.values === null || Array.isArray(parsed.values))) throw badRequest('Malformed form data');
    return this.svc.submit(formId, parsed as never, { ip: req.ip, userAgent: req.headers['user-agent'], referrer: req.headers.referer, origin: req.headers.origin }, files ?? []);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(204)
  @Post('public/analytics/collect')
  async collect(@Body(new ZodBody(Collect)) body: z.infer<typeof Collect>, @Req() req: AppRequest) {
    await this.svc.collect(body, { ip: req.ip, userAgent: req.headers['user-agent'], country: (req.headers['cf-ipcountry'] ?? req.headers['x-vercel-ip-country'] ?? req.headers['x-country']) as string | undefined, dnt: req.headers.dnt === '1' || req.headers['sec-gpc'] === '1' });
  }

  /**
   * Files for the `local` storage driver. User uploads are hostile content, so every response is
   * sandboxed (no script execution even when opened directly), never sniffed, and anything that
   * isn't a media type is a download. Private keys (form attachments) need a valid signed URL.
   */
  @SkipThrottle()
  @Get('storage/*key')
  async storage(@Param('key') key: string | string[], @Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const resolved = await resolveStoragePath(env().LOCAL_STORAGE_DIR, Array.isArray(key) ? key.join('/') : key);
    if (!resolved) throw notFound('File');
    if (resolved.isPrivate) {
      const secret = localStorageSigningSecret();
      const ok = !!secret && verifyLocalSignedUrl(secret, resolved.key, { expires: q.expires, sig: q.sig, disposition: q.disposition });
      if (!ok) throw notFound('File');
    }
    const mime = mimeForKey(resolved.key);
    const inline = INLINE_TYPES.has(mime) && !(resolved.isPrivate && q.disposition?.startsWith('attachment'));
    res.setHeader('Content-Type', inline ? mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', inline ? 'inline' : `attachment; filename="${path.posix.basename(resolved.key).replace(/[^\w.-]/g, '_')}"`);
    res.setHeader('Cache-Control', resolved.isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable');
    return res.sendFile(resolved.file, { dotfiles: 'deny', headers: {} });
  }
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};
function mimeForKey(key: string): string {
  return MIME_BY_EXT[key.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''] ?? 'application/octet-stream';
}

/**
 * Resolve a storage key to a file inside `rootDir`, or null. Normalizes `.`/`..`/duplicate
 * slashes, rejects NUL/backslashes, follows symlinks and re-checks containment, and classifies
 * `private/` case-insensitively (case-insensitive filesystems).
 */
export async function resolveStoragePath(rootDir: string, rawKey: string): Promise<{ file: string; key: string; isPrivate: boolean } | null> {
  if (!rawKey || /[\0\\]/.test(rawKey) || rawKey.length > 1024) return null;
  const key = path.posix.normalize(`/${rawKey}`).slice(1);
  if (!key || key.startsWith('..') || key.endsWith('/')) return null;
  if (key.split('/').some((seg) => seg.startsWith('.'))) return null; // no dotfiles / hidden dirs
  let root: string;
  try {
    root = await fs.realpath(path.resolve(rootDir));
  } catch {
    return null;
  }
  const candidate = path.resolve(root, key);
  if (!candidate.startsWith(root + path.sep)) return null;
  let real: string;
  try {
    real = await fs.realpath(candidate);
    if (!(await fs.stat(real)).isFile()) return null;
  } catch {
    return null;
  }
  if (!real.startsWith(root + path.sep)) return null;
  const relReal = path.relative(root, real).split(path.sep).join('/');
  const isPrivate = /^private(\/|$)/i.test(key) || /^private(\/|$)/i.test(relReal);
  return { file: real, key, isPrivate };
}
