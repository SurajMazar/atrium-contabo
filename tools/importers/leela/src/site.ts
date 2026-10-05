/**
 * Website-level definition: theme (globals.css tokens), settings (business, social, branding,
 * SEO, scripts), the inquiry form (InquiryForm.tsx + lib/inquiry.ts + api/inquiry) and page SEO
 * (each page's `pageMetadata()` + lib/seo.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Ctx } from './context.ts';
import { PAGE_IDS } from './context.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);

export function theme(c: Ctx) {
  const p = c.cfg.palette;
  return {
    name: 'Aurelian Veranda',
    colorScheme: 'light',
    colors: {
      primary: p.charcoal, primaryContrast: p.cream, secondary: p.gold, accent: p.gold, background: p.cream, surface: p.surface, surfaceAlt: p.surfaceLow,
      text: p.charcoal, muted: p.stone, border: `color-mix(in srgb, ${p.charcoal} 18%, transparent)`, inverse: p.charcoal, inverseText: p.cream,
      success: '#2f6b4f', warning: '#a86b1a', danger: '#ba1a1a',
      gold: p.gold, goldInk: p.goldInk, goldDeep: p.goldDeep, goldLight: p.goldLight, ink: p.ink, surfaceMid: p.surfaceMid, surfaceVariant: p.surfaceVariant,
      [c.cfg.accentKey]: p[c.cfg.accentKey]!, whatsapp: '#25d366',
    },
    typography: {
      // Both are loaded by next/font in normal style only; italics (the philosophy quote) are synthesised there too.
      heading: { family: 'Playfair Display', source: 'google', weights: [400], italic: false, fallback: "Georgia, 'Times New Roman', serif" },
      body: { family: 'Hanken Grotesk', source: 'google', weights: [400, 600], italic: false, fallback: 'ui-sans-serif, system-ui, sans-serif' },
      baseSize: 16, scale: 1.25, headingWeight: 400, bodyWeight: 400, headingLineHeight: 1.16, bodyLineHeight: 1.5,
      headingLetterSpacing: 'normal', headingTransform: 'none', eyebrowLetterSpacing: '0.2em',
    },
    spacing: { unit: 8, sectionY: 'regular' },
    radius: { none: '0', sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },
    shadows: { sm: 'none', md: 'none', lg: 'none' },
    borders: { width: '1px', style: 'solid' },
    containerWidths: { narrow: '46rem', default: '1280px', wide: '1280px', full: '100%' },
    buttons: { radius: '0', textTransform: 'uppercase', letterSpacing: '0.15em', paddingY: '0.875rem', paddingX: '2rem', weight: 600 },
    motion: { intensity: 'moderate', ease: 'power2.inOut', duration: 1 },
  };
}

export function inquiryForm(c: Ctx) {
  const d = c.data;
  const opt = (v: string, label = v) => ({ label, value: v });
  return {
    id: 'form-inquiry',
    name: 'Event inquiry',
    slug: 'inquiry',
    fields: [
      { id: 'f-name', type: 'text', name: 'name', label: 'Full Name', required: true, width: 'half', validation: { minLength: 2, maxLength: 120 } },
      { id: 'f-phone', type: 'phone', name: 'phone', label: 'Phone', required: true, width: 'half', validation: { maxLength: 24, pattern: '^[+()\\d][\\d\\s\\-()]{6,19}$', patternMessage: 'That phone number does not look right.' } },
      { id: 'f-email', type: 'email', name: 'email', label: 'Email', required: true, width: 'half', validation: { maxLength: 200 } },
      { id: 'f-date', type: 'date', name: 'eventDate', label: 'Preferred Date', helpText: 'Approximate is fine.', required: false, width: 'half' },
      { id: 'f-guests', type: 'select', name: 'guests', label: 'Number of Guests', placeholder: 'Select a range', required: false, width: 'half', options: d.GUEST_RANGES.map((g: string) => opt(g)) },
      { id: 'f-type', type: 'radio', name: 'eventType', label: 'Event Type', required: true, width: 'full', options: d.INQUIRY_EVENT_TYPES.map((t: string) => opt(t)) },
      {
        id: 'f-package', type: 'radio', name: 'package', label: 'Dining Package', required: false, width: 'full',
        options: d.PACKAGE_CHOICES.map((choice: string) => {
          const pack = d.PACKAGES.find((p) => p.name === choice);
          return opt(choice, pack ? `${choice} ${d.prices[pack.slug]}` : choice);
        }),
      },
      { id: 'f-message', type: 'textarea', name: 'message', label: 'Anything Else', helpText: 'Timings, decoration, catering preferences — whatever helps us prepare.', required: false, width: 'full', validation: { maxLength: 2000 } },
    ],
    settings: {
      submitLabel: 'Send Enquiry',
      successMessage: 'A member of our team will be in touch within one working day to talk through dates, numbers and the shape of your event.',
      storeSubmissions: true,
      honeypot: true,
      captcha: { provider: 'none', minScore: 0.5, action: 'submit' },
      rateLimitPerMinute: 5,
      layout: 'grid',
    },
    rules: [
      {
        id: 'rule-notify',
        name: 'Email the venue',
        enabled: true,
        then: [{
          type: 'email',
          to: [d.CONTACT.email],
          replyTo: '{{email}}',
          subject: 'New enquiry — {{eventType}} — {{name}}',
          body: 'New enquiry from {{name}}\n\nPhone: {{phone}}\nEmail: {{email}}\nEvent type: {{eventType}}\nPreferred date: {{eventDate}}\nGuests: {{guests}}\nDining package: {{package}}\n\n{{message}}',
        }],
        otherwise: [],
        stopProcessing: false,
      },
    ],
  };
}

/** Page SEO from each page's pageMetadata() call (titles carry the layout's `%s — <name>` template). */
export function pageSeo(c: Ctx, page: string): Record<string, unknown> {
  const d = c.data;
  const name = d.SITE.name;
  const meta = page === 'home'
    ? { title: d.homeTitle, description: d.SITE.description, image: 'facade-daylight', keywords: [] as string[] }
    : (d.pageMeta[page] as { title: string; description: string; image?: string; keywords?: string[] } | undefined);
  if (!meta) return {};
  const full = page === 'home' ? meta.title : `${meta.title} — ${name}`;
  const og = d.IMAGES[meta.image ?? 'facade-daylight'];
  return {
    title: full,
    description: meta.description,
    keywords: page === 'home' ? undefined : [...d.BASE_KEYWORDS, ...(meta.keywords ?? [])],
    ogTitle: meta.title,
    ogDescription: meta.description,
    ogImage: c.asset(og.src),
    twitterCard: 'summary_large_image',
    robots: { index: true, follow: true },
  };
}

export function pageStructuredData(c: Ctx, page: string): unknown[] | undefined {
  const d = c.data;
  if (page === 'packages') {
    return [{ type: 'Custom', auto: false, data: {
      '@type': 'OfferCatalog',
      name: `${d.SITE.name} dining packages`,
      itemListElement: d.PACKAGES.map((pack) => ({ '@type': 'Offer', name: `${pack.name} Package`, description: pack.summary, price: pack.price, priceCurrency: 'NPR', eligibleQuantity: { '@type': 'QuantitativeValue', unitText: 'per person' } })),
    } }];
  }
  if (page === 'gallery') {
    const abs = (p: string) => `${d.SITE.url.replace(/\/$/, '')}${p}`;
    return d.GALLERY_VIDEOS.map((v) => ({ type: 'Custom', auto: false, data: {
      '@type': 'VideoObject', name: v.title, description: v.caption, thumbnailUrl: [abs(d.IMAGES[v.poster]!.src)], uploadDate: '2026-09-17',
      ...(v.source.kind === 'file' ? { duration: 'PT11S', contentUrl: abs(v.source.src) } : { embedUrl: `https://www.youtube.com/embed/${v.source.videoId}` }),
      publisher: { '@type': 'Organization', name: d.SITE.name, logo: { '@type': 'ImageObject', url: d.organizationSchema.logo } },
      inLanguage: 'en', isFamilyFriendly: true, url: abs('/gallery'),
    } }));
  }
  return undefined;
}

function script(name: string, config: Record<string, unknown>): string {
  return readFileSync(path.join(HERE, 'scripts', name), 'utf8').replace('__CONFIG__', JSON.stringify(config));
}

export function settings(c: Ctx) {
  const d = c.data;
  const C = d.CONTACT;
  const { '@context': _a, ...venue } = d.venueSchema;
  const { '@context': _b, ...org } = d.organizationSchema;
  const p = c.cfg.palette;
  return {
    name: c.cfg.websiteName,
    business: {
      name: d.SITE.name,
      legalName: d.SITE.legalName,
      type: 'EventVenue',
      tagline: d.SITE.tagline,
      description: d.SITE.description,
      phone: C.landline,
      mobile: C.mobile,
      whatsapp: C.whatsapp,
      email: C.email,
      address: { street: C.address.street, locality: C.address.locality, region: C.address.region, postalCode: C.address.postalCode, country: C.address.country },
      geo: { lat: C.geo.latitude, lng: C.geo.longitude },
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${C.mapsPlaceQuery}`,
      openingHours: [{ days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], opens: '08:30', closes: '19:30', label: C.hours[0].days }],
      priceRange: venue.priceRange,
    },
    social: d.SOCIAL.map((s: { label: string; href: string; icon: string }) => ({ id: `social-${s.icon}`, network: s.icon, url: s.href, label: s.label, visible: true, newTab: true })),
    branding: {
      logo: c.asset(c.cfg.logo.mark),
      favicon: c.asset('app/icon.png'),
      wordmark: c.cfg.logo.wordmark,
    },
    seo: {
      siteTitle: d.SITE.name,
      titleTemplate: `%s — ${d.SITE.name}`,
      description: d.SITE.description,
      ogImage: c.asset(d.IMAGES['facade-daylight'].src),
      robots: { index: true, follow: true },
      structuredData: [
        { type: 'Custom', auto: false, data: venue },
        { type: 'Custom', auto: false, data: org },
      ],
      verification: {},
    },
    localization: { defaultLocale: 'en', locales: ['en'], strategy: 'prefix-except-default' },
    scripts: [
      {
        id: 'lg-atmosphere', name: 'Hero atmosphere (three.js gold motes + garden light)', placement: 'body-end', consentCategory: 'necessary', enabled: true,
        code: script('atmosphere.js', { threeSrc: 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js', gold: p.gold, goldLight: p.goldLight }),
      },
      {
        id: 'lg-motion', name: 'Motion layer (smooth scroll, header, story, gallery filter, cursor, transitions)', placement: 'body-end', consentCategory: 'necessary', enabled: true,
        code: script('motion.js', {
          lerp: c.cfg.lenisLerp,
          anchorDuration: c.cfg.key === 'leela-garden' ? 0.9 : 1.2,
          lenisSrc: 'https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js',
          hideNativeCursor: c.cfg.hideNativeCursor,
          categories: d.GALLERY_CATEGORIES.filter((g: { id: string }) => g.id !== 'all').map((g: { label: string }) => g.label),
          packages: d.PACKAGES.map((pk) => ({ slug: pk.slug, name: pk.name })),
          captionCategories: Object.fromEntries(d.GALLERY_ITEMS.map((it) => [it.caption, d.GALLERY_CATEGORIES.find((g: { id: string }) => g.id === it.category)?.label ?? it.category])),
        }),
      },
    ],
    cookieConsent: { enabled: false, title: 'We value your privacy', message: 'We use cookies to improve your experience and measure site performance.', categories: ['necessary', 'analytics', 'marketing'], position: 'bottom-left' },
    analytics: { builtIn: true },
    variables: {},
    notFoundPageId: PAGE_IDS['not-found'],
  };
}
