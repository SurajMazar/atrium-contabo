/**
 * Runs inside a source site's TypeScript project (`tsx --tsconfig <site>/tsconfig.json`) so the
 * site's own `@/` imports resolve. Prints every content module the converter needs as JSON, so
 * copy, numbers, alt text and links come from the source of truth rather than being retyped.
 */
const root = process.argv[2];
if (!root) throw new Error('usage: extract.ts <site-root>');
const src = `${root.replace(/\/$/, '')}/src`;
const load = (p: string) => import(`${src}/${p}`);

const site = await load('data/site.ts');
const venue = await load('data/venue.ts');
const events = await load('data/events.ts');
const weddings = await load('data/weddings.ts');
const testimonials = await load('data/testimonials.ts');
const gallery = await load('data/gallery.ts');
const images = await load('data/generated/images.ts');
const seo = await load('lib/seo.ts');
const utils = await load('lib/utils.ts');

const out = {
  SITE: site.SITE,
  CONTACT: site.CONTACT,
  SOCIAL: site.SOCIAL,
  NAV: site.NAV,
  FOOTER_LINKS: site.FOOTER_LINKS,
  HEADLINE_STATS: site.HEADLINE_STATS,
  CAPACITY_STATS: site.CAPACITY_STATS,
  SPACES: venue.SPACES,
  FACILITIES: venue.FACILITIES,
  SERVICES: venue.SERVICES,
  EVENT_TYPES: events.EVENT_TYPES,
  PACKAGES: events.PACKAGES,
  INQUIRY_EVENT_TYPES: events.INQUIRY_EVENT_TYPES,
  PACKAGE_CHOICES: events.PACKAGE_CHOICES,
  GUEST_RANGES: events.GUEST_RANGES,
  WEDDING_STAGES: weddings.WEDDING_STAGES,
  WEDDING_INCLUSIONS: weddings.WEDDING_INCLUSIONS,
  PHILOSOPHY: testimonials.PHILOSOPHY,
  TESTIMONIALS: testimonials.TESTIMONIALS,
  GALLERY_CATEGORIES: gallery.GALLERY_CATEGORIES,
  GALLERY_ITEMS: gallery.GALLERY_ITEMS,
  GALLERY_VIDEOS: gallery.GALLERY_VIDEOS,
  IMAGES: images.IMAGES,
  venueSchema: seo.venueSchema(),
  organizationSchema: seo.organizationSchema(),
  /** pageMetadata() keyword base, recovered from a probe call. */
  BASE_KEYWORDS: seo.pageMetadata({ title: 'x', description: 'x', path: '/' }).keywords,
  telLandline: utils.telHref(site.CONTACT.landline),
  telMobile: utils.telHref(site.CONTACT.mobile),
  whatsappHref: utils.whatsappHref(site.CONTACT.whatsapp, site.CONTACT.whatsappMessage),
  prices: Object.fromEntries(events.PACKAGES.map((p: { slug: string; price: number }) => [p.slug, utils.formatNpr(p.price)])),
};

/** Each page's `pageMetadata({...})` argument, evaluated from the page source (plain literals only). */
import { readFileSync } from 'node:fs';
const PAGES = ['about', 'venue', 'weddings', 'events', 'packages', 'gallery', 'contact'];
const pageMeta: Record<string, unknown> = {};
for (const slug of PAGES) {
  const code = readFileSync(`${src}/app/${slug}/page.tsx`, 'utf8');
  const at = code.indexOf('pageMetadata({');
  if (at < 0) continue;
  let i = code.indexOf('{', at);
  let depth = 0;
  let end = i;
  for (; end < code.length; end++) {
    const ch = code[end];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) break;
  }
  pageMeta[slug] = new Function(`return (${code.slice(i, end + 1)})`)();
}
const layout = readFileSync(`${src}/app/layout.tsx`, 'utf8');
(out as Record<string, unknown>).pageMeta = pageMeta;
(out as Record<string, unknown>).homeTitle = `${site.SITE.name} — Luxury Wedding & Event Venue in Kathmandu`;
if (!layout.includes('— Luxury Wedding & Event Venue in Kathmandu')) throw new Error('layout title changed');
process.stdout.write(JSON.stringify(out));
