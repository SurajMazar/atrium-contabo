import { z } from 'zod';
import { OptionalSafeMediaUrlSchema, OptionalSafeUrlSchema, safeUrlSchema } from './safe-url';
import { SiteSeoSchema } from './seo';

export const SOCIAL_NETWORKS = [
  'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'x', 'pinterest', 'whatsapp', 'messenger', 'telegram',
  'tripadvisor', 'github', 'threads', 'custom',
] as const;

export const SocialLinkSchema = z.object({
  id: z.string(),
  network: z.enum(SOCIAL_NETWORKS),
  url: safeUrlSchema('link', '#'),
  label: z.string().optional(),
  icon: z.string().optional(),
  visible: z.boolean().default(true),
  newTab: z.boolean().default(true),
});
export type SocialLink = z.infer<typeof SocialLinkSchema>;

export const OpeningHoursSchema = z.object({
  days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
  opens: z.string(),
  closes: z.string(),
  label: z.string().optional(),
});

export const BusinessInfoSchema = z.object({
  name: z.string(),
  legalName: z.string().optional(),
  type: z.string().optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      locality: z.string().optional(),
      region: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
      formatted: z.string().optional(),
    })
    .default({}),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  mapsUrl: OptionalSafeUrlSchema,
  openingHours: z.array(OpeningHoursSchema).default([]),
  contactPerson: z.string().optional(),
  priceRange: z.string().optional(),
  foundedYear: z.number().int().optional(),
});
export type BusinessInfo = z.infer<typeof BusinessInfoSchema>;

export const ScriptSchema = z.object({
  id: z.string(),
  name: z.string(),
  placement: z.enum(['head', 'body-start', 'body-end']),
  /** Inline code or external src; never both. */
  src: safeUrlSchema('https').optional(),
  code: z.string().max(50_000).optional(),
  consentCategory: z.enum(['necessary', 'analytics', 'marketing', 'preferences']).default('necessary'),
  enabled: z.boolean().default(true),
  async: z.boolean().optional(),
  defer: z.boolean().optional(),
});
export type ScriptDefinition = z.infer<typeof ScriptSchema>;

export const CookieConsentSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().default('We value your privacy'),
  message: z.string().default('We use cookies to improve your experience and measure site performance.'),
  policyUrl: OptionalSafeUrlSchema,
  categories: z
    .array(z.enum(['necessary', 'analytics', 'marketing', 'preferences']))
    .default(['necessary', 'analytics', 'marketing']),
  position: z.enum(['bottom', 'bottom-left', 'bottom-right']).default('bottom-left'),
});

export const AnalyticsSettingsSchema = z.object({
  builtIn: z.boolean().default(true),
  googleAnalyticsId: z.string().optional(),
  googleTagManagerId: z.string().optional(),
  metaPixelId: z.string().optional(),
});

export const LocalizationSchema = z.object({
  defaultLocale: z.string().default('en'),
  locales: z.array(z.string()).default(['en']),
  strategy: z.enum(['prefix-except-default', 'prefix-all']).default('prefix-except-default'),
});

export const SiteSettingsSchema = z.object({
  name: z.string().min(1),
  business: BusinessInfoSchema,
  social: z.array(SocialLinkSchema).default([]),
  branding: z
    .object({
      logo: OptionalSafeMediaUrlSchema,
      logoInverse: OptionalSafeMediaUrlSchema,
      logoWidth: z.number().optional(),
      favicon: OptionalSafeMediaUrlSchema,
      wordmark: z.string().optional(),
    })
    .default({}),
  seo: SiteSeoSchema,
  localization: LocalizationSchema.default({ defaultLocale: 'en', locales: ['en'], strategy: 'prefix-except-default' }),
  scripts: z.array(ScriptSchema).default([]),
  cookieConsent: CookieConsentSchema.default({
    enabled: false,
    title: 'We value your privacy',
    message: 'We use cookies to improve your experience and measure site performance.',
    categories: ['necessary', 'analytics', 'marketing'],
    position: 'bottom-left',
  }),
  analytics: AnalyticsSettingsSchema.default({ builtIn: true }),
  /** Free-form global variables available as {{vars.key}}. */
  variables: z.record(z.string(), z.string()).default({}),
  notFoundPageId: z.string().optional(),
});
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
export type SiteSettingsInput = z.input<typeof SiteSettingsSchema>;
