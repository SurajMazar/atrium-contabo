import { THEME_PRESETS } from '@atrium/design-tokens';
import { z } from 'zod';

export const SiteBriefSchema = z.object({
  businessName: z.string().min(1),
  businessType: z.string().default('business'),
  description: z.string().default(''),
  location: z.string().optional(),
  services: z.array(z.string()).optional(),
  audience: z.string().optional(),
  style: z.string().optional(),
  pages: z.array(z.string()).optional(),
  contact: z.object({ phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), whatsapp: z.string().optional() }).optional(),
  social: z.record(z.string(), z.string()).optional(),
  logoUrl: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
  locale: z.string().optional(),
});
export type SiteBrief = z.input<typeof SiteBriefSchema>;

const presetKeys = Object.keys(THEME_PRESETS) as [string, ...string[]];
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SitePlanSchema = z.object({
  siteName: z.string(),
  tagline: z.string().describe('One evocative line, under 12 words'),
  description: z.string().describe('Two-sentence brand description for SEO and the footer'),
  voice: z.string().describe('Brand voice in a few words, e.g. "warm, unhurried, quietly luxurious"'),
  locale: z.string().default('en'),
  themePreset: z.enum(presetKeys),
  palette: z.object({ primary: hex.optional(), secondary: hex.optional(), accent: hex.optional(), background: hex.optional(), surface: hex.optional(), text: hex.optional() }).describe('Optional overrides on top of the preset; keep contrast accessible'),
  fonts: z.object({ heading: z.string().optional(), body: z.string().optional() }).describe('Optional Google Fonts family names'),
  motion: z.enum(['none', 'subtle', 'moderate', 'expressive']),
  headerVariant: z.string(),
  footerVariant: z.string(),
  primaryCta: z.object({ label: z.string(), slug: z.string() }),
  pages: z
    .array(
      z.object({
        title: z.string(),
        slug: z.string().describe('"" for the homepage, otherwise lowercase-hyphenated'),
        purpose: z.string(),
        sections: z.array(z.object({ type: z.string(), variant: z.string().optional(), purpose: z.string() })).min(2).max(12),
      }),
    )
    .min(1)
    .max(12),
  navigation: z.array(z.object({ label: z.string(), slug: z.string(), children: z.array(z.object({ label: z.string(), slug: z.string() })).optional() })).max(8),
  forms: z
    .array(
      z.object({
        name: z.string(),
        slug: z.string(),
        purpose: z.string(),
        submitLabel: z.string(),
        successMessage: z.string(),
        fields: z.array(z.object({ name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), label: z.string(), type: z.enum(['text', 'email', 'phone', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'consent']), required: z.boolean(), options: z.array(z.string()).optional(), width: z.enum(['full', 'half']).optional() })).min(1).max(14),
      }),
    )
    .max(4),
  collections: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        singularName: z.string(),
        fields: z.array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), label: z.string(), type: z.enum(['text', 'textarea', 'richtext', 'number', 'boolean', 'date', 'image', 'gallery', 'select', 'url']) })).min(2).max(12),
        itemCount: z.number().int().min(0).max(12),
      }),
    )
    .max(3),
  structuredData: z.array(z.enum(['Organization', 'LocalBusiness', 'Hotel', 'Resort', 'Restaurant', 'EventVenue', 'Event', 'FAQPage', 'Service', 'Product', 'Article'])).max(4),
});
export type SitePlan = z.output<typeof SitePlanSchema>;

export const PageContentSchema = z.object({
  seo: z.object({ title: z.string(), description: z.string().describe('120–160 characters') }),
  sections: z.array(z.record(z.string(), z.unknown())).min(1).max(14),
});

export const CollectionContentSchema = z.object({
  items: z.array(z.object({ slug: z.string(), data: z.record(z.string(), z.unknown()) })).max(12),
});
