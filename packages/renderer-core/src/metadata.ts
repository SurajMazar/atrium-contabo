import type { PageDocument, PageSeo } from '@atrium/schema';
import { publicPathFor } from './routing';
import { resolveTemplateString } from './props';
import type { RenderContext } from './types';
import { plain } from './ui/core';

export interface SiteMetadata {
  title: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  robots: { index: boolean; follow: boolean };
  openGraph: {
    title: string;
    description?: string;
    url?: string;
    siteName: string;
    images?: Array<{ url: string; alt?: string; width?: number; height?: number }>;
    locale?: string;
    type: 'website' | 'article';
  };
  twitter: { card: 'summary' | 'summary_large_image'; title: string; description?: string; images?: string[]; site?: string };
  icons?: { icon: string; apple?: string };
  verification?: { google?: string; other?: Record<string, string> };
  alternates?: { canonical?: string; languages?: Record<string, string> };
}

const firstString = (...vals: unknown[]): string | undefined => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
};

function mediaSrc(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof (v as { src?: unknown }).src === 'string') return (v as { src: string }).src;
  return undefined;
}

/** Effective SEO for the page in the context locale. */
export function effectiveSeo(ctx: RenderContext, page: PageDocument): PageSeo {
  const tr = ctx.locale !== ctx.defaultLocale ? page.translations?.[ctx.locale]?.seo : undefined;
  return { ...page.seo, ...(tr ?? {}) };
}

/** Title/description/image derived for the current collection item (detail pages). */
export function itemSummary(ctx: RenderContext): { title?: string; description?: string; image?: string } {
  const ci = ctx.collectionItem;
  if (!ci) return {};
  const col = ctx.collections.get(ci.collection);
  const data = (ctx.scope.item ?? ci.item.data) as Record<string, unknown>;
  return {
    title: firstString(data[col?.titleField ?? 'name'], data.title, data.name, ci.item.slug),
    description: firstString(data.seoDescription, data.summary, data.excerpt, data.description),
    image: mediaSrc(data.image ?? data.cover ?? data.photo ?? data.thumbnail),
  };
}

function firstImageOnPage(page: PageDocument): string | undefined {
  for (const s of page.sections) {
    const p = s.props as Record<string, unknown>;
    const img = mediaSrc(p.image) ?? mediaSrc(p.poster) ?? (Array.isArray(p.images) ? mediaSrc(p.images[0]) : undefined);
    if (img && !img.includes('{{')) return img;
  }
  return undefined;
}

/** Path of the current page in the context locale (no basePath). */
export function currentPublicPath(ctx: RenderContext, page: PageDocument, locale = ctx.locale): string {
  return publicPathFor(ctx.definition, page, locale, ctx.collectionItem);
}

/** Next.js-compatible metadata object for a page. */
export function buildMetadata(ctx: RenderContext, page: PageDocument): SiteMetadata {
  const site = ctx.settings.seo;
  const seo = effectiveSeo(ctx, page);
  const t = (v?: string) => (v ? plain(String(resolveTemplateString(v, ctx.scope))) || undefined : undefined);
  const item = itemSummary(ctx);
  const pageTitle = (ctx.locale !== ctx.defaultLocale ? page.translations?.[ctx.locale]?.title : undefined) ?? page.title;
  const baseTitle = t(seo.title) ?? item.title ?? plain(pageTitle);
  const template = (site.titleTemplate || '%s').replace(/\{site\}/g, site.siteTitle);
  const title = page.isHomepage && !seo.title ? site.siteTitle : baseTitle.includes(site.siteTitle) ? baseTitle : template.replace('%s', baseTitle);
  const description = t(seo.description) ?? item.description ?? (site.description || undefined);
  const path = currentPublicPath(ctx, page);
  const canonical = seo.canonical ? (seo.canonical.startsWith('/') ? ctx.absoluteUrl(seo.canonical) ?? seo.canonical : seo.canonical) : ctx.absoluteUrl(path);
  const robots = ctx.mode === 'preview' ? { index: false, follow: false } : (seo.robots ?? site.robots);
  const rawImage = t(seo.ogImage) ?? item.image ?? firstImageOnPage(page) ?? site.ogImage;
  const image = rawImage ? (rawImage.startsWith('/') ? ctx.absoluteUrl(rawImage) ?? rawImage : rawImage) : undefined;
  const ogTitle = t(seo.ogTitle) ?? baseTitle;
  const ogDescription = t(seo.ogDescription) ?? description;

  let languages: Record<string, string> | undefined;
  const base = (site.canonicalBase ?? (ctx.domain ? `https://${ctx.domain}` : '')).replace(/\/+$/, '');
  if (ctx.locales.length > 1 && base) {
    languages = Object.fromEntries(ctx.locales.map((loc) => [loc, `${base}${publicPathFor(ctx.definition, page, loc, ctx.collectionItem)}`]));
    languages['x-default'] = `${base}${publicPathFor(ctx.definition, page, ctx.defaultLocale, ctx.collectionItem)}`;
  }

  const favicon = ctx.settings.branding.favicon;
  const verification = site.verification.google || site.verification.bing
    ? { google: site.verification.google, other: site.verification.bing ? { 'msvalidate.01': site.verification.bing } : undefined }
    : undefined;

  return {
    title,
    description,
    keywords: seo.keywords,
    canonical,
    robots,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      siteName: site.siteTitle,
      images: image ? [{ url: image, alt: ogTitle }] : undefined,
      locale: ctx.locale,
      type: ctx.collectionItem ? 'article' : 'website',
    },
    twitter: {
      card: seo.twitterCard ?? (image ? 'summary_large_image' : 'summary'),
      title: ogTitle,
      description: ogDescription,
      images: image ? [image] : undefined,
      site: site.twitterHandle,
    },
    icons: favicon ? { icon: favicon, apple: favicon } : undefined,
    verification: verification ? { google: verification.google, ...(verification.other ? { other: verification.other } : {}) } : undefined,
    alternates: { canonical, ...(languages ? { languages } : {}) },
  };
}
