/**
 * Shared building blocks for blueprints. Everything here returns plain data
 * (NodeInput / PageInput / form / collection definitions) — no runtime code.
 */
import { slugify, type NavItem, type NodeInput, type PageInput, type WebsiteInput } from '@atrium/schema';
import { settingsFrom, themeFrom } from '../helpers';
import { img, photoUrl, type ImageKey } from '../images';
import type { BlueprintInput } from '../types';

export type Section = NodeInput;
export type Form = NonNullable<WebsiteInput['forms']>[number];
export type FormField = Form['fields'][number];
export type FormRule = NonNullable<Form['rules']>[number];
export type Collection = NonNullable<WebsiteInput['collections']>[number];
export type GlobalSection = NonNullable<WebsiteInput['globalSections']>[number];
export type StructuredType = 'Organization' | 'LocalBusiness' | 'Hotel' | 'Resort' | 'Restaurant' | 'EventVenue' | 'WebSite' | 'Service';

export { img, photoUrl };

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Trim to `max` characters at a word boundary (adds an ellipsis when cut). */
export function clip(text: string, max: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const idx = cut.lastIndexOf(' ');
  return `${(idx > max * 0.6 ? cut.slice(0, idx) : cut).replace(/[\s,.;:—–-]+$/, '')}…`;
}

/** Page meta title ≤ 60 characters: "Label · Business", shortening the business name when needed. */
export function metaTitle(label: string, name: string): string {
  const sep = ' | ';
  const full = `${label}${sep}${name}`;
  if (full.length <= 60) return full;
  const room = 60 - label.length - sep.length;
  if (room >= 8) return `${label}${sep}${clip(name, room)}`;
  return clip(label, 60);
}

/** Homepage meta title ≤ 60 characters: "Business — descriptor". */
export function homeTitle(name: string, descriptor: string): string {
  const full = `${name} — ${descriptor}`;
  if (full.length <= 60) return full;
  return clip(name, 60);
}

const DESCRIPTION_FILLERS = [
  'Explore what we offer and get in touch with our team.',
  'Thoughtful service, honest advice and a warm welcome.',
  'We reply to every message within one working day.',
];

/** Meta description between 120 and 160 characters, whatever the business name length. */
export function metaDescription(...parts: string[]): string {
  let s = parts.join(' ').replace(/\s+/g, ' ').trim();
  for (const f of DESCRIPTION_FILLERS) {
    if (s.length >= 120) break;
    s = `${s} ${f}`;
  }
  if (s.length > 160) {
    const cut = s.slice(0, 159);
    const idx = cut.lastIndexOf(' ');
    s = `${(idx >= 120 ? cut.slice(0, idx) : cut.slice(0, 158)).replace(/[\s,.;:—–-]+$/, '')}…`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Node helpers
// ---------------------------------------------------------------------------

export type ButtonStyle = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
export function btn(label: string, link: string, style: ButtonStyle = 'primary') {
  return { label, link, style, iconPosition: 'end' as const };
}

export const anim = {
  hero: { preset: 'editorial-reveal' },
  cinematic: { preset: 'cinematic-reveal' },
  text: { preset: 'text-reveal' },
  words: { preset: 'word-reveal' },
  fadeUp: { preset: 'fade-up' },
  fade: { preset: 'fade' },
  stagger: { preset: 'stagger' },
  mask: { preset: 'image-mask' },
  clip: { preset: 'clip-reveal' },
  blur: { preset: 'blur-reveal' },
  scale: { preset: 'scale-in' },
} as const;

export function navItem(id: string, label: string, link: string, children?: NavItem[], extra: Partial<NavItem> = {}): NavItem {
  return { id, label, link, ...(children ? { children } : {}), ...extra };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqSection(items: FaqItem[], o: { eyebrow?: string; heading?: string; subheading?: string; tone?: string; cta?: boolean; ctaLink?: string; anchor?: string } = {}): Section {
  return {
    type: 'faq',
    variant: 'two-column',
    ...(o.anchor ? { anchor: o.anchor } : {}),
    props: {
      tone: o.tone ?? 'default',
      eyebrow: o.eyebrow ?? 'Good to know',
      heading: o.heading ?? 'Questions, *answered*',
      subheading: o.subheading ?? 'Anything else on your mind? Write to us at {{business.email | our team}} and we will reply within a day.',
      items,
      ...(o.cta === false ? { cta: undefined } : { cta: btn('Ask us anything', o.ctaLink ?? '/contact', 'link') }),
    },
    animation: anim.fadeUp,
  };
}

export function ctaSection(o: {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  buttons: ReturnType<typeof btn>[];
  image?: ImageKey;
  variant?: 'banner' | 'split' | 'centered' | 'image-background';
  tone?: string;
}): Section {
  const variant = o.variant ?? (o.image ? 'image-background' : 'centered');
  return {
    type: 'cta',
    variant,
    props: {
      tone: o.tone ?? (variant === 'image-background' ? 'inverse' : 'surface'),
      eyebrow: o.eyebrow,
      heading: o.heading,
      subheading: o.subheading,
      buttons: o.buttons,
      image: o.image ? img(o.image) : undefined,
      ...(variant === 'image-background' ? { overlayOpacity: 0.45 } : {}),
    },
    animation: anim.fadeUp,
  };
}

export function testimonialsSection(items: Array<{ quote: string; author: string; role?: string; rating?: number; source?: string; avatar?: ImageKey }>, o: { eyebrow?: string; heading?: string; variant?: 'carousel' | 'grid' | 'single'; tone?: string } = {}): Section {
  return {
    type: 'testimonials',
    variant: o.variant ?? 'carousel',
    props: {
      tone: o.tone ?? 'surface',
      eyebrow: o.eyebrow ?? 'Kind words',
      heading: o.heading,
      align: 'center',
      items: items.map((t) => ({ quote: t.quote, author: t.author, role: t.role, rating: t.rating ?? 5, source: t.source, avatar: t.avatar ? img(t.avatar, { width: 400 }) : undefined })),
      showRating: true,
    },
  };
}

export function galleryImages(keys: Array<ImageKey | [ImageKey, string]>): Array<ReturnType<typeof img> & { caption?: string }> {
  return keys.map((k) => (Array.isArray(k) ? { ...img(k[0], { width: 1800 }), caption: k[1] } : img(k, { width: 1800 })));
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function page(o: {
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  sections: Section[];
  home?: boolean;
  kind?: 'page' | 'collection-template';
  collection?: string;
  structuredData?: Array<{ type: 'FAQPage' | 'Article' | 'Event' | 'Product' | 'Service' | 'BreadcrumbList'; auto: boolean }>;
}): PageInput {
  return {
    title: o.title,
    slug: o.home ? '' : o.slug,
    ...(o.home ? { isHomepage: true } : {}),
    ...(o.kind ? { kind: o.kind } : {}),
    ...(o.collection ? { collection: o.collection } : {}),
    status: 'published',
    seo: { title: o.seoTitle, description: o.seoDescription, ...(o.structuredData ? { structuredData: o.structuredData } : {}) },
    sections: o.sections,
  };
}

/** Standard contact page: compact hero, enquiry form (anchor #enquire), contact details with map, optional FAQ. */
export function contactPage(o: {
  name: string;
  formId: string;
  heroImage: ImageKey;
  title?: string;
  slug?: string;
  eyebrow?: string;
  heading: string;
  intro: string;
  formEyebrow?: string;
  formHeading: string;
  formSubheading: string;
  formImage?: ImageKey;
  detailsHeading?: string;
  faq?: FaqItem[];
  seoDescription: string;
  heroVariant?: 'split' | 'editorial' | 'minimal' | 'fullscreen-image';
}): PageInput {
  const variant = o.heroVariant ?? 'split';
  const sections: Section[] = [
    {
      type: 'hero',
      variant,
      props: {
        tone: variant === 'fullscreen-image' ? 'inverse' : 'default',
        eyebrow: o.eyebrow ?? 'Contact',
        heading: o.heading,
        subheading: o.intro,
        buttons: [btn('Send an enquiry', '#enquire')],
        image: img(o.heroImage),
        height: variant === 'fullscreen-image' ? 'tall' : 'auto',
        imageSide: 'right',
        meta: [
          { label: 'Call', value: '{{business.phone | By appointment}}' },
          { label: 'Write', value: '{{business.email | Use the form below}}' },
        ],
        spacingTop: variant === 'fullscreen-image' ? 'none' : 'xl',
        spacingBottom: variant === 'fullscreen-image' ? 'none' : 'lg',
      },
      animation: anim.hero,
    },
    {
      type: 'form',
      variant: 'split-with-text',
      anchor: 'enquire',
      props: {
        tone: 'surface',
        formId: o.formId,
        eyebrow: o.formEyebrow ?? 'Enquire',
        heading: o.formHeading,
        subheading: o.formSubheading,
        image: o.formImage ? img(o.formImage, { width: 1600 }) : undefined,
        showContactDetails: true,
      },
    },
    {
      type: 'contact-info',
      variant: 'split',
      anchor: 'visit',
      props: {
        eyebrow: 'Find us',
        heading: o.detailsHeading ?? 'Where to *find* us',
        subheading: '{{business.address | Our full address is shared on confirmation.}}',
        showPhone: true,
        showEmail: true,
        showWhatsapp: true,
        showAddress: true,
        showHours: true,
        showSocial: true,
      },
      animation: anim.fadeUp,
    },
  ];
  if (o.faq?.length) sections.push(faqSection(o.faq, { tone: 'default', ctaLink: '#enquire' }));
  return page({
    title: o.title ?? 'Contact',
    slug: o.slug ?? 'contact',
    seoTitle: metaTitle(o.title ?? 'Contact', o.name),
    seoDescription: o.seoDescription,
    sections,
  });
}

/** Plain privacy page so the legal menu always resolves. */
export function privacyPage(name: string): PageInput {
  return page({
    title: 'Privacy policy',
    slug: 'privacy',
    seoTitle: metaTitle('Privacy policy', name),
    seoDescription: metaDescription(`How ${name} collects, uses and protects the personal information you share through this website, our forms and our newsletter.`),
    sections: [
      {
        type: 'text-section',
        variant: 'intro',
        props: {
          eyebrow: 'Legal',
          heading: 'Privacy *policy*',
          headingLevel: 'h1',
          body: 'This policy explains what information {{business.name}} collects when you use this website, why we collect it and the choices you have. Please replace this placeholder with your own policy before launch.',
          align: 'left',
          containerWidth: 'narrow',
          spacingTop: 'xl',
          spacingBottom: 'md',
        },
      },
      {
        type: 'section',
        props: { containerWidth: 'narrow', spacingTop: 'none', spacingBottom: 'xl' },
        children: [
          {
            type: 'rich-text',
            props: {
              measure: 'default',
              html: [
                '<h2>Information we collect</h2>',
                '<p>When you send an enquiry, book or subscribe we collect the details you provide — typically your name, email address, phone number and the content of your message. We also collect anonymous usage statistics to understand how the site is used.</p>',
                '<h2>How we use it</h2>',
                '<p>We use your details only to respond to you, to provide the services you request and, if you opt in, to send occasional news. We never sell your information.</p>',
                '<h2>Cookies</h2>',
                '<p>Essential cookies keep the site working. Analytics and marketing cookies are only set with your consent, which you can change at any time.</p>',
                '<h2>Your rights</h2>',
                '<p>You may ask to see, correct or delete the personal information we hold about you. Contact us at {{business.email | the address on our contact page}}.</p>',
              ].join(''),
            },
          },
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

type Width = 'full' | 'half' | 'third';
export const field = {
  name: (width: Width = 'half'): FormField => ({ id: 'f-name', type: 'text', name: 'name', label: 'Full name', placeholder: 'Your name', required: true, width }),
  email: (width: Width = 'half'): FormField => ({ id: 'f-email', type: 'email', name: 'email', label: 'Email', placeholder: 'you@example.com', required: true, width }),
  phone: (width: Width = 'half', required = false): FormField => ({ id: 'f-phone', type: 'phone', name: 'phone', label: 'Phone', required, width }),
  company: (width: Width = 'half'): FormField => ({ id: 'f-company', type: 'text', name: 'company', label: 'Company', width, required: false }),
  message: (label = 'Message', placeholder = 'Tell us a little about what you have in mind'): FormField => ({ id: 'f-message', type: 'textarea', name: 'message', label, placeholder, required: true, width: 'full', validation: { maxLength: 4000 } }),
  date: (name: string, label: string, width: Width = 'half', required = false): FormField => ({ id: `f-${slugify(name)}`, type: 'date', name, label, width, required }),
  number: (name: string, label: string, o: { min?: number; max?: number; width?: Width; required?: boolean } = {}): FormField => ({ id: `f-${slugify(name)}`, type: 'number', name, label, width: o.width ?? 'half', required: o.required ?? false, validation: { min: o.min, max: o.max } }),
  select: (name: string, label: string, options: string[], o: { width?: Width; required?: boolean } = {}): FormField => ({ id: `f-${slugify(name)}`, type: 'select', name, label, width: o.width ?? 'half', required: o.required ?? false, options: options.map((v) => ({ label: v, value: slugify(v) })) }),
  consent: (label = 'I agree to be contacted about my enquiry.'): FormField => ({ id: 'f-consent', type: 'consent', name: 'consent', label, required: true, width: 'full' }),
};

export function emailRule(id: string, to: string, subject: string, extra: Partial<FormRule> = {}): FormRule {
  return { id, name: 'Notify the team', enabled: true, then: [{ type: 'email', to: [to], subject, replyTo: '{{email}}' }], otherwise: [], stopProcessing: false, ...extra };
}

export function buildForm(o: {
  id: string;
  name: string;
  slug: string;
  fields: FormField[];
  notify: string;
  subject: string;
  submitLabel?: string;
  successMessage?: string;
  consentText?: string;
  autoreply?: { subject: string; html: string };
  rules?: FormRule[];
}): Form {
  const rules: FormRule[] = [emailRule(`${o.id}-notify`, o.notify, o.subject)];
  if (o.autoreply) rules.push({ id: `${o.id}-autoreply`, name: 'Confirmation to visitor', enabled: true, then: [{ type: 'autoresponder', subject: o.autoreply.subject, html: o.autoreply.html, emailField: 'email' }], otherwise: [], stopProcessing: false });
  rules.push(...(o.rules ?? []));
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    fields: o.fields,
    settings: {
      submitLabel: o.submitLabel ?? 'Send enquiry',
      successMessage: o.successMessage ?? 'Thank you — your message is with our team and we will reply within one working day.',
      honeypot: true,
      captcha: { provider: 'none', minScore: 0.5, action: 'submit' },
      storeSubmissions: true,
      rateLimitPerMinute: 5,
      layout: 'grid',
      consentText: o.consentText,
    },
    rules,
  };
}

export function newsletterForm(notify: string): Form {
  return buildForm({
    id: 'form-newsletter',
    name: 'Newsletter',
    slug: 'newsletter',
    fields: [field.email('full'), field.consent('Send me occasional news and offers. Unsubscribe at any time.')],
    notify,
    subject: 'New newsletter subscriber',
    submitLabel: 'Subscribe',
    successMessage: 'Thank you for subscribing — look out for our next letter.',
    rules: [{ id: 'form-newsletter-tag', name: 'Tag subscribers', enabled: true, then: [{ type: 'tag', tags: ['newsletter'] }], otherwise: [], stopProcessing: false }],
  });
}

// ---------------------------------------------------------------------------
// Site chrome
// ---------------------------------------------------------------------------

export function header(o: { variant?: 'classic' | 'centered' | 'minimal' | 'stacked'; cta: ReturnType<typeof btn>; showContact?: boolean; showSocial?: boolean; transparentOnHero?: boolean }): Section {
  return {
    type: 'site-header',
    variant: o.variant ?? 'classic',
    props: {
      menu: 'primary',
      cta: o.cta,
      sticky: true,
      transparentOnHero: o.transparentOnHero ?? true,
      showContact: o.showContact ?? false,
      showSocial: o.showSocial ?? false,
      width: 'wide',
    },
  };
}

export function footer(o: {
  variant?: 'columns' | 'centered' | 'statement';
  statement?: string;
  cta?: ReturnType<typeof btn>;
  columns: Array<{ title: string; menu?: string; links?: Array<{ label: string; link: string }> }>;
  newsletterHeading?: string;
  tone?: 'default' | 'surface' | 'inverse' | 'primary';
}): Section {
  return {
    type: 'site-footer',
    variant: o.variant ?? 'columns',
    props: {
      description: '{{business.description}}',
      statement: o.statement,
      cta: o.cta,
      columns: o.columns.map((c) => ({ title: c.title, menu: c.menu, links: c.links ?? [] })),
      showContact: true,
      showSocial: true,
      showNewsletter: true,
      newsletterFormId: 'form-newsletter',
      newsletterHeading: o.newsletterHeading ?? 'Stay in touch',
      legalMenu: 'legal',
      copyright: '© {{year}} {{business.name}}. All rights reserved.',
      tone: o.tone ?? 'inverse',
    },
  };
}

export function legalMenu(contactPath = '/contact'): NavItem[] {
  return [navItem('nav-legal-privacy', 'Privacy policy', '/privacy'), navItem('nav-legal-contact', 'Contact', contactPath)];
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface SiteContext {
  name: string;
  notify: string;
  input: BlueprintInput;
}

export function contextOf(input: BlueprintInput): SiteContext {
  return { name: input.businessName.trim() || 'New site', notify: input.email ?? 'hello@example.com', input };
}

export function assemble(ctx: SiteContext, o: {
  type: string;
  description: string;
  structuredData: StructuredType[];
  theme: string;
  ogImage: ImageKey;
  defaultLocation: string;
  variables?: Record<string, string>;
  menus: Record<string, NavItem[]>;
  header: Section;
  footer: Section;
  pages: PageInput[];
  forms: Form[];
  collections?: Collection[];
  globalSections?: GlobalSection[];
  /** Path of the page holding the main contact form (legal menu link). */
  contactPath?: string;
}): WebsiteInput {
  const base = settingsFrom(ctx.input, { type: o.type, description: o.description, structuredData: o.structuredData });
  const settings = {
    ...base,
    seo: { ...base.seo, canonicalBase: `https://${slugify(ctx.name) || 'site'}.example`, ogImage: photoUrl(o.ogImage, 1200) },
    variables: { location: ctx.input.location ?? o.defaultLocation, ...(o.variables ?? {}) },
  };
  return {
    settings,
    theme: themeFrom(ctx.input.themePreset, o.theme),
    navigation: { menus: { ...o.menus, legal: legalMenu(o.contactPath) } },
    header: o.header,
    footer: o.footer,
    globalSections: o.globalSections ?? [],
    pages: o.pages,
    forms: [...o.forms, newsletterForm(ctx.notify)],
    collections: o.collections ?? [],
  };
}

/** Collection item with an explicit id. */
export function item(collection: string, slug: string, position: number, data: Record<string, unknown>) {
  return { id: `${collection}-${slug}`, slug, status: 'published' as const, position, data };
}

/** Hero copy defaults: the owner's tagline/description when provided, otherwise vertical copy. */
export function heroCopy(input: BlueprintInput, heading: string, subheading: string) {
  return {
    heading: input.tagline ? clip(input.tagline, 300) : heading,
    subheading: input.description ? clip(input.description, 800) : subheading,
  };
}

/** Standard booking-bar global section (hotels/resorts). */
export function bookingBar(heading: string, text: string): GlobalSection {
  return {
    id: 'gs-booking',
    name: 'Booking bar',
    node: {
      type: 'booking-cta',
      variant: 'bar',
      props: { tone: 'surface', heading, text, bookingUrl: 'https://booking.example.com/reserve', maxGuests: 6, defaultNights: 2, buttonLabel: 'Check availability', spacingTop: 'md', spacingBottom: 'md' },
    },
  };
}

export const bookingRef: Section = { type: 'global-section', ref: 'gs-booking', props: {} };
