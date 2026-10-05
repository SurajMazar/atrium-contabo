import { z } from 'zod';
import { sanitizeUrl, type UrlPolicy } from './security';

/**
 * URL string schemas. The default (sanitizing) variants never throw on stored data: an unsafe
 * value is replaced with `fallback` ('#' for links, '' for media, undefined for optional fields).
 * `strictUrlSchema` rejects instead — use it for API inputs that should report the problem.
 */
export function safeUrlSchema(policy: UrlPolicy, fallback: string, max?: number): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export function safeUrlSchema(policy: UrlPolicy, fallback?: undefined, max?: number): z.ZodPipe<z.ZodString, z.ZodTransform<string | undefined, string>>;
export function safeUrlSchema(policy: UrlPolicy, fallback?: string, max = 8192) {
  return z
    .string()
    .max(max)
    .transform((v) => sanitizeUrl(v, policy) ?? fallback);
}

export function strictUrlSchema(policy: UrlPolicy, max = 8192) {
  return z
    .string()
    .max(max)
    .refine((v) => sanitizeUrl(v, policy) !== undefined, { message: `URL is not allowed here (${policy})` });
}

/** Link href (http(s), mailto, tel, sms, relative, #fragment). Unsafe → '#'. */
export const SafeUrlSchema = safeUrlSchema('link', '#');
/** Image/video source (http(s), relative, data:image/png|jpeg|webp|gif|avif). Unsafe → ''. */
export const SafeMediaUrlSchema = safeUrlSchema('media', '');
/** Optional link-like URL (social, maps, policy pages). Unsafe → undefined. */
export const OptionalSafeUrlSchema = safeUrlSchema('link').optional();
/** Optional media URL (logos, favicons, og images). Unsafe → undefined. */
export const OptionalSafeMediaUrlSchema = safeUrlSchema('media').optional();
