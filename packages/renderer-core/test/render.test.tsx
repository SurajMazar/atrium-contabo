import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Node } from '@atrium/schema';
import {
  applyBinding, buildJsonLd, buildMetadata, createRenderContext, getSiteCss, isRedirect, listRoutes, NodeView, PageView, RENDERER_CSS, resolveNode, resolvePageForPath,
} from '../src/index';
import { registry } from '@atrium/component-registry';
import { createRegistry as createSourceRegistry } from '../../component-registry/src/index';
import { aranya, blueprints, demos } from './fixtures';

const render = (el: Parameters<typeof renderToString>[0]) => renderToString(el);

describe('every page of every demo site and blueprint renders', () => {
  for (const site of [...demos, ...blueprints]) {
    it(site.key, () => {
      for (const route of listRoutes(site.def)) {
        const ctx = createRenderContext({ definition: site.def, mode: 'live', locale: route.locale, collectionItem: route.collectionItem, apiBaseUrl: 'http://api.test/v1', websiteId: 'w1' }, route.page);
        const html = render(createElement(PageView, { ctx, page: route.page }));
        expect(html, route.path).toContain('<main');
        expect(html, route.path).not.toContain('{{');
        expect(getSiteCss(ctx, route.page).length).toBeGreaterThan(1000);
        buildMetadata(ctx, route.page);
        buildJsonLd(ctx, route.page);
      }
    });
  }
  it('renders in editor mode with node markers and drop zones', () => {
    const home = aranya.pages.find((p) => p.isHomepage)!;
    const ctx = createRenderContext({ definition: aranya, mode: 'editor', editor: { showEmptyPlaceholders: true } }, home);
    const html = render(createElement(PageView, { ctx, page: home }));
    expect(html).toContain(`data-node-id="${home.sections[0]!.id}"`);
    expect(html).toContain('data-edit-prop="heading"');
    expect(html).not.toContain('data-a-anim');
  });
});

describe('NodeView', () => {
  const ctx = createRenderContext({ definition: aranya, mode: 'live' }, aranya.pages[0]);
  const node = (n: Partial<Node>): Node => ({ id: 'n1', type: 'heading', props: { text: 'Hi' }, ...n }) as Node;
  it('interpolates templates and emits attrs', () => {
    const html = render(createElement(NodeView, { ctx, node: node({ props: { text: 'Call {{business.phone}}', level: 'h3' }, anchor: 'call', animation: { preset: 'fade-up' } }) }));
    expect(html).toContain(aranya.settings.business.phone!);
    expect(html).toContain('id="call"');
    expect(html).toContain('a-n-n1');
    expect(html).toContain('data-a-anim');
    expect(html).toMatch(/^<h3/);
  });
  it('emits gallery image categories as data-category', () => {
    // Use the registry source so the test does not depend on a rebuilt @atrium/component-registry dist.
    const gctx = createRenderContext({ definition: aranya, mode: 'live', registry: createSourceRegistry() as never }, aranya.pages[0]);
    const html = render(createElement(NodeView, { ctx: gctx, node: { id: 'g1', type: 'gallery', variant: 'masonry', props: { images: [{ src: 'https://img.test/a.jpg', alt: 'A', category: 'Weddings' }, { src: 'https://img.test/b.jpg', alt: 'B' }] } } as Node }));
    expect(html).toContain('data-category="Weddings"');
    expect(html.match(/data-category=/g)).toHaveLength(1);
  });
  it('renders *emphasis* as <em>', () => {
    expect(render(createElement(NodeView, { ctx, node: node({ props: { text: 'A *quiet* place' } }) }))).toContain('<em>quiet</em>');
  });
  it('hides hidden/scheduled/locale-restricted nodes on the live site, dims them in the editor', () => {
    expect(render(createElement(NodeView, { ctx, node: node({ hidden: true }) }))).toBe('');
    expect(render(createElement(NodeView, { ctx, node: node({ visibility: { from: '2999-01-01T00:00:00.000Z' } }) }))).toBe('');
    expect(render(createElement(NodeView, { ctx, node: node({ visibility: { locales: ['fr'] } }) }))).toBe('');
    const ectx = createRenderContext({ definition: aranya, mode: 'editor' });
    expect(render(createElement(NodeView, { ctx: ectx, node: node({ hidden: true }) }))).toContain('data-node-hidden');
  });
  it('applies translations for the active locale', () => {
    const def = structuredClone(aranya);
    def.settings.localization = { defaultLocale: 'en', locales: ['en', 'fr'], strategy: 'prefix-except-default' };
    const fr = createRenderContext({ definition: def, mode: 'live', locale: 'fr' });
    expect(render(createElement(NodeView, { ctx: fr, node: node({ translations: { fr: { text: 'Bonjour' } } }) }))).toContain('Bonjour');
  });
  it('maps collection bindings with filter, sort and limit', () => {
    const def = registry.get('rooms');
    const props = applyBinding({ items: [] }, {
      binding: { collection: 'rooms', limit: 2, sort: { field: 'name', direction: 'desc' }, filter: { match: 'all', conditions: [{ field: 'slug', op: 'neq', value: '{{item.slug}}' }] }, map: { name: '{{item.name}}', image: '{{item.image}}', slug: '{{item.slug}}' } },
    }, def, ctx);
    const items = props.items as Array<{ name: string; image: { src: string }; slug: string }>;
    expect(items).toHaveLength(2);
    expect(items[0]!.name >= items[1]!.name).toBe(true);
    expect(typeof items[0]!.image.src).toBe('string');
  });
  it('resolves {{item.*}} on collection-template pages including media merge', () => {
    const col = aranya.collections.find((c) => c.slug === 'rooms')!;
    const r = resolvePageForPath(aranya, `/${col.routePrefix}/${col.items[1]!.slug}`);
    if (!r || isRedirect(r)) throw new Error('no route');
    const ictx = createRenderContext({ definition: aranya, mode: 'live', collectionItem: r.collectionItem }, r.page);
    const hero = r.page.sections.find((s) => s.type === 'hero')!;
    const res = resolveNode(ictx, hero);
    expect(res.props.heading).toBe(col.items[1]!.data.name);
    expect(String(res.props.image?.src)).toMatch(/^https:/);
    const meta = buildMetadata(ictx, r.page);
    expect(meta.title).toContain(String(col.items[1]!.data.name));
  });
});

describe('metadata + JSON-LD', () => {
  it('builds canonical, robots, OG and structured data', () => {
    const home = aranya.pages.find((p) => p.isHomepage)!;
    const ctx = createRenderContext({ definition: aranya, mode: 'live' }, home);
    const meta = buildMetadata(ctx, home);
    expect(meta.canonical).toBe(`${aranya.settings.seo.canonicalBase}/`);
    expect(meta.robots.index).toBe(true);
    expect(meta.openGraph.images?.[0]?.url).toMatch(/^https:/);
    const ld = buildJsonLd(ctx, home) as Array<Record<string, unknown>>;
    expect(ld.some((x) => x['@type'] === 'WebSite')).toBe(true);
    expect(ld.some((x) => x['@type'] === 'FAQPage')).toBe(true);
    const pctx = createRenderContext({ definition: aranya, mode: 'preview' }, home);
    expect(buildMetadata(pctx, home).robots).toEqual({ index: false, follow: false });
  });
  it('emits breadcrumbs on inner pages', () => {
    const rooms = aranya.pages.find((p) => p.slug === 'rooms')!;
    const ld = buildJsonLd(createRenderContext({ definition: aranya, mode: 'live' }, rooms), rooms) as Array<Record<string, unknown>>;
    expect(ld.some((x) => x['@type'] === 'BreadcrumbList')).toBe(true);
  });
  it('exposes the full renderer CSS', () => {
    expect(RENDERER_CSS).toContain('.atrium-site .a-hero');
    expect(RENDERER_CSS.length).toBeGreaterThan(20000);
  });
});
