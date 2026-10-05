import { Injectable } from '@nestjs/common';
import { CollectionFieldSchema, slugify, validateCollectionItem, type CollectionField } from '@atrium/schema';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { conflict, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';

export const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'code', 'pre', 'span', 'sup', 'sub', 'figure', 'figcaption', 'img'],
  allowedAttributes: { a: ['href', 'target', 'rel', 'title'], img: ['src', 'alt', 'width', 'height', 'loading'], span: ['class'], p: ['class'], '*': ['dir'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: { a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: attribs.target === '_blank' ? 'noopener noreferrer' : (attribs.rel ?? '') } }) },
};

const fieldsSchema = z.array(CollectionFieldSchema).max(100);

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private fieldsOf(rows: Array<{ key: string; label: string; type: string; required: boolean; position: number; config: unknown }>): CollectionField[] {
    return [...rows].sort((a, b) => a.position - b.position).map((f) => ({ ...(f.config as object), key: f.key, label: f.label, type: f.type, required: f.required }) as CollectionField);
  }

  dto(c: { id: string; slug: string; name: string; singularName: string | null; description: string | null; titleField: string; routePrefix: string | null; fields: Array<{ key: string; label: string; type: string; required: boolean; position: number; config: unknown }>; _count?: { items: number } }) {
    return { id: c.id, slug: c.slug, name: c.name, singularName: c.singularName, description: c.description, titleField: c.titleField, routePrefix: c.routePrefix, fields: this.fieldsOf(c.fields), itemCount: c._count?.items };
  }

  async list(websiteId: string) {
    const rows = await this.db.collection.findMany({ where: { websiteId }, include: { fields: true, _count: { select: { items: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((c) => this.dto(c));
  }

  async get(id: string) {
    return this.dto(await this.db.collection.findUniqueOrThrow({ where: { id }, include: { fields: true, _count: { select: { items: true } } } }));
  }

  private fieldRows(fields: CollectionField[]) {
    const keys = fields.map((f) => f.key);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) throw validation(`Duplicate field key "${dup}"`);
    return fields.map((f, position) => {
      const { key, label, type, required, ...config } = f;
      return { key, label, type, required, position, config: JSON.parse(JSON.stringify(config)) };
    });
  }

  async create(websiteId: string, body: { slug: string; name: string; singularName?: string; description?: string; fields: unknown; titleField?: string; routePrefix?: string }) {
    const fields = fieldsSchema.parse(body.fields);
    const slug = slugify(body.slug || body.name);
    if (await this.db.collection.findUnique({ where: { websiteId_slug: { websiteId, slug } } })) throw conflict(`Collection "${slug}" exists`);
    const c = await this.db.collection.create({
      data: { websiteId, slug, name: body.name, singularName: body.singularName, description: body.description, titleField: body.titleField ?? fields[0]?.key ?? 'name', routePrefix: body.routePrefix ?? slug, fields: { create: this.fieldRows(fields) } },
    });
    return this.get(c.id);
  }

  async update(id: string, body: { name?: string; singularName?: string | null; description?: string | null; titleField?: string; routePrefix?: string | null; fields?: unknown; slug?: string }) {
    const fields = body.fields !== undefined ? fieldsSchema.parse(body.fields) : undefined;
    await this.db.$transaction(async (tx) => {
      await tx.collection.update({ where: { id }, data: { name: body.name, singularName: body.singularName, description: body.description, titleField: body.titleField, routePrefix: body.routePrefix, slug: body.slug ? slugify(body.slug) : undefined } });
      if (fields) {
        await tx.collectionField.deleteMany({ where: { collectionId: id } });
        await tx.collectionField.createMany({ data: this.fieldRows(fields).map((f) => ({ ...f, collectionId: id })) });
      }
    });
    return this.get(id);
  }

  async remove(id: string) {
    await this.db.collection.delete({ where: { id } });
  }

  itemDto(i: { id: string; slug: string; status: string; data: unknown; position: number; updatedAt: Date }) {
    return { id: i.id, slug: i.slug, status: i.status, data: i.data as Record<string, unknown>, position: i.position, updatedAt: i.updatedAt.toISOString() };
  }

  async items(cid: string, q: { search?: string; status?: string; cursor?: string; limit: number }) {
    const c = await this.db.collection.findUniqueOrThrow({ where: { id: cid } });
    const where: Record<string, unknown> = { collectionId: cid };
    if (q.status) where.status = q.status;
    if (q.search) where.OR = [{ slug: { contains: q.search, mode: 'insensitive' } }, { data: { path: [c.titleField], string_contains: q.search } }];
    const rows = await this.db.collectionItem.findMany({ where: where as never, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((i) => this.itemDto(i));
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, total: await this.db.collectionItem.count({ where: where as never }) };
  }

  /** Validate + sanitize item data against the collection's fields. */
  private async clean(cid: string, data: Record<string, unknown>) {
    const c = await this.db.collection.findUniqueOrThrow({ where: { id: cid }, include: { fields: true } });
    const fields = this.fieldsOf(c.fields);
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      let v = data[f.key];
      if (v === undefined) continue;
      if (f.type === 'richtext' && typeof v === 'string') v = sanitizeHtml(v, RICH_TEXT_OPTIONS);
      if (f.type === 'number' && typeof v === 'string' && v.trim() !== '') v = Number(v);
      out[f.key] = v;
    }
    const errors = validateCollectionItem(fields, out);
    if (errors.length) throw validation(errors[0]!, errors);
    return { collection: c, data: out };
  }

  async createItem(cid: string, body: { slug?: string; status?: string; data: Record<string, unknown> }) {
    const { collection, data } = await this.clean(cid, body.data);
    const base = slugify(body.slug || String(data[collection.titleField] ?? '') || 'item');
    let slug = base;
    for (let i = 2; await this.db.collectionItem.findUnique({ where: { collectionId_slug: { collectionId: cid, slug } } }); i++) slug = `${base}-${i}`;
    const max = await this.db.collectionItem.aggregate({ where: { collectionId: cid }, _max: { position: true } });
    const status = body.status ?? 'published';
    const item = await this.db.collectionItem.create({ data: { collectionId: cid, slug, status, data: data as object, position: (max._max.position ?? -1) + 1, publishedAt: status === 'published' ? new Date() : null } });
    return this.itemDto(item);
  }

  async updateItem(itemId: string, body: { slug?: string; status?: string; data?: Record<string, unknown> }) {
    const existing = await this.db.collectionItem.findUniqueOrThrow({ where: { id: itemId } });
    const data = body.data ? (await this.clean(existing.collectionId, { ...(existing.data as object), ...body.data })).data : undefined;
    if (body.slug) {
      const slug = slugify(body.slug);
      if (await this.db.collectionItem.findFirst({ where: { collectionId: existing.collectionId, slug, id: { not: itemId } } })) throw conflict('Slug is taken');
      body.slug = slug;
    }
    const item = await this.db.collectionItem.update({ where: { id: itemId }, data: { slug: body.slug, status: body.status, data: data as object | undefined, publishedAt: body.status === 'published' && existing.status !== 'published' ? new Date() : undefined } });
    return this.itemDto(item);
  }

  async getItem(itemId: string) {
    return this.itemDto(await this.db.collectionItem.findUniqueOrThrow({ where: { id: itemId } }));
  }

  async removeItem(itemId: string) {
    await this.db.collectionItem.delete({ where: { id: itemId } });
  }

  async reorder(cid: string, ids: string[]) {
    const count = await this.db.collectionItem.count({ where: { collectionId: cid, id: { in: ids } } });
    if (count !== ids.length) throw notFound('Item');
    await this.db.$transaction(ids.map((id, position) => this.db.collectionItem.update({ where: { id }, data: { position } })));
  }
}
