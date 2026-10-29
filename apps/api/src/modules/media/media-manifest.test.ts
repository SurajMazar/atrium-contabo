import { describe, expect, it } from 'vitest';
import { collectMediaRefs, manifestEntry, mediaKeyFromUrl } from './media-manifest';
import { MediaService } from './media.service';

const PUBLIC = 'https://api.test/v1/storage';
const url = (key: string) => `${PUBLIC}/${key}`;
const variants = (stem: string, widths: number[]) => widths.flatMap((w) => (['webp', 'avif'] as const).map((format) => ({ width: w, height: w, format, key: `${stem}/w${w}.${format}`, url: url(`${stem}/w${w}.${format}`), size: 1 })));

describe('media manifest', () => {
  it('collects mediaIds of MediaRef objects and every other string', () => {
    const refs = collectMediaRefs({ pages: [{ sections: [{ props: { image: { src: url('media/o1/a.webp'), mediaId: 'm1', alt: 'A' }, logo: url('media/o1/logo.png') } }] }] });
    expect([...refs.ids]).toEqual(['m1']);
    expect(refs.urls.has(url('media/o1/logo.png'))).toBe(true);
    expect(refs.urls.has('A')).toBe(true);
    expect(refs.urls.has(url('media/o1/a.webp'))).toBe(false);
  });

  it('maps an organization media URL back to its storage key', () => {
    expect(mediaKeyFromUrl(url('media/o1/2026/10/x-a%20b.webp?v=1'), 'o1')).toBe('media/o1/2026/10/x-a b.webp');
    expect(mediaKeyFromUrl(url('media/o2/2026/10/x.webp'), 'o1')).toBeNull();
    expect(mediaKeyFromUrl('Hello', 'o1')).toBeNull();
  });

  it('ships one format per width (WebP) and skips unprocessed media', () => {
    const entry = manifestEntry({ key: 'media/o1/a.webp', width: 1500, height: 2000, variants: variants('media/o1/a', [320, 640]) }, url)!;
    expect(entry).toEqual({ width: 1500, height: 2000, variants: [{ width: 320, url: url('media/o1/a/w320.webp'), format: 'webp' }, { width: 640, url: url('media/o1/a/w640.webp'), format: 'webp' }] });
    expect(manifestEntry({ key: 'media/o1/b.svg', width: 10, height: 10, variants: [] }, url)).toBeNull();
  });

  it("builds a site's manifest from the organization's processed media, keyed by mediaId and by URL", async () => {
    const rows = [
      { id: 'm1', key: 'media/o1/a.webp', storageProviderId: null, width: 1500, height: 2000, variants: variants('media/o1/a', [320, 640, 960, 1280]) },
      { id: 'm2', key: 'media/o1/logo.png', storageProviderId: null, width: 400, height: 100, variants: variants('media/o1/logo', [320]) },
      { id: 'm3', key: 'media/o1/icon.svg', storageProviderId: null, width: 24, height: 24, variants: [] },
    ];
    let where: unknown;
    const prisma = { client: { media: { findMany: async (q: { where: unknown }) => ((where = q.where), rows) } } };
    const resolver = { resolver: { storage: async () => ({ getPublicUrl: url }) } };
    const service = new MediaService(prisma as never, resolver as never, null as never, null as never, null as never);
    const definition = { header: { props: { logo: url('media/o1/logo.png'), icon: url('media/o1/icon.svg') } }, pages: [{ sections: [{ props: { image: { src: url('media/o1/a.webp'), mediaId: 'm1' } } }] }] };

    const manifest = await service.manifestFor('o1', definition);

    expect(where).toEqual({ organizationId: 'o1', deletedAt: null, OR: [{ id: { in: ['m1'] } }, { key: { in: ['media/o1/logo.png', 'media/o1/icon.svg'] } }] });
    expect(Object.keys(manifest).sort()).toEqual([url('media/o1/logo.png'), 'm1']);
    expect(manifest.m1!.variants.map((v) => v.width)).toEqual([320, 640, 960, 1280]);
    expect(manifest.m1!.variants.every((v) => v.url.endsWith('.webp'))).toBe(true);
    expect(await service.manifestFor('o1', { pages: [{ title: 'No media' }] })).toEqual({});
  });
});
