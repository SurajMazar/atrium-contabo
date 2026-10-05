import { z } from 'zod';

export const COLLECTION_FIELD_TYPES = [
  'text', 'textarea', 'richtext', 'number', 'boolean', 'date', 'datetime', 'image', 'video', 'media', 'gallery',
  'relation', 'multirelation', 'select', 'multiselect', 'color', 'url', 'email', 'location', 'slug', 'json',
] as const;
export type CollectionFieldType = (typeof COLLECTION_FIELD_TYPES)[number];

export const CollectionFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string(),
  type: z.enum(COLLECTION_FIELD_TYPES),
  required: z.boolean().default(false),
  helpText: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  /** Target collection slug for relation fields. */
  relation: z.string().optional(),
  unique: z.boolean().optional(),
  localized: z.boolean().optional(),
});
export type CollectionField = z.infer<typeof CollectionFieldSchema>;

export const CollectionItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  data: z.record(z.string(), z.unknown()),
  position: z.number().int().default(0),
  translations: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

export const CollectionDefinitionSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  singularName: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(CollectionFieldSchema),
  /** Field used as the item title. */
  titleField: z.string().default('name'),
  /** URL prefix for detail pages; rendered by the page with kind=collection-template. */
  routePrefix: z.string().optional(),
  items: z.array(CollectionItemSchema).default([]),
});
export type CollectionDefinition = z.infer<typeof CollectionDefinitionSchema>;
export type CollectionDefinitionInput = z.input<typeof CollectionDefinitionSchema>;

/** Validate an item's data against field definitions. */
export function validateCollectionItem(fields: CollectionField[], data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const f of fields) {
    const v = data[f.key];
    if (f.required && (v === undefined || v === null || v === '')) errors.push(`${f.label} is required`);
    if (v === undefined || v === null) continue;
    if (f.type === 'number' && typeof v !== 'number') errors.push(`${f.label} must be a number`);
    if (f.type === 'boolean' && typeof v !== 'boolean') errors.push(`${f.label} must be true/false`);
    if ((f.type === 'select') && f.options && !f.options.some((o) => o.value === v)) errors.push(`${f.label} has an invalid option`);
  }
  return errors;
}
