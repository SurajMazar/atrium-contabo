import type { MediaVariantInfo } from '@atrium/schema';

/** What a site definition points at in the media library. */
export interface MediaRefs {
  /** `mediaId` of every MediaRef object (`{ src, mediaId }`). */
  ids: Set<string>;
  /** Every other string: bare media URLs (logos, posters, collection data) are among them. */
  urls: Set<string>;
}

/** Collect the media references of a JSON value (a website definition). */
export function collectMediaRefs(value: unknown, into: MediaRefs = { ids: new Set(), urls: new Set() }): MediaRefs {
  if (typeof value === 'string') into.urls.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectMediaRefs(v, into));
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const linked = typeof obj.mediaId === 'string' && typeof obj.src === 'string';
    if (linked) into.ids.add(obj.mediaId as string);
    for (const [k, v] of Object.entries(obj)) if (!(linked && (k === 'src' || k === 'mediaId'))) collectMediaRefs(v, into);
  }
  return into;
}

/** Storage key of an organization's media URL (`…/media/<orgId>/2026/10/x.webp` → `media/<orgId>/2026/10/x.webp`). */
export function mediaKeyFromUrl(url: string, organizationId: string): string | null {
  const at = url.indexOf(`media/${organizationId}/`);
  if (at < 0) return null;
  try {
    return decodeURIComponent(url.slice(at).split(/[?#]/)[0]!);
  } catch {
    return null;
  }
}

export interface ManifestMediaRow {
  key: string;
  width: number | null;
  height: number | null;
  variants: unknown;
}

/**
 * Renderer manifest entry for a processed media row, or null without variants. Only one format is
 * shipped per width (srcset cannot pick a format): WebP, which every browser decodes.
 */
export function manifestEntry(m: ManifestMediaRow, publicUrl: (key: string) => string): MediaVariantInfo | null {
  const all = ((m.variants as Array<{ width: number; format?: string; key?: string; url?: string }> | null) ?? []).filter((v) => v.width > 0 && (v.key || v.url));
  const webp = all.filter((v) => v.format === 'webp');
  const variants = (webp.length ? webp : all).map((v) => ({ width: v.width, url: v.key ? publicUrl(v.key) : v.url!, format: v.format }));
  if (!variants.length) return null;
  return { width: m.width ?? undefined, height: m.height ?? undefined, variants };
}
