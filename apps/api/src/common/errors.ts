import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION' | 'CONFLICT' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'INTERNAL' | 'BAD_REQUEST' | 'LIMIT_EXCEEDED' | 'NOT_CONFIGURED';

export class ApiError extends HttpException {
  constructor(status: number, public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super({ error: { code, message, details } }, status);
  }
}

export const notFound = (what = 'Resource') => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do this') => new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
export const unauthorized = (message = 'Authentication required') => new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
export const conflict = (message: string, details?: unknown) => new ApiError(HttpStatus.CONFLICT, 'CONFLICT', message, details);
export const badRequest = (message: string, details?: unknown) => new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details);
export const validation = (message: string, details?: unknown) => new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION', message, details);
export const limitExceeded = (message: string, details?: unknown) => new ApiError(HttpStatus.PAYMENT_REQUIRED, 'LIMIT_EXCEEDED', message, details);
export const notConfigured = (message: string) => new ApiError(HttpStatus.FAILED_DEPENDENCY, 'NOT_CONFIGURED', message);
