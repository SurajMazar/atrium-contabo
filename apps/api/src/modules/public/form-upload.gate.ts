import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError, badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';

/** Upper bound per file, whatever a form field allows (matches the multipart interceptor). */
export const FORM_FILE_HARD_LIMIT = 25 * 1024 * 1024;
/** Concurrent multipart submissions parsed per API process (each buffers its files in memory). */
const MAX_CONCURRENT_MULTIPART = 8;
let inFlight = 0;

/**
 * Runs before the multipart interceptor, i.e. before any of the body is read, so an anonymous
 * visitor cannot make the API buffer uploads for a form that does not exist or accepts no files:
 *   - unknown / archived form → 404;
 *   - multipart for a form without file fields → 400;
 *   - a declared Content-Length above what the form's file fields allow (+1 MB of fields) → 413;
 *   - more than a few multipart parses in flight → 503 (try again).
 */
@Injectable()
export class FormUploadGate implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ params: { formId?: string }; headers: Record<string, string | undefined>; once?: (e: string, cb: () => void) => void; res?: { once?: (e: string, cb: () => void) => void } }>();
    const formId = req.params.formId;
    if (!formId || formId.length > 64) throw notFound('Form');
    const form = await this.prisma.client.form.findFirst({ where: { id: formId, archivedAt: null }, select: { id: true, fields: { select: { type: true, config: true } } } });
    if (!form) throw notFound('Form');
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/')) return true;

    const fileFields = form.fields.filter((f: { type: string }) => f.type === 'file');
    if (!fileFields.length) throw badRequest('This form does not accept file uploads');
    const allowed = fileFields.reduce((total: number, f: { config: unknown }) => {
      const v = ((f.config as { validation?: unknown } | null)?.validation ?? {}) as { maxFileSizeMb?: number; maxFiles?: number };
      const perFile = Math.min(FORM_FILE_HARD_LIMIT, Math.max(1, v.maxFileSizeMb ?? 10) * 1024 * 1024);
      return total + perFile * Math.min(Math.max(v.maxFiles ?? 1, 1), 5);
    }, 1024 * 1024);
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > allowed) throw new ApiError(413, 'LIMIT_EXCEEDED', 'The upload is larger than this form allows');

    if (inFlight >= MAX_CONCURRENT_MULTIPART) throw new ApiError(503, 'RATE_LIMITED', 'Too many uploads in progress. Please try again in a moment.');
    inFlight++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight--;
    };
    req.res?.once?.('finish', release);
    req.res?.once?.('close', release);
    return true;
  }
}
