import type { CollectionDefinition, CollectionItem, PageDocument, WebsiteDefinition } from '@atrium/schema';
import { pageSlugFor } from './context';

export interface ResolvedPage {
  page: PageDocument;
  collectionItem?: { collection: string; item: CollectionItem };
  locale: string;
}
export interface ResolvedRedirect {
  redirect: { destination: string; statusCode: number };
}
export type ResolvePathResult = ResolvedPage | ResolvedRedirect | null;

export interface ResolveOptions {
  /** Preview: include draft/scheduled pages and draft items. */
  includeDrafts?: boolean;
  now?: Date;
}

export function isRedirect(r: ResolvePathResult): r is ResolvedRedirect {
  return !!r && 'redirect' in r;
}

const trim = (s: string) => s.replace(/^\/+|\/+$/g, '');

export function normalizePath(path: string): string {
  let p = (path || '/').split('#')[0]!.split('?')[0]!;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  p = `/${trim(p.replace(/\/{2,}/g, '/'))}`;
  return p;
}

/** Is a page publicly routable right now? */
export function isPageLive(page: PageDocument, opts: ResolveOptions = {}): boolean {
  if (page.status === 'archived') return false;
  if (opts.includeDrafts) return true;
  if (page.status === 'published') return true;
  if (page.status === 'scheduled' && page.publishAt) return Date.parse(page.publishAt) <= (opts.now ?? new Date()).getTime();
  return false;
}

function isItemLive(item: CollectionItem, opts: ResolveOptions): boolean {
  return item.status === 'published' || (!!opts.includeDrafts && item.status === 'draft');
}

export function collectionPrefix(col: Pick<CollectionDefinition, 'slug' | 'routePrefix'>): string {
  return trim(col.routePrefix ?? col.slug);
}

function matchRedirect(source: string, path: string): string | null | undefined {
  const src = normalizePath(source);
  if (src.endsWith('/*')) {
    const base = src.slice(0, -2);
    if (path === base || path.startsWith(`${base}/`)) return path.slice(base.length + 1);
    return undefined;
  }
  return src === path ? null : undefined;
}

/**
 * Resolve a request path to a page (handles redirects, locale prefixes, translated slugs and
 * collection-template routes `/{routePrefix}/{itemSlug}`).
 */
export function resolvePageForPath(definition: WebsiteDefinition, path: string, locale?: string, opts: ResolveOptions = {}): ResolvePathResult {
  const p = normalizePath(path);
  for (const r of definition.redirects) {
    if (!r.enabled) continue;
    const m = matchRedirect(r.source, p);
    if (m === undefined) continue;
    const destination = m === null ? r.destination : r.destination.replace(/:splat|\*/g, m);
    if (normalizePath(destination) === p) continue;
    return { redirect: { destination, statusCode: r.statusCode } };
  }

  const { defaultLocale, locales, strategy } = definition.settings.localization;
  const segs = p.split('/').filter(Boolean);
  let loc = locale && locales.includes(locale) ? locale : undefined;
  if (loc) {
    if (segs[0] === loc) segs.shift();
  } else if (segs[0] && locales.includes(segs[0]) && locales.length > 1) {
    const first = segs.shift()!;
    if (first === defaultLocale && strategy === 'prefix-except-default') {
      return { redirect: { destination: `/${segs.join('/')}`, statusCode: 308 } };
    }
    loc = first;
  } else {
    if (strategy === 'prefix-all' && locales.length > 1) {
      return { redirect: { destination: `/${defaultLocale}${p === '/' ? '' : p}`, statusCode: 307 } };
    }
    loc = defaultLocale;
  }
  const rest = segs.join('/');

  for (const page of definition.pages) {
    if (page.kind !== 'page' || !isPageLive(page, opts)) continue;
    if (pageSlugFor(page, loc, defaultLocale) === rest) return { page, locale: loc };
  }

  for (const page of definition.pages) {
    if (page.kind !== 'collection-template' || !page.collection || !isPageLive(page, opts)) continue;
    const col = definition.collections.find((c) => c.slug === page.collection);
    if (!col) continue;
    const prefix = collectionPrefix(col);
    if (!rest.startsWith(`${prefix}/`)) continue;
    const itemSlug = rest.slice(prefix.length + 1);
    if (!itemSlug || itemSlug.includes('/')) continue;
    const item = col.items.find((i) => i.slug === itemSlug && isItemLive(i, opts));
    if (item) return { page, collectionItem: { collection: col.slug, item }, locale: loc };
  }
  return null;
}

/** The site's custom 404 page (settings.notFoundPageId, else the first `not-found` page). */
export function findNotFoundPage(definition: WebsiteDefinition): PageDocument | undefined {
  const byId = definition.settings.notFoundPageId ? definition.pages.find((p) => p.id === definition.settings.notFoundPageId) : undefined;
  return byId ?? definition.pages.find((p) => p.kind === 'not-found' && p.status !== 'archived');
}

/** Public path (locale-prefixed, no basePath) of a page or collection item. */
export function publicPathFor(definition: WebsiteDefinition, page: PageDocument, locale: string, item?: { collection: string; item: CollectionItem }): string {
  const { defaultLocale, strategy } = definition.settings.localization;
  let rest: string;
  if (item) {
    const col = definition.collections.find((c) => c.slug === item.collection);
    rest = `${col ? collectionPrefix(col) : item.collection}/${item.item.slug}`;
  } else rest = pageSlugFor(page, locale, defaultLocale);
  const prefixed = strategy === 'prefix-all' || locale !== defaultLocale ? [locale, rest].filter(Boolean).join('/') : rest;
  return `/${prefixed}`;
}

export interface RouteEntry {
  /** Path segments without locale/basePath semantics applied by the caller, e.g. ['fr', 'rooms', 'lake-suite']. */
  segments: string[];
  path: string;
  locale: string;
  page: PageDocument;
  collectionItem?: { collection: string; item: CollectionItem };
  /** For sitemaps: excluded by noindex / excludeFromSitemap. */
  indexable: boolean;
  lastModified?: string;
}

/** Every routable URL (all locales, pages + collection item detail pages). */
export function listRoutes(definition: WebsiteDefinition, opts: ResolveOptions = {}): RouteEntry[] {
  const out: RouteEntry[] = [];
  const { locales, defaultLocale } = definition.settings.localization;
  const siteRobots = definition.settings.seo.robots;
  const allLocales = locales.length ? locales : [defaultLocale];
  for (const locale of allLocales) {
    for (const page of definition.pages) {
      if (!isPageLive(page, opts)) continue;
      const robots = page.seo.robots ?? siteRobots;
      const indexable = robots.index && !page.seo.excludeFromSitemap && page.status !== 'draft';
      if (page.kind === 'page') {
        const path = publicPathFor(definition, page, locale);
        out.push({ segments: path.split('/').filter(Boolean), path, locale, page, indexable });
      } else if (page.kind === 'collection-template' && page.collection) {
        const col = definition.collections.find((c) => c.slug === page.collection);
        if (!col) continue;
        for (const item of col.items) {
          if (!isItemLive(item, opts)) continue;
          const ci = { collection: col.slug, item };
          const path = publicPathFor(definition, page, locale, ci);
          out.push({ segments: path.split('/').filter(Boolean), path, locale, page, collectionItem: ci, indexable });
        }
      }
    }
  }
  return out;
}

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** sitemap.xml with hreflang alternates. `baseUrl` like https://example.com (no trailing slash). */
export function buildSitemapXml(definition: WebsiteDefinition, baseUrl: string, opts: { lastModified?: string } = {}): string {
  const base = baseUrl.replace(/\/+$/, '');
  const routes = listRoutes(definition).filter((r) => r.indexable);
  const multi = definition.settings.localization.locales.length > 1;
  const key = (r: RouteEntry) => `${r.page.id}:${r.collectionItem?.item.id ?? ''}`;
  const groups = new Map<string, RouteEntry[]>();
  for (const r of routes) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  const urls = routes.map((r) => {
    const alternates = multi
      ? (groups.get(key(r)) ?? []).map((a) => `<xhtml:link rel="alternate" hreflang="${a.locale}" href="${xmlEscape(base + a.path)}"/>`).join('')
      : '';
    const lastmod = opts.lastModified ? `<lastmod>${opts.lastModified}</lastmod>` : '';
    const priority = r.path === '/' ? '1.0' : r.collectionItem ? '0.6' : '0.8';
    return `<url><loc>${xmlEscape(base + (r.path === '/' ? '/' : r.path))}</loc>${lastmod}<priority>${priority}</priority>${alternates}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${multi ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}>\n${urls.join('\n')}\n</urlset>\n`;
}

/** robots.txt honoring site robots settings; `disallowAll` for previews and non-primary hosts. */
export function buildRobotsTxt(definition: WebsiteDefinition, baseUrl: string | undefined, opts: { disallowAll?: boolean } = {}): string {
  const robots = definition.settings.seo.robots;
  if (opts.disallowAll || !robots.index) return 'User-agent: *\nDisallow: /\n';
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /api/'];
  if (baseUrl) lines.push('', `Sitemap: ${baseUrl.replace(/\/+$/, '')}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}
