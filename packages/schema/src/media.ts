import { z } from 'zod';
import { OptionalSafeMediaUrlSchema, SafeMediaUrlSchema } from './safe-url';

/** Reference to an image/video. `mediaId` links to the media library for responsive variants. */
export const MediaRefSchema = z.object({
  src: SafeMediaUrlSchema,
  mediaId: z.string().optional(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  blurDataUrl: OptionalSafeMediaUrlSchema,
  mimeType: z.string().optional(),
  poster: OptionalSafeMediaUrlSchema,
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

/** Responsive variants of one media-library asset, as shipped to renderers for srcset generation. */
export const MediaVariantInfoSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  blurDataUrl: OptionalSafeMediaUrlSchema,
  variants: z.array(z.object({ width: z.number().int().positive(), url: SafeMediaUrlSchema, format: z.string().optional() })),
});
export type MediaVariantInfo = z.infer<typeof MediaVariantInfoSchema>;

/** Variants keyed by `mediaId` (MediaRef objects) or by the media URL (bare string references). */
export const MediaManifestSchema = z.record(z.string(), MediaVariantInfoSchema);
export type MediaManifest = z.infer<typeof MediaManifestSchema>;
