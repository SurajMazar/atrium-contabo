import type { JobPayload } from '@atrium/server-kit';
import { isFinalAttempt, type JobInfo, type WorkerContext } from '../context';
import { classify, errorMessage } from '../lib/errors';

export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920, 2560] as const;
export const VARIANT_FORMATS = ['webp', 'avif'] as const;
export type VariantFormat = (typeof VARIANT_FORMATS)[number];

export interface MediaVariant {
  width: number;
  height: number;
  format: VariantFormat;
  key: string;
  url: string;
  size: number;
}

/** Widths to generate: the standard breakpoints not exceeding the original (or the original width when smaller than all). */
export function variantWidths(originalWidth: number): number[] {
  const widths = VARIANT_WIDTHS.filter((w) => w <= originalWidth);
  return widths.length ? [...widths] : [originalWidth];
}

/** `media/org/2026/10/abc-photo.jpg` → `media/org/2026/10/abc-photo/w640.webp` */
export function variantKey(originalKey: string, width: number, format: VariantFormat): string {
  const base = originalKey.replace(/\.[^./]+$/, '');
  return `${base}/w${width}.${format}`;
}

export function toHex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

type SharpFn = typeof import('sharp');
let sharpPromise: Promise<SharpFn> | undefined;
async function loadSharp(): Promise<SharpFn> {
  sharpPromise ??= import('sharp').then((m) => ((m as unknown as { default?: SharpFn }).default ?? (m as unknown as SharpFn)));
  return sharpPromise;
}

const SKIP_VARIANTS = new Set(['image/svg+xml', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']);

/**
 * `media.process` — responsive WebP + AVIF variants (widths ≤ original), a 20px blur placeholder
 * data URL, dominant color and intrinsic dimensions; updates Media and marks it READY.
 * SVG / GIF (possibly animated) / non-images are marked READY without variants.
 */
export async function processMedia(ctx: WorkerContext, data: JobPayload<'media.process'>, job: JobInfo) {
  const media = await ctx.prisma.media.findUnique({ where: { id: data.mediaId } });
  if (!media || media.deletedAt) return { skipped: 'media not found' };
  const metadata = (media.metadata ?? {}) as Record<string, unknown>;

  if (!media.mimeType.startsWith('image/') || SKIP_VARIANTS.has(media.mimeType)) {
    let dims: { width?: number; height?: number } = {};
    if (media.mimeType === 'image/svg+xml' || media.mimeType === 'image/gif') {
      try {
        const storage = await ctx.resolver.storage({ organizationId: media.organizationId, providerId: media.storageProviderId });
        const sharp = await loadSharp();
        const meta = await sharp(await storage.download(media.key), { animated: true, failOn: 'none' }).metadata();
        dims = { width: meta.width, height: meta.pageHeight ?? meta.height };
      } catch {
        /* dimensions are optional for vector/animated media */
      }
    }
    await ctx.prisma.media.update({ where: { id: media.id }, data: { status: 'READY', width: media.width ?? dims.width, height: media.height ?? dims.height } });
    return { skipped: 'no variants for this media type', status: 'READY' };
  }

  try {
    const storage = await ctx.resolver.storage({ organizationId: media.organizationId, providerId: media.storageProviderId });
    const sharp = await loadSharp();
    const original = await storage.download(media.key);
    const meta = await sharp(original, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) throw new Error('Unreadable image (no dimensions)');
    // EXIF orientations 5–8 rotate by 90°: swap the displayed dimensions.
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = rotated ? meta.height : meta.width;
    const height = rotated ? meta.width : meta.height;
    const animated = (meta.pages ?? 1) > 1;

    const variants: MediaVariant[] = [];
    if (!animated) {
      for (const w of variantWidths(width)) {
        const h = Math.max(1, Math.round((height * w) / width));
        for (const format of VARIANT_FORMATS) {
          const pipeline = sharp(original, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true });
          const buf = format === 'webp' ? await pipeline.webp({ quality: 78, effort: 4 }).toBuffer() : await pipeline.avif({ quality: 52, effort: 3 }).toBuffer();
          const key = variantKey(media.key, w, format);
          await storage.upload({ key, body: buf, contentType: `image/${format}`, visibility: 'public', cacheControl: 'public, max-age=31536000, immutable' });
          variants.push({ width: w, height: h, format, key, url: storage.getPublicUrl(key), size: buf.byteLength });
        }
        await job.updateProgress?.(Math.round((variants.length / (variantWidths(width).length * VARIANT_FORMATS.length)) * 100));
      }
    }

    const blur = await sharp(original, { failOn: 'none' }).rotate().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
    const stats = await sharp(original, { failOn: 'none' }).stats();
    await ctx.prisma.media.update({
      where: { id: media.id },
      data: {
        width,
        height,
        variants: variants as unknown as object,
        blurDataUrl: `data:image/webp;base64,${blur.toString('base64')}`,
        dominantColor: toHex(stats.dominant),
        status: 'READY',
        metadata: { ...metadata, format: meta.format, hasAlpha: meta.hasAlpha ?? false, orientation: meta.orientation ?? 1, animated, space: meta.space, processedAt: ctx.now().toISOString(), error: undefined } as object,
      },
    });
    ctx.logger.info({ mediaId: media.id, variants: variants.length, width, height }, 'media processed');
    return { status: 'READY', variants: variants.length, width, height };
  } catch (err) {
    const classified = classify(err);
    if (classified.name === 'PermanentError' || isFinalAttempt(job)) {
      await ctx.prisma.media.update({ where: { id: media.id }, data: { status: 'FAILED', metadata: { ...metadata, error: errorMessage(err), failedAt: ctx.now().toISOString() } as object } });
    }
    throw classified;
  }
}
