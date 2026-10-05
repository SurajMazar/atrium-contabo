/** Shared build context: the extracted site data plus asset / link / id helpers. */
import type { SiteConfig } from './config.ts';
import { nextId } from './nodes.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Data = Record<string, any> & {
  SITE: { name: string; shortName: string; legalName: string; tagline: string; description: string; url: string; locale: string };
  CONTACT: any;
  IMAGES: Record<string, { src: string; width: number; height: number; alt: string; category: string; blurDataURL: string }>;
  EVENT_TYPES: Array<{ slug: string; title: string; summary: string; body: string; icon: string; image: string }>;
  PACKAGES: Array<{ slug: string; name: string; price: number; unit: string; highlight?: string; total: number; summary: string; inclusions: string[] }>;
  FACILITIES: Array<{ label: string; value: string; icon: string }>;
  GALLERY_ITEMS: Array<{ key: string; caption: string; category: string; alt: string }>;
  GALLERY_CATEGORIES: Array<{ id: string; label: string }>;
  GALLERY_VIDEOS: Array<{ id: string; title: string; caption: string; poster: string; source: { kind: 'file'; src: string } | { kind: 'youtube'; videoId: string } }>;
  PHILOSOPHY: { quote: string; attribution: string };
  prices: Record<string, string>;
};

export const PAGE_IDS: Record<string, string> = {
  home: 'pg-home', about: 'pg-about', venue: 'pg-venue', weddings: 'pg-weddings', events: 'pg-events',
  packages: 'pg-packages', gallery: 'pg-gallery', contact: 'pg-contact', 'not-found': 'pg-not-found',
};

export class Ctx {
  /** Every public/ path referenced by the definition (bundled under assets/). */
  readonly assets = new Set<string>();
  constructor(readonly cfg: SiteConfig, readonly data: Data) {}

  asset(path: string): string {
    const clean = path.replace(/^\/+/, '');
    this.assets.add(clean);
    return `asset:${clean}`;
  }

  /** MediaRef for an image-manifest key: asset src, intrinsic size, alt text and LQIP. */
  img(key: string, alt?: string): Record<string, unknown> {
    const im = this.data.IMAGES[key];
    if (!im) throw new Error(`Unknown image key "${key}"`);
    return { src: this.asset(im.src), alt: alt ?? im.alt, width: im.width, height: im.height, blurDataUrl: im.blurDataURL, mimeType: 'image/webp' };
  }

  pageLink(page: string, anchor?: string): unknown {
    return anchor ? { type: 'page', pageId: PAGE_IDS[page], anchor } : { type: 'page', pageId: PAGE_IDS[page] };
  }

  /** Site-unique id with a semantic prefix (for script hooks). */
  private seq = new Map<string, number>();
  uid(prefix: string): string {
    return nextId(this.name(prefix));
  }
  /** Next `<prefix>-<n>` name without reserving it (for ids derived from it). */
  name(prefix: string): string {
    const n = (this.seq.get(prefix) ?? 0) + 1;
    this.seq.set(prefix, n);
    return `${prefix}-${n}`;
  }
}
