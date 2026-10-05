import type { CollectionDefinition, FormDefinition, FormField, FormRule, PageDocument } from '@atrium/schema';

export const PAGE_STATUS_TO_DB = { draft: 'DRAFT', published: 'PUBLISHED', scheduled: 'SCHEDULED', archived: 'ARCHIVED' } as const;
export const PAGE_STATUS_FROM_DB = { DRAFT: 'draft', PUBLISHED: 'published', SCHEDULED: 'scheduled', ARCHIVED: 'archived' } as const;
export const PAGE_KIND_TO_DB = { page: 'PAGE', 'collection-template': 'COLLECTION_TEMPLATE', 'not-found': 'NOT_FOUND' } as const;
export const PAGE_KIND_FROM_DB = { PAGE: 'page', COLLECTION_TEMPLATE: 'collection-template', NOT_FOUND: 'not-found' } as const;

export type Json = any; // Prisma JSON input — values are validated by @atrium/schema before reaching here

export const json = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null));
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface PageRow {
  id: string;
  title: string;
  slug: string;
  kind: keyof typeof PAGE_KIND_FROM_DB;
  status: keyof typeof PAGE_STATUS_FROM_DB;
  isHomepage: boolean;
  collection: string | null;
  publishAt: Date | null;
  document: unknown;
}

/** Columns are authoritative for identity/meta; the document holds content. */
export function pageFromRow(row: PageRow): PageDocument {
  const doc = (row.document ?? {}) as Partial<PageDocument>;
  return {
    ...doc,
    id: row.id,
    title: row.title,
    slug: row.slug,
    kind: PAGE_KIND_FROM_DB[row.kind],
    status: PAGE_STATUS_FROM_DB[row.status],
    isHomepage: row.isHomepage,
    collection: row.collection ?? undefined,
    publishAt: row.publishAt?.toISOString(),
    seo: doc.seo ?? {},
    layout: doc.layout ?? { header: 'default', footer: 'default' },
    sections: doc.sections ?? [],
  } as PageDocument;
}

export function pageToRow(page: PageDocument) {
  const { id: _id, title, slug, kind, status, isHomepage, collection, publishAt, ...rest } = page;
  return {
    title,
    slug,
    kind: PAGE_KIND_TO_DB[kind],
    status: PAGE_STATUS_TO_DB[status],
    isHomepage,
    collection: collection ?? null,
    publishAt: publishAt ? new Date(publishAt) : null,
    document: json({ ...rest, id: page.id, title, slug, kind, status, isHomepage, collection }),
  };
}

interface FormRow {
  id: string;
  name: string;
  slug: string;
  settings: unknown;
  fields: Array<{ fieldId: string; name: string; type: string; label: string; position: number; config: unknown }>;
  rules: Array<{ ruleId: string; name: string; enabled: boolean; position: number; when: unknown; then: unknown; otherwise: unknown; stopProcessing: boolean }>;
}

export function formFromRow(row: FormRow): FormDefinition {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    settings: row.settings as FormDefinition['settings'],
    fields: [...row.fields]
      .sort((a, b) => a.position - b.position)
      .map((f) => ({ ...(f.config as object), id: f.fieldId, name: f.name, type: f.type, label: f.label }) as FormField),
    rules: [...row.rules]
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ id: r.ruleId, name: r.name, enabled: r.enabled, when: (r.when ?? undefined) as FormRule['when'], then: r.then as FormRule['then'], otherwise: (r.otherwise ?? []) as FormRule['otherwise'], stopProcessing: r.stopProcessing })),
  };
}

export function formChildRows(form: FormDefinition) {
  return {
    fields: form.fields.map((f, position) => {
      const { id, name, type, label, ...config } = f;
      return { fieldId: id, name, type, label, position, config: json(config) };
    }),
    rules: form.rules.map((r, position) => ({ ruleId: r.id, name: r.name, enabled: r.enabled, position, when: r.when ? json(r.when) : undefined, then: json(r.then), otherwise: json(r.otherwise ?? []), stopProcessing: r.stopProcessing })),
  };
}

interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  singularName: string | null;
  description: string | null;
  titleField: string;
  routePrefix: string | null;
  fields: Array<{ key: string; label: string; type: string; required: boolean; position: number; config: unknown }>;
  items: Array<{ id: string; slug: string; status: string; data: unknown; position: number; translations: unknown }>;
}

export function collectionFromRow(row: CollectionRow, opts: { publishedOnly?: boolean } = {}): CollectionDefinition {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    singularName: row.singularName ?? undefined,
    description: row.description ?? undefined,
    titleField: row.titleField,
    routePrefix: row.routePrefix ?? undefined,
    fields: [...row.fields]
      .sort((a, b) => a.position - b.position)
      .map((f) => ({ ...(f.config as object), key: f.key, label: f.label, type: f.type, required: f.required }) as CollectionDefinition['fields'][number]),
    items: [...row.items]
      .filter((i) => !opts.publishedOnly || i.status === 'published')
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, slug: i.slug, status: i.status as 'draft' | 'published' | 'archived', data: i.data as Record<string, unknown>, position: i.position, translations: (i.translations ?? undefined) as Record<string, Record<string, unknown>> | undefined })),
  };
}

export function collectionFieldRows(c: CollectionDefinition) {
  return c.fields.map((f, position) => {
    const { key, label, type, required, ...config } = f;
    return { key, label, type, required, position, config: json(config) };
  });
}
