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
