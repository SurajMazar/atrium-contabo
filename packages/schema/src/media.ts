import { z } from 'zod';

/** Reference to an image/video. `mediaId` links to the media library for responsive variants. */
export const MediaRefSchema = z.object({
  src: z.string(),
  mediaId: z.string().optional(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  blurDataUrl: z.string().optional(),
  mimeType: z.string().optional(),
  poster: z.string().optional(),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;
