import { z } from 'zod';
import { NodeInputSchema, NodeSchema } from './node';
import { PageSeoSchema } from './seo';

export const PageStatusSchema = z.enum(['draft', 'published', 'scheduled', 'archived']);
export const PageKindSchema = z.enum(['page', 'collection-template', 'not-found']);

/** Page path segment(s) without leading slash; empty string = homepage. */
export const SlugSchema = z
  .string()
  .max(200)
  .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, 'Use lowercase letters, numbers, hyphens and slashes');

export const PageLayoutSchema = z.object({
  header: z.enum(['default', 'transparent', 'hidden']).default('default'),
  footer: z.enum(['default', 'hidden']).default('default'),
});

const pageBase = {
  title: z.string().min(1).max(200),
  slug: SlugSchema,
  kind: PageKindSchema.default('page'),
  /** For collection templates: the collection slug rendered at /{slug}/{item}. */
  collection: z.string().optional(),
  status: PageStatusSchema.default('draft'),
  publishAt: z.string().datetime().optional(),
  isHomepage: z.boolean().default(false),
  seo: PageSeoSchema.default({}),
  layout: PageLayoutSchema.default({ header: 'default', footer: 'default' }),
  customCss: z.string().max(50_000).optional(),
  scripts: z.object({ head: z.string().max(50_000).optional(), body: z.string().max(50_000).optional() }).optional(),
  translations: z
    .record(z.string(), z.object({ title: z.string().optional(), slug: z.string().optional(), seo: PageSeoSchema.optional() }))
    .optional(),
};

export const PageDocumentSchema = z.object({
  id: z.string(),
  ...pageBase,
  sections: z.array(NodeSchema),
});
export type PageDocument = z.infer<typeof PageDocumentSchema>;

export const PageInputSchema = z.object({
  id: z.string().optional(),
  ...pageBase,
  sections: z.array(NodeInputSchema).default([]),
});
export type PageInput = z.input<typeof PageInputSchema>;

export function pagePath(slug: string): string {
  return slug ? `/${slug}` : '/';
}
