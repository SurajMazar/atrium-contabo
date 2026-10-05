import { walkNodes, type Node, type PageDocument } from '@atrium/schema';
import { currentPublicPath, effectiveSeo, itemSummary } from './metadata';
import { resolveNode } from './node-view';
import { interpolateProps } from './props';
import type { RenderContext } from './types';
import { plain } from './ui/core';

type Json = Record<string, unknown>;

const BUSINESS_TYPES = new Set(['LocalBusiness', 'Hotel', 'Resort', 'Restaurant', 'EventVenue', 'Service']);
const DAY: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean).filter((x) => x !== undefined && x !== null && x !== '') as T;
  if (v && typeof v === 'object') {
    const out: Json = {};
    for (const [k, x] of Object.entries(v)) {
      const c = clean(x);
      if (c === undefined || c === null || c === '' || (Array.isArray(c) && !c.length) || (typeof c === 'object' && !Array.isArray(c) && !Object.keys(c as Json).length)) continue;
      out[k] = c;
    }
    return out as T;
  }
  return v;
}

const abs = (ctx: RenderContext, url?: string) => (url && url.startsWith('/') ? ctx.absoluteUrl(url) ?? url : url);

function pageNodes(ctx: RenderContext, page: PageDocument): Node[] {
  const out: Node[] = [];
  walkNodes(page.sections, (n) => {
    if (n.type === 'global-section' && n.ref) {
      const g = ctx.globalSections.get(n.ref);
      if (g) walkNodes([g.node], (x) => void out.push(x));
      return false;
    }
    out.push(n);
  });
  return out;
}

function siteUrl(ctx: RenderContext) {
  return ctx.absoluteUrl('/');
}

function businessEntity(ctx: RenderContext, type: string): Json {
  const b = ctx.settings.business;
  const a = b.address ?? {};
  const social = ctx.settings.social.filter((s) => s.visible !== false).map((s) => s.url);
  return {
    '@type': type === 'Service' ? 'ProfessionalService' : type,
    '@id': `${siteUrl(ctx) ?? ''}#${type.toLowerCase()}`,
    name: b.name,
    legalName: b.legalName,
    description: b.description ?? ctx.settings.seo.description,
    url: siteUrl(ctx),
    logo: abs(ctx, ctx.settings.branding.logo),
    image: abs(ctx, ctx.settings.seo.ogImage ?? ctx.settings.branding.logo),
    telephone: b.phone,
    email: b.email,
    priceRange: b.priceRange,
    foundingDate: b.foundedYear ? String(b.foundedYear) : undefined,
    address: a.street || a.locality || a.formatted
      ? { '@type': 'PostalAddress', streetAddress: a.street ?? (a.locality ? undefined : a.formatted), addressLocality: a.locality, addressRegion: a.region, postalCode: a.postalCode, addressCountry: a.country }
      : undefined,
    geo: b.geo ? { '@type': 'GeoCoordinates', latitude: b.geo.lat, longitude: b.geo.lng } : undefined,
    hasMap: b.mapsUrl,
    openingHoursSpecification: b.openingHours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days.map((d) => DAY[d]), opens: h.opens, closes: h.closes })),
    sameAs: social,
  };
}

function faqEntity(ctx: RenderContext, page: PageDocument): Json | null {
  const qa: Json[] = [];
  for (const n of pageNodes(ctx, page)) {
    if (n.type !== 'faq') continue;
    const { props, hidden } = resolveNode(ctx, n);
    if (hidden || props.emitSchema === false) continue;
    for (const it of (props.items as Array<{ question?: string; answer?: string }>) ?? []) {
      if (it.question && it.answer) qa.push({ '@type': 'Question', name: plain(it.question), acceptedAnswer: { '@type': 'Answer', text: plain(it.answer) } });
    }
  }
  return qa.length ? { '@type': 'FAQPage', mainEntity: qa } : null;
}

function eventEntities(ctx: RenderContext, page: PageDocument): Json[] {
  const out: Json[] = [];
  const b = ctx.settings.business;
  for (const n of pageNodes(ctx, page)) {
    if (n.type !== 'events') continue;
    const { props, hidden } = resolveNode(ctx, n);
    if (hidden) continue;
    for (const ev of (props.items as Array<Record<string, any>>) ?? []) {
      if (!ev.title || !ev.date || Number.isNaN(Date.parse(ev.date))) continue;
      if (!props.showPast && Date.parse(ev.endDate ?? ev.date) < ctx.now.getTime() - 86_400_000) continue;
      out.push({
        '@type': 'Event',
        name: plain(ev.title),
        startDate: ev.date,
        endDate: ev.endDate,
        description: ev.summary ? plain(ev.summary) : undefined,
        image: typeof ev.image === 'object' ? abs(ctx, ev.image?.src) : undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: ev.location ?? b.name, address: b.address?.formatted ?? b.address?.locality },
        organizer: { '@type': 'Organization', name: b.name, url: siteUrl(ctx) },
      });
    }
  }
  return out;
}

function breadcrumbs(ctx: RenderContext, page: PageDocument): Json | null {
  if (page.isHomepage) return null;
  const items: Array<{ name: string; path: string }> = [{ name: ctx.settings.seo.siteTitle, path: '/' }];
  if (ctx.collectionItem) {
    const col = ctx.collections.get(ctx.collectionItem.collection);
    const prefix = `/${(col?.routePrefix ?? col?.slug ?? '').replace(/^\/+|\/+$/g, '')}`;
    const listing = ctx.definition.pages.find((p) => p.kind === 'page' && `/${p.slug}` === prefix);
    items.push({ name: listing?.title ?? col?.name ?? prefix.slice(1), path: prefix });
    items.push({ name: itemSummary(ctx).title ?? ctx.collectionItem.item.slug, path: currentPublicPath(ctx, page) });
  } else {
    const segs = page.slug.split('/');
    for (let i = 1; i < segs.length; i++) {
      const parent = ctx.definition.pages.find((p) => p.slug === segs.slice(0, i).join('/'));
      if (parent) items.push({ name: parent.title, path: `/${parent.slug}` });
    }
    items.push({ name: page.title, path: currentPublicPath(ctx, page) });
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: plain(it.name), item: ctx.absoluteUrl(it.path) })),
  };
}

/**
 * JSON-LD graph for a page: configured structured data (site + page) with values derived from
 * settings and page content, plus automatic FAQPage, Event and BreadcrumbList entries.
 */
export function buildJsonLd(ctx: RenderContext, page: PageDocument): object[] {
  const seo = effectiveSeo(ctx, page);
  const configured = [...ctx.settings.seo.structuredData, ...(seo.structuredData ?? [])];
  const out: Json[] = [];
  const seen = new Set<string>();
  const add = (entity: Json | null | undefined, key?: string) => {
    if (!entity) return;
    const k = key ?? String(entity['@type']);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(clean({ '@context': 'https://schema.org', ...entity }));
  };
  const url = ctx.absoluteUrl(currentPublicPath(ctx, page));
  const item = itemSummary(ctx);

  for (const sd of configured) {
    const data = sd.data ? (interpolateProps(sd.data, ctx.scope) as Json) : {};
    if (!sd.auto) {
      add({ '@type': sd.type === 'Custom' ? data['@type'] ?? 'Thing' : sd.type, ...data }, sd.type === 'Custom' ? `custom-${out.length}` : undefined);
      continue;
    }
    switch (sd.type) {
      case 'Organization':
        add({ ...businessEntity(ctx, 'Organization'), ...data });
        break;
      case 'WebSite':
        add({ '@type': 'WebSite', name: ctx.settings.seo.siteTitle, url: siteUrl(ctx), inLanguage: ctx.locale, description: ctx.settings.seo.description, ...data });
        break;
      case 'FAQPage':
        add(faqEntity(ctx, page) ? { ...faqEntity(ctx, page)!, ...data } : null);
        break;
      case 'BreadcrumbList':
        add(breadcrumbs(ctx, page));
        break;
      case 'Event':
        for (const ev of eventEntities(ctx, page)) add({ ...ev, ...data }, `event-${String(ev.name)}-${String(ev.startDate)}`);
        break;
      case 'Article':
        add({ '@type': 'Article', headline: item.title ?? page.title, description: item.description ?? seo.description, image: abs(ctx, item.image), url, datePublished: (ctx.scope.item as Json | undefined)?.date, publisher: { '@type': 'Organization', name: ctx.settings.business.name, logo: abs(ctx, ctx.settings.branding.logo) }, ...data });
        break;
      case 'Product':
        add({ '@type': 'Product', name: item.title ?? page.title, description: item.description ?? seo.description, image: abs(ctx, item.image), url, brand: { '@type': 'Brand', name: ctx.settings.business.name }, ...data });
        break;
      case 'Custom':
        add({ '@type': data['@type'] ?? 'Thing', ...data }, `custom-${out.length}`);
        break;
      default:
        if (BUSINESS_TYPES.has(sd.type)) {
          const extra: Json = sd.type === 'Restaurant' ? { acceptsReservations: true } : sd.type === 'Hotel' || sd.type === 'Resort' ? { checkinTime: ctx.settings.variables.checkIn, checkoutTime: ctx.settings.variables.checkOut } : {};
          add({ ...businessEntity(ctx, sd.type), ...extra, ...data });
        }
    }
  }
  add(faqEntity(ctx, page));
  for (const ev of eventEntities(ctx, page)) add(ev, `event-${String(ev.name)}-${String(ev.startDate)}`);
  add(breadcrumbs(ctx, page));
  return out;
}

/** Serialize JSON-LD safely for a <script> tag (prevents `</script>` breakouts). */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');
}
