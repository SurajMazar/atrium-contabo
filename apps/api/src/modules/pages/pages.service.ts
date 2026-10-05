import { Injectable } from '@nestjs/common';
import { analyzePageSeo, cloneWithNewIds, normalizePage } from '@atrium/builder-core';
import { PageDocumentSchema, slugify, type NodeInput, type PageDocument, type PageInput } from '@atrium/schema';
import { pageFromRow, pageToRow } from '@atrium/site-store';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, conflict, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { sanitizeNodes } from '../../common/sanitize';
import { TemplatesService } from '../templates/templates.service';
import { DraftService } from '../websites/draft.service';

const LOCK_MS = 2 * 60_000;

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService, private readonly drafts: DraftService, private readonly templates: TemplatesService, private readonly audit: AuditService) {}

  private get db() {
    return this.prisma.client;
  }

  summary(p: { id: string; title: string; slug: string; kind: string; status: string; isHomepage: boolean; position: number; revision: number; updatedAt: Date; publishedAt: Date | null; updatedById: string | null }, names: Map<string, string> = new Map()) {
    return { id: p.id, title: p.title, slug: p.slug, kind: p.kind, status: p.status, isHomepage: p.isHomepage, position: p.position, revision: p.revision, updatedAt: p.updatedAt.toISOString(), updatedBy: p.updatedById ? (names.get(p.updatedById) ?? null) : null, publishedAt: p.publishedAt?.toISOString() ?? null };
  }

  async list(websiteId: string) {
    const rows = await this.db.page.findMany({ where: { websiteId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const ids = [...new Set(rows.map((r) => r.updatedById).filter(Boolean))] as string[];
    const users = ids.length ? await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => this.summary(r, names));
  }

  async get(pageId: string) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    return { ...this.summary(row), document: pageFromRow(row) };
  }

  async create(websiteId: string, body: { title: string; slug: string; kind?: 'page' | 'collection-template' | 'not-found'; templateId?: string; sections?: NodeInput[]; collection?: string }, user: AuthUser, orgIds: string[]) {
    let sections: NodeInput[] = body.sections ?? [];
    let seo: PageInput['seo'];
    if (body.templateId) {
      const t = await this.templates.get(body.templateId, orgIds);
      const data = t.data as Partial<PageInput> | undefined;
      if (t.kind !== 'PAGE' || !data) throw badRequest('Not a page template');
      sections = (data.sections ?? []) as NodeInput[];
      seo = data.seo;
    }
    let created = '';
    const res = await this.drafts.transform(
      websiteId,
      (d) => {
        const slug = slugify(body.slug || body.title);
        if (!slug) throw validation('Slug is required');
        if (d.pages.some((p) => p.slug === slug)) throw conflict(`A page already exists at /${slug}`);
        const { value } = normalizePage({ title: body.title, slug, kind: body.kind ?? 'page', collection: body.collection, status: 'draft', seo: seo ?? { title: body.title }, sections }, this.drafts.registry);
        d.pages.push(value);
        created = value.id;
      },
      { userId: user.id },
    );
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId }, select: { organizationId: true } });
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'page.created', resourceType: 'page', resourceId: created, summary: `${user.name} created page ${body.title}` });
    void res;
    return this.get(created);
  }

  /**
   * Autosave. `revision` must match the stored revision (optimistic locking);
   * meta columns are kept in sync with the document.
   */
  async update(pageId: string, body: { document?: PageDocument; title?: string; slug?: string; status?: PageDocument['status']; publishAt?: string | null; revision: number }, user: AuthUser) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    if (row.revision !== body.revision) throw conflict('This page was changed by someone else', { current: row.revision, updatedAt: row.updatedAt.toISOString() });
    if (row.lockedById && row.lockedById !== user.id && row.lockedUntil && row.lockedUntil > new Date()) {
      const by = await this.db.user.findUnique({ where: { id: row.lockedById }, select: { name: true } });
      throw conflict(`${by?.name ?? 'Someone'} is editing this page`, { lockedBy: by?.name, lockedUntil: row.lockedUntil.toISOString() });
    }
    const current = pageFromRow(row);
    let next: PageDocument = body.document ? { ...body.document, id: pageId } : current;
    if (body.title !== undefined) next = { ...next, title: body.title };
    if (body.status !== undefined) next = { ...next, status: body.status };
    if (body.publishAt !== undefined) next = { ...next, publishAt: body.publishAt ?? undefined };
    if (body.slug !== undefined && !row.isHomepage) next = { ...next, slug: slugify(body.slug) };
    if (row.isHomepage) next = { ...next, slug: '', isHomepage: true };
    else next = { ...next, isHomepage: false };
    if (next.status === 'scheduled' && !next.publishAt) throw validation('Choose a publish date for scheduled pages');

    const parsed = PageDocumentSchema.safeParse(next);
    if (!parsed.success) throw validation('Invalid page document', parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })));
    sanitizeNodes(parsed.data.sections);
    const issues = this.drafts.registry.validate(parsed.data.sections).filter((i) => i.severity === 'error');
    if (issues.length) throw validation('Page contains invalid components', issues.slice(0, 20));
    if (next.slug !== row.slug && (await this.db.page.findFirst({ where: { websiteId: row.websiteId, slug: next.slug, id: { not: pageId } } }))) throw conflict(`A page already exists at /${next.slug}`);

    const data = pageToRow(parsed.data);
    const updated = await this.db.page.updateMany({ where: { id: pageId, revision: body.revision }, data: { ...data, revision: { increment: 1 }, updatedById: user.id } });
    if (updated.count === 0) throw conflict('This page was changed by someone else');
    const fresh = await this.db.page.findUniqueOrThrow({ where: { id: pageId }, select: { revision: true, updatedAt: true } });
    await this.maybeAutosaveVersion(pageId, current, user.id);
    return { revision: fresh.revision, updatedAt: fresh.updatedAt.toISOString() };
  }

  /** Keep a rolling AUTOSAVE checkpoint at most every 10 minutes. */
  private async maybeAutosaveVersion(pageId: string, previous: PageDocument, userId: string) {
    const last = await this.db.pageVersion.findFirst({ where: { pageId }, orderBy: { number: 'desc' } });
    if (last && Date.now() - last.createdAt.getTime() < 10 * 60_000) return;
    await this.db.pageVersion.create({ data: { pageId, number: (last?.number ?? 0) + 1, document: pageToRow(previous).document, title: previous.title, slug: previous.slug, source: 'AUTOSAVE', createdById: userId } });
  }

  async remove(pageId: string, user: AuthUser) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId }, include: { website: { select: { organizationId: true } } } });
    if (row.isHomepage) throw badRequest('Set another page as homepage before deleting this one');
    await this.db.page.delete({ where: { id: pageId } });
    await this.audit.log({ organizationId: row.website.organizationId, websiteId: row.websiteId, actor: user, action: 'page.deleted', resourceType: 'page', resourceId: pageId, summary: `${user.name} deleted page ${row.title}` });
  }

  async duplicate(pageId: string, body: { title?: string; slug?: string }, user: AuthUser) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    let created = '';
    await this.drafts.transform(
      row.websiteId,
      (d) => {
        const src = d.pages.find((p) => p.id === pageId)!;
        const base = slugify(body.slug ?? `${src.slug || 'home'}-copy`);
        let slug = base;
        for (let i = 2; d.pages.some((p) => p.slug === slug); i++) slug = `${base}-${i}`;
        const copy: PageDocument = JSON.parse(JSON.stringify(src));
        const { value } = normalizePage({ ...copy, id: undefined, title: body.title ?? `${src.title} (copy)`, slug, isHomepage: false, status: 'draft', sections: copy.sections.map(cloneWithNewIds) }, this.drafts.registry);
        const at = d.pages.findIndex((p) => p.id === pageId) + 1;
        d.pages.splice(at, 0, value);
        created = value.id;
      },
      { userId: user.id },
    );
    return this.get(created);
  }

  async setHomepage(pageId: string, user: AuthUser) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    await this.drafts.transform(
      row.websiteId,
      (d) => {
        const prev = d.pages.find((p) => p.isHomepage);
        const page = d.pages.find((p) => p.id === pageId)!;
        if (prev && prev.id !== pageId) {
          prev.isHomepage = false;
          let slug = slugify(prev.title) || 'home';
          for (let i = 2; d.pages.some((p) => p.slug === slug && p.id !== prev.id); i++) slug = `${slugify(prev.title)}-${i}`;
          prev.slug = slug;
        }
        page.isHomepage = true;
        page.slug = '';
      },
      { userId: user.id },
    );
  }

  async versions(pageId: string) {
    const rows = await this.db.pageVersion.findMany({ where: { pageId }, orderBy: { number: 'desc' }, take: 100 });
    const ids = [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[];
    const users = new Map((await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map((v) => ({ id: v.id, number: v.number, title: v.title, message: v.message, source: v.source, createdAt: v.createdAt.toISOString(), createdBy: v.createdById ? (users.get(v.createdById) ?? null) : null }));
  }

  async createVersion(pageId: string, message: string, user: AuthUser) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    const last = await this.db.pageVersion.findFirst({ where: { pageId }, orderBy: { number: 'desc' } });
    const v = await this.db.pageVersion.create({ data: { pageId, number: (last?.number ?? 0) + 1, document: row.document as object, title: row.title, slug: row.slug, message, source: 'MANUAL', createdById: user.id } });
    return { id: v.id, number: v.number, title: v.title, message: v.message, source: v.source, createdAt: v.createdAt.toISOString(), createdBy: user.name };
  }

  async restoreVersion(pageId: string, versionId: string, user: AuthUser) {
    const v = await this.db.pageVersion.findFirst({ where: { id: versionId, pageId } });
    if (!v) throw notFound('Version');
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    await this.drafts.transform(
      row.websiteId,
      (d) => {
        const idx = d.pages.findIndex((p) => p.id === pageId);
        const restored = v.document as unknown as PageDocument;
        const current = d.pages[idx]!;
        d.pages[idx] = { ...restored, id: pageId, isHomepage: current.isHomepage, slug: current.isHomepage ? '' : (d.pages.some((p) => p.id !== pageId && p.slug === restored.slug) ? current.slug : restored.slug) };
      },
      { userId: user.id, versionSource: 'RESTORE', versionMessage: `Before restoring v${v.number}` },
    );
    return this.get(pageId);
  }

  async lock(pageId: string, user: AuthUser) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    if (row.lockedById && row.lockedById !== user.id && row.lockedUntil && row.lockedUntil > new Date()) {
      const by = await this.db.user.findUnique({ where: { id: row.lockedById }, select: { name: true } });
      throw conflict(`${by?.name ?? 'Someone'} is editing this page`, { lockedBy: by?.name, lockedUntil: row.lockedUntil.toISOString() });
    }
    const lockedUntil = new Date(Date.now() + LOCK_MS);
    await this.db.page.update({ where: { id: pageId }, data: { lockedById: user.id, lockedUntil } });
    return { lockedById: user.id, lockedUntil: lockedUntil.toISOString() };
  }

  async unlock(pageId: string, user: AuthUser) {
    await this.db.page.updateMany({ where: { id: pageId, lockedById: user.id }, data: { lockedById: null, lockedUntil: null } });
  }

  async seo(pageId: string) {
    const row = await this.db.page.findUniqueOrThrow({ where: { id: pageId } });
    const { definition } = await this.drafts.load(row.websiteId);
    const page = definition.pages.find((p) => p.id === pageId)!;
    return analyzePageSeo(page, definition);
  }
}
