import type { JobPayload } from '@atrium/server-kit';
import { isFinalAttempt, type JobInfo, type WorkerContext } from '../context';
import { classify, errorMessage, PermanentError } from '../lib/errors';

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

// sharp ≥0.35 ships separate ESM/CJS builds; the ESM entry's default export is the constructor.
type SharpFn = typeof import('sharp').default;
let sharpPromise: Promise<SharpFn> | undefined;
async function loadSharp(): Promise<SharpFn> {
  sharpPromise ??= import('sharp').then((m) => ((m as unknown as { default?: SharpFn }).default ?? (m as unknown as SharpFn)));
  return sharpPromise;
}

const SKIP_VARIANTS = new Set(['image/svg+xml', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']);

/** Decompression-bomb guard: refuse inputs above this many pixels (width × height × pages). */
export const MAX_INPUT_PIXELS = 50_000_000;
/** Options for every sharp() instance on user uploads. */
export const SHARP_INPUT_OPTIONS = { failOn: 'none' as const, limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true };

/**
 * Formats we decode (sniffed from the bytes by libvips, not the client-supplied MIME type).
 * AVIF is reported as `heif` with AV1 compression; other HEIF/TIFF/SVG/PDF/RAW… inputs fail closed.
 */
export function isAllowedInputFormat(meta: { format?: string; compression?: string }): boolean {
  if (meta.format === 'jpeg' || meta.format === 'png' || meta.format === 'webp' || meta.format === 'gif') return true;
  return meta.format === 'heif' && meta.compression === 'av1';
}

/** Throw a PermanentError unless the sniffed format is allowed and the pixel count is bounded. */
export function assertProcessableImage(meta: { format?: string; compression?: string; width?: number; height?: number; pages?: number; pageHeight?: number }): void {
  if (!isAllowedInputFormat(meta)) throw new PermanentError(`Unsupported image format "${meta.format ?? 'unknown'}" (allowed: jpeg, png, webp, avif, gif)`);
  const pixels = (meta.width ?? 0) * (meta.height ?? 0);
  if (!meta.width || !meta.height) throw new PermanentError('Unreadable image (no dimensions)');
  if (pixels > MAX_INPUT_PIXELS) throw new PermanentError(`Image too large (${pixels} pixels > ${MAX_INPUT_PIXELS})`);
}

/** Intrinsic size of an SVG from its root attributes (SVGs are never handed to the decoder). */
export function svgDimensions(svg: string): { width?: number; height?: number } {
  const root = /<svg\b[^>]*>/i.exec(svg.slice(0, 8192))?.[0];
  if (!root) return {};
  const num = (name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(root);
    return m ? Math.round(Number(m[1])) || undefined : undefined;
  };
  let width = num('width');
  let height = num('height');
  const vb = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(root);
  if ((!width || !height) && vb) {
    width ??= Math.round(Number(vb[1])) || undefined;
    height ??= Math.round(Number(vb[2])) || undefined;
  }
  return { width, height };
}

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
        const bytes = await storage.download(media.key);
        if (media.mimeType === 'image/svg+xml') {
          dims = svgDimensions(bytes.subarray(0, 8192).toString('utf8'));
        } else {
          const sharp = await loadSharp();
          const meta = await sharp(bytes, { ...SHARP_INPUT_OPTIONS, animated: true }).metadata();
          if (meta.format === 'gif' && (meta.width ?? 0) * (meta.pageHeight ?? meta.height ?? 0) <= MAX_INPUT_PIXELS) dims = { width: meta.width, height: meta.pageHeight ?? meta.height };
        }
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
    const meta = await sharp(original, SHARP_INPUT_OPTIONS).metadata();
    // Fail closed: only sniffed jpeg/png/webp/avif/gif within the pixel budget are decoded.
    assertProcessableImage(meta);
    if (!meta.width || !meta.height) throw new PermanentError('Unreadable image (no dimensions)');
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
          const pipeline = sharp(original, SHARP_INPUT_OPTIONS).rotate().resize({ width: w, withoutEnlargement: true });
          const buf = format === 'webp' ? await pipeline.webp({ quality: 78, effort: 4 }).toBuffer() : await pipeline.avif({ quality: 52, effort: 3 }).toBuffer();
          const key = variantKey(media.key, w, format);
          await storage.upload({ key, body: buf, contentType: `image/${format}`, visibility: 'public', cacheControl: 'public, max-age=31536000, immutable' });
          variants.push({ width: w, height: h, format, key, url: storage.getPublicUrl(key), size: buf.byteLength });
        }
        await job.updateProgress?.(Math.round((variants.length / (variantWidths(width).length * VARIANT_FORMATS.length)) * 100));
      }
    }

    const blur = await sharp(original, SHARP_INPUT_OPTIONS).rotate().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
    const stats = await sharp(original, SHARP_INPUT_OPTIONS).stats();
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
