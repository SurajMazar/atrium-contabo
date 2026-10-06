import { describe, expect, it } from 'vitest';
import { buildRobotsTxt, buildSitemapXml, findNotFoundPage, isRedirect, listRoutes, resolvePageForPath } from '../src/index';
import { aranya } from './fixtures';

describe('resolvePageForPath', () => {
  it('resolves the homepage and nested slugs with or without trailing slash', () => {
    const home = resolvePageForPath(aranya, '/');
    expect(home && !isRedirect(home) && home.page.isHomepage).toBe(true);
    const rooms = resolvePageForPath(aranya, '/rooms/');
    expect(rooms && !isRedirect(rooms) && rooms.page.slug).toBe('rooms');
  });
  it('resolves collection-template routes to the item', () => {
    const col = aranya.collections.find((c) => c.slug === 'rooms')!;
    const item = col.items[0]!;
    const r = resolvePageForPath(aranya, `/${col.routePrefix ?? col.slug}/${item.slug}`);
    expect(r && !isRedirect(r) && r.page.kind).toBe('collection-template');
    expect(r && !isRedirect(r) && r.collectionItem?.item.slug).toBe(item.slug);
    expect(resolvePageForPath(aranya, `/${col.routePrefix ?? col.slug}/does-not-exist`)).toBeNull();
  });
  it('applies redirects first', () => {
    const r = resolvePageForPath(aranya, '/suites');
    expect(r && isRedirect(r) && r.redirect).toEqual({ destination: '/rooms', statusCode: 301 });
  });
  it('wildcard redirects cannot be bent into an open redirect with backslashes', () => {
    const def = { ...aranya, redirects: [{ id: 'r1', source: '/old/*', destination: '/*', statusCode: 301 as const, enabled: true }] };
    const r = resolvePageForPath(def, '/old/\\evil.com');
    const dest = r && isRedirect(r) ? r.redirect.destination : '';
    expect(dest.startsWith('/\\')).toBe(false);
    expect(dest.startsWith('//')).toBe(false);
  });
  it('does not route template pages or unknown paths directly', () => {
    const tpl = aranya.pages.find((p) => p.kind === 'collection-template')!;
    expect(resolvePageForPath(aranya, `/${tpl.slug}`)).toBeNull();
    expect(resolvePageForPath(aranya, '/nope/nope')).toBeNull();
  });
  it('handles locale prefixes and translated slugs', () => {
    const def = structuredClone(aranya);
    def.settings.localization = { defaultLocale: 'en', locales: ['en', 'de'], strategy: 'prefix-except-default' };
    const rooms = def.pages.find((p) => p.slug === 'rooms')!;
    rooms.translations = { de: { slug: 'zimmer', title: 'Zimmer' } };
    const r = resolvePageForPath(def, '/de/zimmer');
    expect(r && !isRedirect(r) && r.locale).toBe('de');
    expect(r && !isRedirect(r) && r.page.id).toBe(rooms.id);
    const canonical = resolvePageForPath(def, '/en/rooms');
    expect(canonical && isRedirect(canonical) && canonical.redirect.destination).toBe('/rooms');
    expect(listRoutes(def).some((x) => x.path === '/de/zimmer')).toBe(true);
    expect(buildSitemapXml(def, 'https://x.test')).toContain('hreflang="de"');
  });
  it('excludes drafts unless previewing', () => {
    const def = structuredClone(aranya);
    const p = def.pages.find((x) => x.slug === 'gallery')!;
    p.status = 'draft';
    expect(resolvePageForPath(def, '/gallery')).toBeNull();
    expect(resolvePageForPath(def, '/gallery', undefined, { includeDrafts: true })).not.toBeNull();
  });
  it('builds sitemap and robots', () => {
    const xml = buildSitemapXml(aranya, 'https://aranya.example');
    expect(xml).toContain('<loc>https://aranya.example/</loc>');
    expect(xml).toContain('/rooms/');
    expect(xml).not.toContain('room-detail');
    expect(buildRobotsTxt(aranya, 'https://aranya.example')).toContain('Sitemap: https://aranya.example/sitemap.xml');
    expect(buildRobotsTxt(aranya, undefined, { disallowAll: true })).toBe('User-agent: *\nDisallow: /\n');
    expect(findNotFoundPage(aranya)).toBeUndefined();
  });
});
