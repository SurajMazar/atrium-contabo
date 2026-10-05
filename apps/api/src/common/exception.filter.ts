import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from './errors';

const STATUS_CODES: Record<number, string> = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'BAD_REQUEST', 422: 'VALIDATION', 429: 'RATE_LIMITED' };

/** Uniform error envelope; never leaks stack traces to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = (req.headers['x-request-id'] as string) ?? req.id;
    if (res.headersSent) return;

    if (exception instanceof ApiError) {
      return res.status(exception.getStatus()).json({ ...(exception.getResponse() as object), requestId });
    }
    if (exception instanceof ZodError) {
      return res.status(422).json({ error: { code: 'VALIDATION', message: 'Invalid request', details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, requestId });
    }
    if (exception instanceof ThrottlerException) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' }, requestId });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      return res.status(status).json({ error: { code: STATUS_CODES[status] ?? 'ERROR', message: Array.isArray(message) ? message.join(', ') : message }, requestId });
    }
    const prismaCode = (exception as { code?: string })?.code;
    if (prismaCode === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists', details: (exception as { meta?: unknown }).meta }, requestId });
    if (prismaCode === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' }, requestId });

    this.logger.error({ err: exception, requestId, path: req.url }, (exception as Error)?.message ?? 'Unhandled error');
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' }, requestId });
  }
}
