import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteSnapshotSchema } from '@atrium/schema';
import { AImage, createRenderContext } from '../src/index';
import { aranya } from './fixtures';

const BASE = 'https://api.test/v1/storage/media/org1/2026/10';
const ORIGINAL = `${BASE}/abc-gallery.webp`;
const variant = (w: number, format: string) => ({ width: w, url: `${BASE}/abc-gallery/w${w}.${format}`, format });

/** A published snapshot as the API serves it: the definition plus the live media manifest. */
const snapshot = SiteSnapshotSchema.parse({
  websiteId: 'w1',
  versionId: 'v1',
  version: 1,
  publishedAt: new Date(0).toISOString(),
  definition: aranya,
  media: {
    m1: { width: 1500, height: 2000, variants: [320, 640, 960, 1280].flatMap((w) => [variant(w, 'avif'), variant(w, 'webp')]) },
    [`${BASE}/logo.png`]: { width: 400, height: 100, variants: [variant(320, 'webp')] },
  },
});

const ctx = createRenderContext({ definition: snapshot.definition, mode: 'live', media: snapshot.media });
const img = (media: unknown, sizes?: string) => renderToString(createElement(AImage, { ctx, media, sizes }));

describe('media variants → srcset', () => {
  it('keeps the media manifest when a snapshot is parsed (the renderer re-parses every snapshot)', () => {
    expect(snapshot.media?.m1?.variants).toHaveLength(8);
  });

  it('renders srcset/sizes from the variants of a MediaRef with mediaId: one candidate per width, WebP, then the original', () => {
    const html = img({ src: ORIGINAL, mediaId: 'm1', alt: 'Peaks' }, '(max-width: 767px) 100vw, 640px');
    const srcset = /srcSet="([^"]+)"/.exec(html)?.[1];
    expect(srcset).toBe(
      [`${BASE}/abc-gallery/w320.webp 320w`, `${BASE}/abc-gallery/w640.webp 640w`, `${BASE}/abc-gallery/w960.webp 960w`, `${BASE}/abc-gallery/w1280.webp 1280w`, `${ORIGINAL} 1500w`].join(', '),
    );
    expect(html).toContain('sizes="(max-width: 767px) 100vw, 640px"');
    expect(html).toContain('width="1500"');
    expect(html).toContain('height="2000"');
  });

  it('looks bare string references up by URL', () => {
    const html = img(`${BASE}/logo.png`);
    expect(html).toContain(`srcSet="${BASE}/abc-gallery/w320.webp 320w, ${BASE}/logo.png 400w"`);
    expect(html).toContain('sizes="100vw"');
  });

  it('renders a plain <img> for media without variants', () => {
    const html = img({ src: `${BASE}/other.webp`, mediaId: 'unknown' });
    expect(html).not.toContain('srcSet');
    expect(html).not.toContain('sizes');
  });
});
