import type { Prisma, PrismaClient } from '@atrium/db';
import {
  SCHEMA_VERSION, WebsiteDefinitionSchema, type CollectionDefinition, type FormDefinition, type Node, type PageDocument,
  type Redirect, type SiteSettings, type ThemeTokens, type WebsiteDefinition,
} from '@atrium/schema';
import {
  collectionFieldRows, collectionFromRow, formChildRows, formFromRow, json, pageFromRow, pageToRow, same,
} from './mapping';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface DraftRevisions {
  site: number;
  theme: number;
  pages: Record<string, number>;
}

export interface LoadedDraft {
  definition: WebsiteDefinition;
  revisions: DraftRevisions;
}

export class SiteStoreError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' = 'VALIDATION') {
    super(message);
  }
}

const includeForms = { fields: true, rules: true } as const;
const includeCollections = { fields: true, items: true } as const;

/** Assemble the editable draft WebsiteDefinition from relational storage. */
export async function loadDraft(db: Db, websiteId: string): Promise<LoadedDraft> {
  const site = await db.website.findFirst({
    where: { id: websiteId, deletedAt: null },
    include: {
      settings: true,
      theme: true,
      pages: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
      globalSections: { orderBy: { createdAt: 'asc' } },
      forms: { where: { archivedAt: null }, include: includeForms, orderBy: { createdAt: 'asc' } },
      collections: { include: includeCollections, orderBy: { createdAt: 'asc' } },
      redirects: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!site) throw new SiteStoreError('Website not found', 'NOT_FOUND');
  if (!site.settings || !site.theme) throw new SiteStoreError('Website draft is incomplete (missing settings or theme)', 'NOT_FOUND');

  const definition: WebsiteDefinition = {
    schemaVersion: SCHEMA_VERSION,
    settings: site.settings.settings as unknown as SiteSettings,
    theme: site.theme.tokens as unknown as ThemeTokens,
    navigation: site.settings.navigation as unknown as WebsiteDefinition['navigation'],
    header: site.settings.header as unknown as Node,
    footer: site.settings.footer as unknown as Node,
    globalSections: site.globalSections.map((g) => ({ id: g.id, name: g.name, node: g.node as unknown as Node })),
    pages: site.pages.map((p) => pageFromRow(p)),
    forms: site.forms.map((f) => formFromRow(f)),
    collections: site.collections.map((c) => collectionFromRow(c)),
    redirects: site.redirects.map((r) => ({ id: r.id, source: r.source, destination: r.destination, statusCode: r.statusCode as Redirect['statusCode'], enabled: r.enabled })),
    customCss: site.settings.customCss ?? undefined,
  };
  return {
    definition,
    revisions: { site: site.settings.revision, theme: site.theme.revision, pages: Object.fromEntries(site.pages.map((p) => [p.id, p.revision])) },
  };
}

export interface PersistMeta {
  userId?: string | null;
  /** When set, a PageVersion snapshot of the BEFORE state is stored for every changed page. */
  versionSource?: 'MANUAL' | 'AUTOSAVE' | 'AI' | 'RESTORE' | 'IMPORT';
  versionMessage?: string;
  aiGenerationId?: string;
}

export interface PersistResult {
  revisions: DraftRevisions;
  /** pageId -> PageVersion id holding the pre-change document (for rollback). */
  pageVersions: Record<string, string>;
  createdPages: string[];
  deletedPages: string[];
  changed: { site: boolean; theme: boolean; pages: string[]; forms: string[]; collections: string[]; redirects: boolean; globalSections: string[] };
}

async function nextPageVersionNumber(db: Db, pageId: string) {
  const last = await db.pageVersion.findFirst({ where: { pageId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

/**
 * Persist the difference between two definitions. Only changed rows are
 * written; revisions are bumped for changed units. Run inside a transaction.
 */
export async function persistDraft(db: Db, websiteId: string, before: WebsiteDefinition, after: WebsiteDefinition, meta: PersistMeta = {}): Promise<PersistResult> {
  WebsiteDefinitionSchema.parse(after);
  const result: PersistResult = {
    revisions: { site: 0, theme: 0, pages: {} },
    pageVersions: {},
    createdPages: [],
    deletedPages: [],
    changed: { site: false, theme: false, pages: [], forms: [], collections: [], redirects: false, globalSections: [] },
  };

  // ── site-level ──
  const siteChanged = !same(before.settings, after.settings) || !same(before.navigation, after.navigation) || !same(before.header, after.header) || !same(before.footer, after.footer) || (before.customCss ?? '') !== (after.customCss ?? '');
  if (siteChanged) {
    result.changed.site = true;
    await db.websiteSettings.update({
      where: { websiteId },
      data: { settings: json(after.settings), navigation: json(after.navigation), header: json(after.header), footer: json(after.footer), customCss: after.customCss ?? null, revision: { increment: 1 } },
    });
    if (before.settings.name !== after.settings.name) await db.website.update({ where: { id: websiteId }, data: { name: after.settings.name, updatedById: meta.userId ?? undefined } });
  }
  if (!same(before.theme, after.theme)) {
    result.changed.theme = true;
    await db.theme.update({ where: { websiteId }, data: { tokens: json(after.theme), revision: { increment: 1 } } });
  }

  // ── pages ──
  const beforePages = new Map(before.pages.map((p) => [p.id, p]));
  const afterIds = new Set(after.pages.map((p) => p.id));
  for (const p of before.pages) {
    if (!afterIds.has(p.id)) {
      await db.page.delete({ where: { id: p.id } });
      result.deletedPages.push(p.id);
    }
  }
  // free slugs that are being reassigned to avoid unique conflicts mid-update
  for (const p of after.pages) {
    const prev = beforePages.get(p.id);
    if (prev && prev.slug !== p.slug) await db.page.update({ where: { id: p.id }, data: { slug: `__tmp__${p.id}` } });
  }
  for (const [position, p] of after.pages.entries()) {
    const prev = beforePages.get(p.id);
    const row = pageToRow(p);
    if (!prev) {
      await db.page.create({ data: { id: p.id, websiteId, position, ...row, createdById: meta.userId ?? null, updatedById: meta.userId ?? null } });
      result.createdPages.push(p.id);
      continue;
    }
    const prevPosition = before.pages.findIndex((x) => x.id === p.id);
    if (same(prev, p)) {
      if (prevPosition !== position) await db.page.update({ where: { id: p.id }, data: { position } });
      continue;
    }
    if (meta.versionSource) {
      const prevRow = pageToRow(prev);
      const v = await db.pageVersion.create({
        data: {
          pageId: p.id, number: await nextPageVersionNumber(db, p.id), document: prevRow.document, title: prev.title, slug: prev.slug,
          source: meta.versionSource, message: meta.versionMessage, aiGenerationId: meta.aiGenerationId, createdById: meta.userId ?? null,
        },
      });
      result.pageVersions[p.id] = v.id;
    }
    await db.page.update({ where: { id: p.id }, data: { ...row, position, revision: { increment: 1 }, updatedById: meta.userId ?? null } });
    result.changed.pages.push(p.id);
  }

  // ── global sections ──
  const bGlobals = new Map(before.globalSections.map((g) => [g.id, g]));
  const aGlobalIds = new Set(after.globalSections.map((g) => g.id));
  for (const g of before.globalSections) if (!aGlobalIds.has(g.id)) await db.globalSection.delete({ where: { id: g.id } });
  for (const g of after.globalSections) {
    const prev = bGlobals.get(g.id);
    if (!prev) await db.globalSection.create({ data: { id: g.id, websiteId, name: g.name, node: json(g.node) } });
    else if (!same(prev, g)) await db.globalSection.update({ where: { id: g.id }, data: { name: g.name, node: json(g.node) } });
    else continue;
    result.changed.globalSections.push(g.id);
  }

  // ── forms ──
  const bForms = new Map(before.forms.map((f) => [f.id, f]));
  const aFormIds = new Set(after.forms.map((f) => f.id));
  for (const f of before.forms) if (!aFormIds.has(f.id)) await db.form.update({ where: { id: f.id }, data: { archivedAt: new Date() } });
  for (const f of after.forms) {
    const prev = bForms.get(f.id);
    if (prev && same(prev, f)) continue;
    await upsertForm(db, websiteId, f, !prev);
    result.changed.forms.push(f.id);
  }

  // ── collections ──
  const bCols = new Map(before.collections.map((c) => [c.id, c]));
  const aColIds = new Set(after.collections.map((c) => c.id));
  for (const c of before.collections) if (!aColIds.has(c.id)) await db.collection.delete({ where: { id: c.id } });
  for (const c of after.collections) {
    const prev = bCols.get(c.id);
    if (prev && same(prev, c)) continue;
    await upsertCollection(db, websiteId, c, prev);
    result.changed.collections.push(c.id);
  }

  // ── redirects ──
  if (!same(before.redirects, after.redirects)) {
    result.changed.redirects = true;
    await db.redirect.deleteMany({ where: { websiteId } });
    if (after.redirects.length) await db.redirect.createMany({ data: after.redirects.map((r) => ({ id: r.id, websiteId, source: r.source, destination: r.destination, statusCode: r.statusCode, enabled: r.enabled })) });
  }

  if (meta.userId) await db.website.update({ where: { id: websiteId }, data: { updatedById: meta.userId } });

  const fresh = await loadRevisions(db, websiteId);
  result.revisions = fresh;
  return result;
}

export async function loadRevisions(db: Db, websiteId: string): Promise<DraftRevisions> {
  const [settings, theme, pages] = await Promise.all([
    db.websiteSettings.findUnique({ where: { websiteId }, select: { revision: true } }),
    db.theme.findUnique({ where: { websiteId }, select: { revision: true } }),
    db.page.findMany({ where: { websiteId }, select: { id: true, revision: true } }),
  ]);
  return { site: settings?.revision ?? 0, theme: theme?.revision ?? 0, pages: Object.fromEntries(pages.map((p) => [p.id, p.revision])) };
}

export async function upsertForm(db: Db, websiteId: string, f: FormDefinition, isNew: boolean): Promise<void> {
  const { fields, rules } = formChildRows(f);
  if (isNew) {
    const existing = await db.form.findUnique({ where: { id: f.id } });
    if (existing) {
      await db.form.update({ where: { id: f.id }, data: { name: f.name, slug: f.slug, settings: json(f.settings), archivedAt: null, revision: { increment: 1 } } });
    } else {
      await db.form.create({ data: { id: f.id, websiteId, name: f.name, slug: f.slug, settings: json(f.settings) } });
    }
  } else {
    await db.form.update({ where: { id: f.id }, data: { name: f.name, slug: f.slug, settings: json(f.settings), revision: { increment: 1 } } });
  }
  await db.formField.deleteMany({ where: { formId: f.id } });
  await db.formRule.deleteMany({ where: { formId: f.id } });
  if (fields.length) await db.formField.createMany({ data: fields.map((x) => ({ ...x, formId: f.id })) });
  if (rules.length) await db.formRule.createMany({ data: rules.map((x) => ({ ...x, formId: f.id })) });
}

export async function upsertCollection(db: Db, websiteId: string, c: CollectionDefinition, prev?: CollectionDefinition): Promise<void> {
  const data = { slug: c.slug, name: c.name, singularName: c.singularName ?? null, description: c.description ?? null, titleField: c.titleField, routePrefix: c.routePrefix ?? null };
  if (!prev) await db.collection.create({ data: { id: c.id, websiteId, ...data } });
  else await db.collection.update({ where: { id: c.id }, data });
  if (!prev || !same(prev.fields, c.fields)) {
    await db.collectionField.deleteMany({ where: { collectionId: c.id } });
    const rows = collectionFieldRows(c);
    if (rows.length) await db.collectionField.createMany({ data: rows.map((r) => ({ ...r, collectionId: c.id })) });
  }
  const prevItems = new Map((prev?.items ?? []).map((i) => [i.id, i]));
  const nextIds = new Set(c.items.map((i) => i.id));
  const removed = [...prevItems.keys()].filter((id) => !nextIds.has(id));
  if (removed.length) await db.collectionItem.deleteMany({ where: { id: { in: removed } } });
  for (const [position, item] of c.items.entries()) {
    const p = prevItems.get(item.id);
    if (p && same(p, item) && p.position === position) continue;
    const row = { slug: item.slug, status: item.status, data: json(item.data), translations: item.translations ? json(item.translations) : undefined, position, publishedAt: item.status === 'published' ? new Date() : null };
    await db.collectionItem.upsert({ where: { id: item.id }, create: { id: item.id, collectionId: c.id, ...row }, update: row });
  }
}

export interface CreateWebsiteInput {
  organizationId: string;
  workspaceId?: string | null;
  name: string;
  slug: string;
  definition: WebsiteDefinition;
  userId?: string | null;
  presetKey?: string;
}

/** Create a website with its full draft in one transaction-friendly sequence. */
export async function createWebsiteFromDefinition(db: Db, input: CreateWebsiteInput) {
  const def = WebsiteDefinitionSchema.parse({ ...input.definition, settings: { ...input.definition.settings, name: input.name } });
  const website = await db.website.create({
    data: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      name: input.name,
      slug: input.slug,
      defaultLocale: def.settings.localization.defaultLocale,
      createdById: input.userId ?? null,
      updatedById: input.userId ?? null,
      settings: { create: { settings: json(def.settings), navigation: json(def.navigation), header: json(def.header), footer: json(def.footer), customCss: def.customCss ?? null } },
      theme: { create: { tokens: json(def.theme), presetKey: input.presetKey ?? null } },
    },
  });
  const empty: WebsiteDefinition = { ...def, pages: [], forms: [], collections: [], redirects: [], globalSections: [] };
  await persistDraft(db, website.id, empty, def, { userId: input.userId });
  return website;
}

/**
 * Freeze the publishable part of a draft: drops archived and future-scheduled
 * pages and unpublished CMS items. The result is stored immutably.
 */
export function toPublishedDefinition(def: WebsiteDefinition, now = new Date()): WebsiteDefinition {
  const pages = def.pages
    .filter((p) => p.status !== 'archived' && !(p.status === 'scheduled' && p.publishAt && new Date(p.publishAt) > now))
    .map((p) => ({ ...p, status: 'published' as const }));
  return WebsiteDefinitionSchema.parse({
    ...def,
    pages,
    collections: def.collections.map((c) => ({ ...c, items: c.items.filter((i) => i.status === 'published') })),
    redirects: def.redirects.filter((r) => r.enabled),
  });
}

export function pageDocumentFor(def: WebsiteDefinition, pageId: string): PageDocument | undefined {
  return def.pages.find((p) => p.id === pageId);
}
