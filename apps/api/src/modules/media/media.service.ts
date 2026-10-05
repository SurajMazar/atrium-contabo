import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ResolverService } from '../providers/resolver.service';

export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED = /^(image\/(jpeg|png|webp|avif|gif|svg\+xml)|video\/(mp4|webm|quicktime)|application\/pdf|font\/(woff2?|ttf|otf)|application\/(font-woff2?|x-font-ttf|vnd\.ms-fontobject)|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel|zip))$/;

/** Minimal dimension sniffing so ALT/aspect ratio data is available before async processing. */
function imageSize(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && buf.length > 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === 'image/gif' && buf.length > 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1]!;
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
    if (mime === 'image/webp' && buf.toString('ascii', 12, 16) === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  } catch {
    return null;
  }
  return null;
}

/** Strip scriptable content from uploaded SVGs. */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '');
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly queues: QueueService,
    private readonly orgs: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async dto(m: { id: string; key: string; organizationId: string; filename: string; mimeType: string; size: number; width: number | null; height: number | null; alt: string | null; title: string | null; caption: string | null; tags: string[]; folderId: string | null; websiteId: string | null; variants: unknown; blurDataUrl: string | null; status: string; createdAt: Date }) {
    const storage = await this.resolver.resolver.storage({ organizationId: m.organizationId });
    const variants = ((m.variants as Array<{ width: number; format: string; key?: string; url?: string; size?: number }>) ?? []).map((v) => ({ width: v.width, format: v.format, url: v.url ?? (v.key ? storage.getPublicUrl(v.key) : ''), size: v.size }));
    return {
      id: m.id, url: storage.getPublicUrl(m.key), filename: m.filename, mimeType: m.mimeType, size: m.size, width: m.width, height: m.height, alt: m.alt, title: m.title, caption: m.caption,
      tags: m.tags, folderId: m.folderId, websiteId: m.websiteId, variants, blurDataUrl: m.blurDataUrl, status: m.status, createdAt: m.createdAt.toISOString(),
    };
  }

  async list(orgId: string, q: { websiteId?: string; folderId?: string; search?: string; type?: string; tag?: string; cursor?: string; limit: number }) {
    const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
    if (q.websiteId) where.OR = [{ websiteId: q.websiteId }, { websiteId: null }];
    if (q.folderId !== undefined) where.folderId = q.folderId === 'root' || q.folderId === '' ? null : q.folderId;
    if (q.search) where.AND = [{ OR: [{ filename: { contains: q.search, mode: 'insensitive' } }, { alt: { contains: q.search, mode: 'insensitive' } }, { title: { contains: q.search, mode: 'insensitive' } }, { tags: { has: q.search.toLowerCase() } }] }];
    if (q.type === 'image') where.mimeType = { startsWith: 'image/' };
    else if (q.type === 'video') where.mimeType = { startsWith: 'video/' };
    else if (q.type === 'document') where.NOT = [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }];
    if (q.tag) where.tags = { has: q.tag };
    const rows = await this.db.media.findMany({ where: where as never, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > q.limit;
    const items = await Promise.all((hasMore ? rows.slice(0, q.limit) : rows).map((m) => this.dto(m)));
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, total: await this.db.media.count({ where: where as never }) };
  }

  private key(orgId: string, filename: string) {
    const d = new Date();
    const safe = filename.toLowerCase().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80);
    return `media/${orgId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(6).toString('hex')}-${safe}`;
  }

  private prepare(file: UploadFile) {
    if (!ALLOWED.test(file.mimetype)) throw badRequest(`Files of type ${file.mimetype || 'unknown'} are not supported`);
    if (file.size > env().UPLOAD_MAX_MB * 1_048_576) throw badRequest(`Files must be smaller than ${env().UPLOAD_MAX_MB} MB`);
    const buffer = file.mimetype === 'image/svg+xml' ? Buffer.from(sanitizeSvg(file.buffer.toString('utf8'))) : file.buffer;
    return { buffer, checksum: createHash('sha256').update(buffer).digest('hex'), dims: file.mimetype.startsWith('image/') ? imageSize(buffer, file.mimetype) : null };
  }

  async upload(orgId: string, file: UploadFile, meta: { folderId?: string; websiteId?: string; alt?: string; allowDuplicate?: boolean }, user: AuthUser) {
    const { buffer, checksum, dims } = this.prepare(file);
    if (!meta.allowDuplicate) {
      const dup = await this.db.media.findFirst({ where: { organizationId: orgId, checksum, deletedAt: null } });
      if (dup) throw conflict('This file is already in your media library', { duplicateOf: await this.dto(dup) });
    }
    const usage = await this.orgs.usage(orgId);
    const limits = await this.orgs.limits(orgId);
    if (limits.storageMb !== undefined && usage.usage.storageMb + file.size / 1_048_576 > limits.storageMb) throw badRequest('Storage limit reached for your plan');
    if (meta.websiteId && !(await this.db.website.findFirst({ where: { id: meta.websiteId, organizationId: orgId } }))) throw badRequest('Unknown website');
    if (meta.folderId && !(await this.db.mediaFolder.findFirst({ where: { id: meta.folderId, organizationId: orgId } }))) throw badRequest('Unknown folder');
    const storage = await this.resolver.resolver.storage({ organizationId: orgId });
    const key = this.key(orgId, file.originalname);
    await storage.upload({ key, body: buffer, contentType: file.mimetype, contentLength: buffer.length, cacheControl: 'public, max-age=31536000, immutable', visibility: 'public' });
    const isRaster = /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype);
    const m = await this.db.media.create({
      data: {
        organizationId: orgId, websiteId: meta.websiteId ?? null, folderId: meta.folderId ?? null, key, filename: file.originalname, mimeType: file.mimetype, size: buffer.length,
        width: dims?.width, height: dims?.height, alt: meta.alt, checksum, status: isRaster ? 'PROCESSING' : 'READY', uploadedById: user.id,
      },
    });
    if (isRaster) await this.queues.add('media', 'media.process', { mediaId: m.id }, { attempts: 3 });
    await this.queues.emit(orgId, meta.websiteId, 'media.uploaded', { mediaId: m.id, filename: m.filename, mimeType: m.mimeType });
    return this.dto(m);
  }

  async update(id: string, body: { filename?: string; alt?: string | null; title?: string | null; caption?: string | null; tags?: string[]; folderId?: string | null }) {
    const m = await this.db.media.findUniqueOrThrow({ where: { id } });
    if (body.folderId && !(await this.db.mediaFolder.findFirst({ where: { id: body.folderId, organizationId: m.organizationId } }))) throw badRequest('Unknown folder');
    return this.dto(await this.db.media.update({ where: { id }, data: { ...body, tags: body.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) } }));
  }

  /** Replace the file but keep id + key, so every reference keeps working. */
  async replace(id: string, file: UploadFile) {
    const m = await this.db.media.findUniqueOrThrow({ where: { id } });
    const { buffer, checksum, dims } = this.prepare(file);
    const storage = await this.resolver.resolver.storage({ organizationId: m.organizationId });
    const key = this.key(m.organizationId, file.originalname);
    await storage.upload({ key, body: buffer, contentType: file.mimetype, contentLength: buffer.length, cacheControl: 'public, max-age=31536000, immutable', visibility: 'public' });
    await storage.delete(m.key).catch(() => undefined);
    const isRaster = /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype);
    const updated = await this.db.media.update({ where: { id }, data: { key, mimeType: file.mimetype, size: buffer.length, checksum, width: dims?.width ?? null, height: dims?.height ?? null, variants: [], blurDataUrl: null, status: isRaster ? 'PROCESSING' : 'READY', filename: file.originalname } });
    if (isRaster) await this.queues.add('media', 'media.process', { mediaId: id }, { attempts: 3 });
    return this.dto(updated);
  }

  async remove(id: string, user: AuthUser) {
    const m = await this.db.media.update({ where: { id }, data: { deletedAt: new Date() } });
    const storage = await this.resolver.resolver.storage({ organizationId: m.organizationId });
    const variantKeys = ((m.variants as Array<{ key?: string }>) ?? []).map((v) => v.key).filter(Boolean) as string[];
    await Promise.all([m.key, ...variantKeys].map((k) => storage.delete(k).catch(() => undefined)));
    await this.audit.log({ organizationId: m.organizationId, websiteId: m.websiteId, actor: user, action: 'media.deleted', resourceType: 'media', resourceId: id, summary: `${user.name} deleted ${m.filename}` });
  }

  // folders
  async folders(orgId: string, websiteId?: string) {
    const rows = await this.db.mediaFolder.findMany({ where: { organizationId: orgId, ...(websiteId ? { OR: [{ websiteId }, { websiteId: null }] } : {}) }, orderBy: { name: 'asc' } });
    return rows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, websiteId: f.websiteId }));
  }

  async createFolder(orgId: string, body: { name: string; parentId?: string; websiteId?: string }) {
    if (body.parentId && !(await this.db.mediaFolder.findFirst({ where: { id: body.parentId, organizationId: orgId } }))) throw notFound('Parent folder');
    const f = await this.db.mediaFolder.create({ data: { organizationId: orgId, name: body.name, parentId: body.parentId ?? null, websiteId: body.websiteId ?? null } });
    return { id: f.id, name: f.name, parentId: f.parentId, websiteId: f.websiteId };
  }

  async updateFolder(id: string, body: { name?: string; parentId?: string | null }) {
    if (body.parentId === id) throw badRequest('A folder cannot contain itself');
    const f = await this.db.mediaFolder.update({ where: { id }, data: body });
    return { id: f.id, name: f.name, parentId: f.parentId, websiteId: f.websiteId };
  }

  async removeFolder(id: string) {
    await this.db.media.updateMany({ where: { folderId: id }, data: { folderId: null } });
    await this.db.mediaFolder.delete({ where: { id } });
  }
}
