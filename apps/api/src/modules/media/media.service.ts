import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { resolveUploadType, safeFilenameStem, sanitizeSvg } from '../../common/file-safety';
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

export { sanitizeSvg } from '../../common/file-safety';

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

  async dto(m: { id: string; key: string; organizationId: string; storageProviderId?: string | null; filename: string; mimeType: string; size: number; width: number | null; height: number | null; alt: string | null; title: string | null; caption: string | null; tags: string[]; folderId: string | null; websiteId: string | null; variants: unknown; blurDataUrl: string | null; status: string; createdAt: Date }) {
    const storage = await this.resolver.resolver.storage({ organizationId: m.organizationId, providerId: m.storageProviderId });
    const variants = ((m.variants as Array<{ width: number; format: string; key?: string; url?: string; size?: number }>) ?? []).map((v) => ({ width: v.width, format: v.format, url: v.url ?? (v.key ? storage.getPublicUrl(v.key) : ''), size: v.size }));
    return {
      id: m.id, url: storage.getPublicUrl(m.key), filename: m.filename, mimeType: m.mimeType, size: m.size, width: m.width, height: m.height, alt: m.alt, title: m.title, caption: m.caption,
      tags: m.tags, folderId: m.folderId, websiteId: m.websiteId, variants, blurDataUrl: m.blurDataUrl, status: m.status, createdAt: m.createdAt.toISOString(),
    };
  }

  async list(orgId: string, q: { websiteId?: string; websiteIds?: string[]; folderId?: string; search?: string; type?: string; tag?: string; cursor?: string; limit: number }) {
    const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
    if (q.websiteId) where.OR = [{ websiteId: q.websiteId }, { websiteId: null }];
    // Website-scoped members: their websites' media plus shared (untagged) organization media.
    else if (q.websiteIds) where.OR = [{ websiteId: { in: q.websiteIds } }, { websiteId: null }];
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

  /** Object key: tenant prefix + random component + slugged name + the DETECTED extension (never the client's). */
  private key(orgId: string, filename: string, ext: string) {
    const d = new Date();
    return `media/${orgId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(8).toString('hex')}-${safeFilenameStem(filename)}.${ext}`;
  }

  /** Uploads are hostile: size-check, detect the real type from the bytes, sanitize SVG. */
  private prepare(file: UploadFile) {
    if (file.size > env().UPLOAD_MAX_MB * 1_048_576) throw badRequest(`Files must be smaller than ${env().UPLOAD_MAX_MB} MB`);
    const type = resolveUploadType(file.buffer, file.originalname);
    const buffer = type.mime === 'image/svg+xml' ? Buffer.from(sanitizeSvg(file.buffer.toString('utf8'))) : file.buffer;
    return { buffer, type, checksum: createHash('sha256').update(buffer).digest('hex'), dims: type.mime.startsWith('image/') ? imageSize(buffer, type.mime) : null };
  }

  async upload(orgId: string, file: UploadFile, meta: { folderId?: string; websiteId?: string; alt?: string; allowDuplicate?: boolean }, user: AuthUser) {
    const { buffer, type, checksum, dims } = this.prepare(file);
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
    const key = this.key(orgId, file.originalname, type.ext);
    await storage.upload({ key, body: buffer, contentType: type.mime, contentLength: buffer.length, cacheControl: 'public, max-age=31536000, immutable', visibility: 'public' });
    const isRaster = /^image\/(jpeg|png|webp|avif)$/.test(type.mime);
    const m = await this.db.media.create({
      data: {
        organizationId: orgId, websiteId: meta.websiteId ?? null, folderId: meta.folderId ?? null, storageProviderId: storage.id, key, filename: file.originalname.slice(0, 200), mimeType: type.mime, size: buffer.length,
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
    const { buffer, type, checksum, dims } = this.prepare(file);
    const limits = await this.orgs.limits(m.organizationId);
    const usage = await this.orgs.usage(m.organizationId);
    if (limits.storageMb !== undefined && usage.usage.storageMb + (buffer.length - m.size) / 1_048_576 > limits.storageMb) throw badRequest('Storage limit reached for your plan');
    const storage = await this.resolver.resolver.storage({ organizationId: m.organizationId, providerId: m.storageProviderId });
    const key = this.key(m.organizationId, file.originalname, type.ext);
    await storage.upload({ key, body: buffer, contentType: type.mime, contentLength: buffer.length, cacheControl: 'public, max-age=31536000, immutable', visibility: 'public' });
    await storage.delete(m.key).catch(() => undefined);
    const isRaster = /^image\/(jpeg|png|webp|avif)$/.test(type.mime);
    const updated = await this.db.media.update({ where: { id }, data: { key, mimeType: type.mime, size: buffer.length, checksum, width: dims?.width ?? null, height: dims?.height ?? null, variants: [], blurDataUrl: null, status: isRaster ? 'PROCESSING' : 'READY', filename: file.originalname.slice(0, 200) } });
    if (isRaster) await this.queues.add('media', 'media.process', { mediaId: id }, { attempts: 3 });
    return this.dto(updated);
  }

  async remove(id: string, user: AuthUser) {
    const m = await this.db.media.update({ where: { id }, data: { deletedAt: new Date() } });
    const storage = await this.resolver.resolver.storage({ organizationId: m.organizationId, providerId: m.storageProviderId });
    const variantKeys = ((m.variants as Array<{ key?: string }>) ?? []).map((v) => v.key).filter(Boolean) as string[];
    await Promise.all([m.key, ...variantKeys].map((k) => storage.delete(k).catch(() => undefined)));
    await this.audit.log({ organizationId: m.organizationId, websiteId: m.websiteId, actor: user, action: 'media.deleted', resourceType: 'media', resourceId: id, summary: `${user.name} deleted ${m.filename}` });
  }

  // folders
  folderOwner(id: string) {
    return this.db.mediaFolder.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
  }

  async folders(orgId: string, websiteId?: string, websiteIds?: string[]) {
    const scope = websiteId ? { OR: [{ websiteId }, { websiteId: null }] } : websiteIds ? { OR: [{ websiteId: { in: websiteIds } }, { websiteId: null }] } : {};
    const rows = await this.db.mediaFolder.findMany({ where: { organizationId: orgId, ...scope }, orderBy: { name: 'asc' } });
    return rows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, websiteId: f.websiteId }));
  }

  async createFolder(orgId: string, body: { name: string; parentId?: string; websiteId?: string }) {
    if (body.parentId && !(await this.db.mediaFolder.findFirst({ where: { id: body.parentId, organizationId: orgId } }))) throw notFound('Parent folder');
    if (body.websiteId && !(await this.db.website.findFirst({ where: { id: body.websiteId, organizationId: orgId } }))) throw notFound('Website');
    const f = await this.db.mediaFolder.create({ data: { organizationId: orgId, name: body.name, parentId: body.parentId ?? null, websiteId: body.websiteId ?? null } });
    return { id: f.id, name: f.name, parentId: f.parentId, websiteId: f.websiteId };
  }

  async updateFolder(id: string, body: { name?: string; parentId?: string | null }) {
    const folder = await this.db.mediaFolder.findUniqueOrThrow({ where: { id } });
    if (body.parentId) {
      // The new parent must be in the same organization and must not be a descendant (no cycles).
      const all = await this.db.mediaFolder.findMany({ where: { organizationId: folder.organizationId }, select: { id: true, parentId: true } });
      const byId = new Map(all.map((f) => [f.id, f.parentId]));
      if (!byId.has(body.parentId)) throw notFound('Parent folder');
      for (let cur: string | null | undefined = body.parentId, hops = 0; cur; cur = byId.get(cur), hops++) {
        if (cur === id || hops > 1000) throw badRequest('A folder cannot be moved into itself');
      }
    }
    const f = await this.db.mediaFolder.update({ where: { id }, data: { name: body.name, parentId: body.parentId } });
    return { id: f.id, name: f.name, parentId: f.parentId, websiteId: f.websiteId };
  }

  async removeFolder(id: string) {
    await this.db.media.updateMany({ where: { folderId: id }, data: { folderId: null } });
    await this.db.mediaFolder.delete({ where: { id } });
  }
}
