import { z } from 'zod';

export const RobotsSchema = z.object({ index: z.boolean().default(true), follow: z.boolean().default(true) });

export const StructuredDataTypeSchema = z.enum([
  'Organization', 'LocalBusiness', 'Hotel', 'Resort', 'Restaurant', 'EventVenue', 'Event', 'Article', 'FAQPage',
  'BreadcrumbList', 'Product', 'WebSite', 'Service', 'Custom',
]);

export const StructuredDataSchema = z.object({
  type: StructuredDataTypeSchema,
  /** When true, data is derived automatically from site settings/page content. */
  auto: z.boolean().default(true),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const PageSeoSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(400).optional(),
  keywords: z.array(z.string()).optional(),
  canonical: z.string().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
  robots: RobotsSchema.optional(),
  structuredData: z.array(StructuredDataSchema).optional(),
  excludeFromSitemap: z.boolean().optional(),
});
export type PageSeo = z.infer<typeof PageSeoSchema>;

export const SiteSeoSchema = z.object({
  siteTitle: z.string(),
  titleTemplate: z.string().default('%s — {site}'),
  description: z.string().default(''),
  ogImage: z.string().optional(),
  robots: RobotsSchema.default({ index: true, follow: true }),
  canonicalBase: z.string().optional(),
  twitterHandle: z.string().optional(),
  structuredData: z.array(StructuredDataSchema).default([]),
  verification: z.object({ google: z.string().optional(), bing: z.string().optional() }).default({}),
});
export type SiteSeo = z.infer<typeof SiteSeoSchema>;
