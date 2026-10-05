import { Injectable } from '@nestjs/common';
import { FormDefinitionSchema, createId, slugify, type FormDefinition } from '@atrium/schema';
import { formFromRow, upsertForm } from '@atrium/site-store';
import ExcelJS from 'exceljs';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { conflict, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { ResolverService } from '../providers/resolver.service';

const STATUS = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'SPAM', 'ARCHIVED'] as const;
type Status = (typeof STATUS)[number];

export interface SubmissionQuery {
  formId?: string;
  status?: string;
  search?: string;
  tag?: string;
  unread?: string;
  assignedTo?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly resolver: ResolverService) {}

  private get db() {
    return this.prisma.client;
  }

  private assertPatterns(form: FormDefinition) {
    for (const f of form.fields) {
      if (f.validation?.pattern) {
        try {
          new RegExp(f.validation.pattern);
        } catch {
          throw validation(`Field "${f.label}" has an invalid pattern`);
        }
      }
    }
    const names = form.fields.map((f) => f.name);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) throw validation(`Two fields use the name "${dup}"`);
  }

  async list(websiteId: string) {
    const rows = await this.db.form.findMany({ where: { websiteId, archivedAt: null }, include: { fields: true, rules: true, _count: { select: { submissions: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({ ...formFromRow(r), revision: r.revision, submissionCount: r._count.submissions, updatedAt: r.updatedAt.toISOString() }));
  }

  async get(formId: string) {
    const r = await this.db.form.findUniqueOrThrow({ where: { id: formId }, include: { fields: true, rules: true, _count: { select: { submissions: true } } } });
    return { ...formFromRow(r), revision: r.revision, submissionCount: r._count.submissions, updatedAt: r.updatedAt.toISOString() };
  }

  async create(websiteId: string, body: unknown, user: AuthUser) {
    const raw = body as Partial<FormDefinition>;
    const parsed = FormDefinitionSchema.safeParse({ ...raw, id: raw.id ?? createId('form'), slug: raw.slug ?? slugify(raw.name ?? 'form'), fields: (raw.fields ?? []).map((f) => ({ ...f, id: f.id || createId() })), rules: (raw.rules ?? []).map((r) => ({ ...r, id: r.id || createId() })) });
    if (!parsed.success) throw validation('Invalid form', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    this.assertPatterns(parsed.data);
    if (await this.db.form.findFirst({ where: { websiteId, slug: parsed.data.slug, archivedAt: null } })) throw conflict(`A form with slug "${parsed.data.slug}" exists`);
    await upsertForm(this.db, websiteId, parsed.data, true);
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId }, select: { organizationId: true } });
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'form.created', resourceType: 'form', resourceId: parsed.data.id, summary: `${user.name} created form ${parsed.data.name}` });
    return this.get(parsed.data.id);
  }

  async save(formId: string, body: unknown, user: AuthUser) {
    const current = await this.db.form.findUniqueOrThrow({ where: { id: formId } });
    const raw = body as Partial<FormDefinition> & { revision?: number };
    if (raw.revision !== undefined && raw.revision !== current.revision) throw conflict('This form was changed by someone else', { current: current.revision });
    const parsed = FormDefinitionSchema.safeParse({ ...raw, id: formId, fields: (raw.fields ?? []).map((f) => ({ ...f, id: f.id || createId() })), rules: (raw.rules ?? []).map((r) => ({ ...r, id: r.id || createId() })) });
    if (!parsed.success) throw validation('Invalid form', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    this.assertPatterns(parsed.data);
    if (await this.db.form.findFirst({ where: { websiteId: current.websiteId, slug: parsed.data.slug, archivedAt: null, id: { not: formId } } })) throw conflict(`A form with slug "${parsed.data.slug}" exists`);
    await this.db.$transaction((tx) => upsertForm(tx, current.websiteId, parsed.data, false));
    const site = await this.db.website.findUniqueOrThrow({ where: { id: current.websiteId }, select: { organizationId: true } });
    await this.audit.log({ organizationId: site.organizationId, websiteId: current.websiteId, actor: user, action: 'form.updated', resourceType: 'form', resourceId: formId, summary: `${user.name} updated form ${parsed.data.name}` });
    return this.get(formId);
  }

  async archive(formId: string, user: AuthUser) {
    const f = await this.db.form.update({ where: { id: formId }, data: { archivedAt: new Date(), slug: `archived-${formId}` }, include: { website: { select: { organizationId: true } } } });
    await this.audit.log({ organizationId: f.website.organizationId, websiteId: f.websiteId, actor: user, action: 'form.deleted', resourceType: 'form', resourceId: formId, summary: `${user.name} deleted form ${f.name}` });
  }

  // ── submissions ──
  private where(websiteId: string, q: Partial<SubmissionQuery>) {
    const where: Record<string, unknown> = { websiteId };
    if (q.formId) where.formId = q.formId;
    if (q.status) where.status = q.status.toUpperCase();
    else where.status = { notIn: ['SPAM', 'ARCHIVED'] };
    if (q.status === 'all') delete where.status;
    if (q.tag) where.tags = { has: q.tag };
    if (q.unread === 'true') where.read = false;
    if (q.assignedTo === 'unassigned') where.assignedToId = null;
    else if (q.assignedTo) where.assignedToId = q.assignedTo;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
    if (q.search) where.values = { some: { value: { contains: q.search, mode: 'insensitive' } } };
    return where;
  }

  private async assignees(ids: Array<string | null>) {
    const list = [...new Set(ids.filter(Boolean))] as string[];
    if (!list.length) return new Map<string, { id: string; name: string }>();
    return new Map((await this.db.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } })).map((u) => [u.id, u]));
  }

  async submissions(websiteId: string, q: SubmissionQuery) {
    const rows = await this.db.formSubmission.findMany({
      where: this.where(websiteId, q) as never,
      include: { form: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const users = await this.assignees(rows.map((r) => r.assignedToId));
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((s) => ({ id: s.id, formId: s.formId, formName: s.form.name, status: s.status, read: s.read, tags: s.tags, assignedTo: s.assignedToId ? (users.get(s.assignedToId) ?? null) : null, summary: s.summary, spamScore: s.spamScore, createdAt: s.createdAt.toISOString() }));
    const total = await this.db.formSubmission.count({ where: this.where(websiteId, q) as never });
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, total };
  }

  /**
   * File values hold server-generated private keys. The admin gets short-lived signed download
   * links built from those keys only (never a URL supplied by the visitor).
   */
  private async withFileLinks(websiteId: string, organizationId: string, values: Array<{ fieldName: string; fieldLabel: string; fieldType: string; value: unknown }>) {
    if (!values.some((v) => v.fieldType === 'file')) return values;
    const storage = await this.resolver.resolver.storage({ organizationId }).catch(() => null);
    const prefix = `private/submissions/${websiteId}/`;
    return Promise.all(values.map(async (v) => {
      if (v.fieldType !== 'file' || !Array.isArray(v.value)) return v;
      const files = await Promise.all((v.value as Array<Record<string, unknown>>).map(async (f) => {
        const key = typeof f.key === 'string' && f.key.startsWith(prefix) && !f.key.includes('..') ? f.key : null;
        const filename = String(f.filename ?? 'file').slice(0, 200);
        const url = key && storage ? await storage.getSignedUrl(key, { expiresInSeconds: 600, disposition: `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"` }).catch(() => null) : null;
        return { filename, size: typeof f.size === 'number' ? f.size : undefined, mimeType: typeof f.mimeType === 'string' ? f.mimeType : undefined, url };
      }));
      return { ...v, value: files };
    }));
  }

  async submission(id: string) {
    const s = await this.db.formSubmission.findUniqueOrThrow({ where: { id }, include: { form: { select: { name: true } }, values: true, notes: { orderBy: { createdAt: 'asc' } }, website: { select: { organizationId: true } } } });
    const users = await this.assignees([s.assignedToId, ...s.notes.map((n) => n.authorId)]);
    return {
      id: s.id, formId: s.formId, formName: s.form.name, status: s.status, read: s.read, tags: s.tags, assignedTo: s.assignedToId ? (users.get(s.assignedToId) ?? null) : null,
      summary: s.summary, spamScore: s.spamScore, createdAt: s.createdAt.toISOString(), pageUrl: s.pageUrl, referrer: s.referrer, userAgent: s.userAgent,
      values: await this.withFileLinks(s.websiteId, s.website.organizationId, s.values.map((v) => ({ fieldName: v.fieldName, fieldLabel: v.fieldLabel, fieldType: v.fieldType, value: v.valueJson ?? v.value }))),
      notes: s.notes.map((n) => ({ id: n.id, body: n.body, author: users.get(n.authorId) ?? { id: n.authorId, name: 'Unknown' }, createdAt: n.createdAt.toISOString() })),
      actionsLog: s.actionsLog,
    };
  }

  async updateSubmission(id: string, body: { status?: Status; read?: boolean; tags?: string[]; assignedToId?: string | null }, user: AuthUser) {
    const s = await this.db.formSubmission.findUniqueOrThrow({ where: { id }, include: { website: { select: { organizationId: true } } } });
    if (body.assignedToId) {
      const member = await this.db.organizationMember.findFirst({ where: { organizationId: s.website.organizationId, userId: body.assignedToId } });
      if (!member) throw validation('Assignee must be a member of this organization');
    }
    await this.db.formSubmission.update({ where: { id }, data: body });
    if (body.status && body.status !== s.status) await this.audit.log({ organizationId: s.website.organizationId, websiteId: s.websiteId, actor: user, action: 'submission.status_changed', resourceType: 'submission', resourceId: id, summary: `${user.name} marked a submission ${body.status.toLowerCase()}` });
    return this.submission(id);
  }

  async addNote(id: string, body: string, user: AuthUser) {
    const n = await this.db.submissionNote.create({ data: { submissionId: id, authorId: user.id, body } });
    return { id: n.id, body: n.body, author: { id: user.id, name: user.name }, createdAt: n.createdAt.toISOString() };
  }

  async deleteSubmission(id: string) {
    await this.db.formSubmission.delete({ where: { id } });
  }

  async bulk(websiteId: string, body: { ids: string[]; action: string; value?: unknown }) {
    const where = { id: { in: body.ids }, websiteId };
    let res: { count: number };
    switch (body.action) {
      case 'markRead': res = await this.db.formSubmission.updateMany({ where, data: { read: true } }); break;
      case 'markUnread': res = await this.db.formSubmission.updateMany({ where, data: { read: false } }); break;
      case 'archive': res = await this.db.formSubmission.updateMany({ where, data: { status: 'ARCHIVED' } }); break;
      case 'status': {
        const st = String(body.value).toUpperCase();
        if (!STATUS.includes(st as Status)) throw validation('Unknown status');
        res = await this.db.formSubmission.updateMany({ where, data: { status: st as Status } });
        break;
      }
      case 'tag': {
        const tag = String(body.value ?? '').trim();
        if (!tag) throw validation('Tag is required');
        const rows = await this.db.formSubmission.findMany({ where, select: { id: true, tags: true } });
        await this.db.$transaction(rows.map((r) => this.db.formSubmission.update({ where: { id: r.id }, data: { tags: [...new Set([...r.tags, tag])] } })));
        res = { count: rows.length };
        break;
      }
      case 'delete': res = await this.db.formSubmission.deleteMany({ where }); break;
      default: throw validation('Unknown action');
    }
    return { updated: res.count };
  }

  /** CSV / Excel export of submissions (all field columns across forms). */
  async export(websiteId: string, q: { format: 'csv' | 'xlsx'; formId?: string; status?: string }) {
    const rows = await this.db.formSubmission.findMany({ where: this.where(websiteId, { ...q, status: q.status ?? 'all' }) as never, include: { values: true, form: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50_000 });
    const columns = new Map<string, string>();
    rows.forEach((r) => r.values.forEach((v) => columns.set(v.fieldName, v.fieldLabel)));
    const header = ['Submitted at', 'Form', 'Status', 'Tags', ...[...columns.values()]];
    const data = rows.map((r) => {
      const byName = new Map(r.values.map((v) => [v.fieldName, v.valueJson ? (Array.isArray(v.valueJson) ? (v.valueJson as unknown[]).join('; ') : JSON.stringify(v.valueJson)) : (v.value ?? '')]));
      return [r.createdAt.toISOString(), r.form.name, r.status, r.tags.join('; '), ...[...columns.keys()].map((k) => byName.get(k) ?? '')];
    });
    if (q.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Submissions');
      ws.addRow(header).font = { bold: true };
      // Cells are written as plain strings (never formulas); still neutralize for users who re-save as CSV.
      data.forEach((d) => ws.addRow(d.map((c) => neutralizeFormula(String(c ?? '')))));
      ws.columns.forEach((c) => (c.width = 22));
      return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    }
    const esc = (v: unknown) => csvCell(v);
    const csv = [header, ...data].map((r) => r.map(esc).join(',')).join('\n');
    return { buffer: Buffer.from(`﻿${csv}`), contentType: 'text/csv; charset=utf-8', ext: 'csv' };
  }

  notFoundIfMissing(x: unknown) {
    if (!x) throw notFound('Form');
  }
}

/** Spreadsheet formula injection: values starting with = + - @ (after optional whitespace) or tab/CR are prefixed with '. */
export function neutralizeFormula(s: string): string {
  return /^[\s\u00a0\u3000]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(s) || /^[\t\r]/.test(s) ? `'${s}` : s;
}

export function csvCell(v: unknown): string {
  const safe = neutralizeFormula(String(v ?? ''));
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
