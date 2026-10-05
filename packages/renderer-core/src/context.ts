import { buildTemplateScope } from '@atrium/builder-core';
import { registry as defaultRegistry, type ComponentRegistry } from '@atrium/component-registry';
import { resolveLink as resolveSchemaLink, type LinkValue, type PageDocument } from '@atrium/schema';
import type { ImageHelpers, MediaVariantInfo, RenderContext, RenderOptions } from './types';

export const RESPONSIVE_WIDTHS = [480, 768, 1080, 1440, 1920, 2560] as const;

function isParamResizable(src: string): boolean {
  return /[?&]w=\d+/.test(src) || /^https:\/\/images\.unsplash\.com\//.test(src);
}

/** Replace/add the `w` query param (Unsplash/imgix-style resizing). */
export function withWidth(src: string, width: number): string {
  if (/[?&]w=\d+/.test(src)) return src.replace(/([?&])w=\d+/, `$1w=${width}`);
  return `${src}${src.includes('?') ? '&' : '?'}w=${width}`;
}

function createImageHelpers(media: RenderOptions['media']): ImageHelpers {
  const info = (src: string, mediaId?: string): MediaVariantInfo | undefined => (mediaId ? media?.[mediaId] : undefined) ?? media?.[src];
  return {
    info,
    srcSet(src, mediaId) {
      if (!src) return undefined;
      const known = info(src, mediaId);
      if (known?.variants?.length) {
        return [...known.variants].sort((a, b) => a.width - b.width).map((v) => `${v.url} ${v.width}w`).join(', ');
      }
      if (isParamResizable(src)) return RESPONSIVE_WIDTHS.map((w) => `${withWidth(src, w)} ${w}w`).join(', ');
      return undefined;
    },
  };
}

function trimSlashes(s: string) {
  return s.replace(/^\/+|\/+$/g, '');
}

export function pageSlugFor(page: Pick<PageDocument, 'slug' | 'translations'>, locale: string, defaultLocale: string): string {
  if (locale !== defaultLocale) {
    const t = page.translations?.[locale]?.slug;
    if (t !== undefined && t !== null) return trimSlashes(t);
  }
  return page.slug;
}

export interface CreateContextExtras {
  registry?: ComponentRegistry;
}

/** Build the immutable render context shared by every renderer for one page render. */
export function createRenderContext(opts: RenderOptions & CreateContextExtras, page?: PageDocument): RenderContext {
  const def = opts.definition;
  const settings = def.settings;
  const l10n = settings.localization;
  const defaultLocale = l10n.defaultLocale;
  const locales = l10n.locales.length ? l10n.locales : [defaultLocale];
  const locale = opts.locale && locales.includes(opts.locale) ? opts.locale : defaultLocale;
  const basePath = (opts.basePath ?? '').replace(/\/+$/, '');
  const collections = new Map(def.collections.map((c) => [c.slug, c]));
  const pagesById = new Map(def.pages.map((p) => [p.id, p]));

  const publicPath = (path: string, loc = locale): string => {
    if (!path.startsWith('/') || path.startsWith('//')) return path;
    const needsPrefix = l10n.strategy === 'prefix-all' || loc !== defaultLocale;
    if (!needsPrefix) return path;
    return `/${loc}${path === '/' ? '' : path}`;
  };
  const localizePath = (path: string, loc = locale): string => {
    if (!path.startsWith('/') || path.startsWith('//')) return path;
    const p = publicPath(path, loc);
    if (!basePath) return p;
    return p === '/' ? basePath || '/' : `${basePath}${p}`;
  };
  const pagePath = (pageId: string): string | undefined => {
    const p = pagesById.get(pageId);
    if (!p) return undefined;
    const slug = pageSlugFor(p, locale, defaultLocale);
    return localizePath(slug ? `/${slug}` : '/');
  };
  const collectionPublicPath = (collection: string, slug: string) => {
    const prefix = trimSlashes(collections.get(collection)?.routePrefix ?? collection);
    return `/${prefix}/${slug}`;
  };
  const collectionItemPath = (collection: string, slug: string) => localizePath(collectionPublicPath(collection, slug));

  const resolveLink = (link: LinkValue | undefined | null) => {
    const res = resolveSchemaLink(link, { pagePath, collectionItemPath });
    if (!res) return null;
    if (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) {
      return { ...res, href: localizePath(link) };
    }
    return res;
  };

  const canonicalBase = (settings.seo.canonicalBase ?? (opts.domain ? `https://${opts.domain}` : '')).replace(/\/+$/, '');
  const absoluteUrl = (path: string) => (canonicalBase ? `${canonicalBase}${path.startsWith('/') ? path : `/${path}`}` : undefined);

  const item = opts.collectionItem?.item;
  const itemData = item ? { ...item.data, ...(locale !== defaultLocale ? item.translations?.[locale] ?? {} : {}), slug: item.slug, id: item.id } : undefined;
  const pageTitle = page ? (locale !== defaultLocale ? page.translations?.[locale]?.title : undefined) ?? page.title : undefined;
  const scope: Record<string, unknown> = {
    ...buildTemplateScope(def, { domain: opts.domain, locale, page: page ? { title: pageTitle ?? page.title, slug: page.slug } : undefined }),
    ...(itemData ? { item: itemData } : {}),
  };

  const mode = opts.mode;
  const editor = { playAnimations: !!opts.editor?.playAnimations, showEmptyPlaceholders: opts.editor?.showEmptyPlaceholders ?? mode === 'editor' };
  const animationsEnabled = def.theme.motion.intensity !== 'none' && (mode !== 'editor' || editor.playAnimations);

  const ctx: RenderContext = {
    definition: def,
    settings,
    theme: def.theme,
    mode,
    locale,
    defaultLocale,
    locales,
    page,
    scope,
    websiteId: opts.websiteId,
    apiBaseUrl: opts.apiBaseUrl?.replace(/\/+$/, ''),
    runtime: opts.runtime ?? { captcha: {} },
    basePath,
    domain: opts.domain,
    collectionItem: opts.collectionItem,
    editor,
    animationsEnabled,
    forms: new Map(def.forms.flatMap((f) => [[f.id, f], [f.slug, f]] as const)),
    collections,
    globalSections: new Map(def.globalSections.map((g) => [g.id, g])),
    registry: opts.registry ?? defaultRegistry,
    now: opts.now ?? new Date(),
    depth: 0,
    headerOverlay: page ? computeHeaderOverlay(def.header.props, page) : false,
    resolveLink,
    pagePath,
    localizePath,
    collectionItemPath,
    absoluteUrl,
    image: createImageHelpers(opts.media),
  };
  return ctx;
}

const IMMERSIVE_HERO = new Set(['fullscreen-image', 'fullscreen-video', 'carousel', 'cinematic', 'text-overlay']);
const IMMERSIVE_TYPES = new Set(['background-video', 'parallax-band']);

/** Header overlays the page when the page asks for it, or the first section is an immersive hero. */
export function computeHeaderOverlay(headerProps: Record<string, unknown>, page: PageDocument): boolean {
  if (page.layout.header === 'transparent') return true;
  if (page.layout.header === 'hidden' || headerProps.transparentOnHero === false) return false;
  const first = page.sections.find((s) => !s.hidden);
  if (!first) return false;
  if (first.type === 'hero') return IMMERSIVE_HERO.has(first.variant ?? 'fullscreen-image');
  return IMMERSIVE_TYPES.has(first.type);
}

/** Derive a context for a different page (shares maps/helpers). */
export function withPage(ctx: RenderContext, page: PageDocument): RenderContext {
  if (ctx.page === page) return ctx;
  const title = (ctx.locale !== ctx.defaultLocale ? page.translations?.[ctx.locale]?.title : undefined) ?? page.title;
  return { ...ctx, page, scope: { ...ctx.scope, page: { title, slug: page.slug } }, headerOverlay: computeHeaderOverlay(ctx.definition.header.props, page) };
}
