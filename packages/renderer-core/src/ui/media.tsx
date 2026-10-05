import type { MediaRef } from '@atrium/schema';
import type { CSSProperties, ReactNode } from 'react';
import type { RenderContext } from '../types';
import { aspectStyle, cx } from './core';

/** Accept MediaRef objects or bare URL strings (e.g. from collection data). */
export function toMedia(v: unknown): MediaRef | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v ? { src: v } : undefined;
  if (typeof v === 'object' && typeof (v as MediaRef).src === 'string' && (v as MediaRef).src) return v as MediaRef;
  return undefined;
}

export interface AImageProps {
  ctx: RenderContext;
  media?: unknown;
  /** `sizes` attribute; defaults to full viewport width. */
  sizes?: string;
  /** Above-the-fold: eager + fetchpriority=high. */
  priority?: boolean;
  className?: string;
  alt?: string;
  decorative?: boolean;
  fit?: 'cover' | 'contain';
  style?: CSSProperties;
  extra?: Record<string, unknown>;
}

/**
 * Responsive <img>: width/height (no CLS), srcset/sizes from media variants or `w=` URLs,
 * lazy by default, object-position from the focal point, alt always present.
 */
export function AImage({ ctx, media, sizes = '100vw', priority, className, alt, decorative, fit, style, extra }: AImageProps): ReactNode {
  const m = toMedia(media);
  if (!m) return null;
  const info = ctx.image.info(m.src, m.mediaId);
  const width = m.width ?? info?.width;
  const height = m.height ?? info?.height;
  const srcSet = ctx.image.srcSet(m.src, m.mediaId);
  const blur = m.blurDataUrl ?? info?.blurDataUrl;
  const fp = m.focalPoint;
  const imgStyle: CSSProperties = {
    ...(fp ? { objectPosition: `${Math.round(fp.x * 100)}% ${Math.round(fp.y * 100)}%` } : {}),
    ...(fit === 'contain' ? { objectFit: 'contain' } : {}),
    ...(blur ? { backgroundImage: `url("${blur}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
    ...style,
  };
  return (
    <img
      src={m.src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={width}
      height={height}
      alt={decorative ? '' : (alt ?? m.alt ?? '')}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'auto' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      className={cx('a-img', className)}
      style={Object.keys(imgStyle).length ? imgStyle : undefined}
      {...(extra as Record<string, string>)}
    />
  );
}

/** Image inside a fixed-ratio frame (object-fit cover). */
export function Frame({ ctx, media, aspect, sizes, priority, className, rounded, children, alt, fit, parallax }: { ctx: RenderContext; media?: unknown; aspect?: string; sizes?: string; priority?: boolean; className?: string; rounded?: string; children?: ReactNode; alt?: string; fit?: 'cover' | 'contain'; parallax?: boolean }): ReactNode {
  const m = toMedia(media);
  return (
    <div className={cx('a-frame', rounded && `a-r-${rounded}`, !m && 'a-frame--empty', className)} style={aspectStyle(aspect)}>
      {m ? <AImage ctx={ctx} media={m} sizes={sizes} priority={priority} alt={alt} fit={fit} extra={parallax ? { 'data-a-parallax': '' } : undefined} /> : null}
      {children}
    </div>
  );
}

/** Responsive `sizes` for an item in an N-column grid inside the default container. */
export function gridSizes(columns: number, max = 1280): string {
  const c = Math.max(1, columns);
  return `(max-width: 767px) 100vw, (max-width: 991px) ${c > 1 ? '50vw' : '100vw'}, ${Math.round(max / c)}px`;
}
