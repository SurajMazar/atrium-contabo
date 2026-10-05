import { z } from 'zod';
import { CollectionDefinitionSchema } from './collections';
import { FormDefinitionSchema } from './forms';
import { NavigationSchema } from './navigation';
import { NodeInputSchema, NodeSchema } from './node';
import { PageDocumentSchema, PageInputSchema } from './page';
import { SiteSettingsSchema } from './settings';
import { ThemeTokensSchema } from './theme';

export const SCHEMA_VERSION = 1;

export const RedirectSchema = z.object({
  id: z.string(),
  source: z.string().startsWith('/'),
  destination: z.string(),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(301),
  enabled: z.boolean().default(true),
});
export type Redirect = z.infer<typeof RedirectSchema>;

export const GlobalSectionSchema = z.object({ id: z.string(), name: z.string(), node: NodeSchema });
export type GlobalSection = z.infer<typeof GlobalSectionSchema>;

/**
 * The complete, portable website representation. This is what:
 *  - publishing freezes into an immutable snapshot,
 *  - the renderer renders,
 *  - export/import/clone serialize,
 *  - templates & blueprints initialize,
 *  - AI agents generate (via WebsiteInputSchema, before normalization).
 */
export const WebsiteDefinitionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  settings: SiteSettingsSchema,
  theme: ThemeTokensSchema,
  navigation: NavigationSchema,
  header: NodeSchema,
  footer: NodeSchema,
  globalSections: z.array(GlobalSectionSchema).default([]),
  pages: z.array(PageDocumentSchema),
  forms: z.array(FormDefinitionSchema).default([]),
  collections: z.array(CollectionDefinitionSchema).default([]),
  redirects: z.array(RedirectSchema).default([]),
  customCss: z.string().max(100_000).optional(),
});
export type WebsiteDefinition = z.infer<typeof WebsiteDefinitionSchema>;

/** Loose input accepted from AI agents / imports. Ids and defaults are filled by normalization. */
export const WebsiteInputSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  settings: SiteSettingsSchema,
  theme: ThemeTokensSchema,
  navigation: NavigationSchema.default({ menus: {} }),
  header: NodeInputSchema,
  footer: NodeInputSchema,
  globalSections: z.array(z.object({ id: z.string().optional(), name: z.string(), node: NodeInputSchema })).default([]),
  pages: z.array(PageInputSchema).min(1),
  forms: z.array(FormDefinitionSchema.extend({ id: z.string().optional() })).default([]),
  collections: z.array(CollectionDefinitionSchema.extend({ id: z.string().optional() })).default([]),
  redirects: z.array(RedirectSchema.extend({ id: z.string().optional() })).default([]),
  customCss: z.string().optional(),
});
export type WebsiteInput = z.input<typeof WebsiteInputSchema>;

/** Published snapshot envelope stored in website_versions and shipped to renderers. */
export const SiteSnapshotSchema = z.object({
  websiteId: z.string(),
  versionId: z.string(),
  version: z.number().int(),
  publishedAt: z.string(),
  /** Base URL for public API calls (forms, analytics) from the rendered site. */
  apiBaseUrl: z.string().optional(),
  primaryDomain: z.string().optional(),
  definition: WebsiteDefinitionSchema,
  /** Public (non-secret) runtime config, e.g. captcha site keys. */
  runtime: z
    .object({
      captcha: z.record(z.string(), z.object({ provider: z.string(), siteKey: z.string() })).default({}),
    })
    .default({ captcha: {} }),
});
export type SiteSnapshot = z.infer<typeof SiteSnapshotSchema>;
