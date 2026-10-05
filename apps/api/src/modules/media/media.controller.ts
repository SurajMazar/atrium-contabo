import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AccessService } from '../../common/access.service';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AuthUser } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { limitOf } from '../../common/http';
import { ZodBody } from '../../common/zod.pipe';
import { MediaService, type UploadFile } from './media.service';

const Patch_ = z.object({ filename: z.string().max(200).optional(), alt: z.string().max(500).nullable().optional(), title: z.string().max(200).nullable().optional(), caption: z.string().max(1000).nullable().optional(), tags: z.array(z.string().max(40)).max(40).optional(), folderId: z.string().nullable().optional() });
const upload = () => FileInterceptor('file', { limits: { fileSize: env().UPLOAD_MAX_MB * 1_048_576 } });

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService, private readonly access: AccessService) {}

  @Access('media.read', 'organization', 'orgId') @Get('organizations/:orgId/media')
  async list(@Param('orgId') orgId: string, @Query() q: Record<string, string>, @CurrentAccess() access: AccessContext) {
    await this.access.assertWebsiteInScope(access, q.websiteId);
    return this.media.list(orgId, { websiteId: q.websiteId, folderId: q.folderId, search: q.search, type: q.type, tag: q.tag, cursor: q.cursor, limit: limitOf(q.limit, 60) });
  }

  @Access('media.upload', 'organization', 'orgId') @Post('organizations/:orgId/media/upload') @UseInterceptors(upload())
  async upload(@Param('orgId') orgId: string, @UploadedFile() file: UploadFile | undefined, @Body() body: Record<string, string>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    if (!file) throw badRequest('Attach a file in the "file" field');
    await this.access.assertWebsiteInScope(access, body.websiteId || undefined);
    return this.media.upload(orgId, file, { folderId: body.folderId || undefined, websiteId: body.websiteId || undefined, alt: body.alt, allowDuplicate: body.allowDuplicate === 'true' }, user);
  }

  @Access('media.upload', 'media', 'id') @Patch('media/:id')
  update(@Param('id') id: string, @Body(new ZodBody(Patch_)) body: z.infer<typeof Patch_>) { return this.media.update(id, body); }

  @Access('media.upload', 'media', 'id') @Post('media/:id/replace') @UseInterceptors(upload())
  replace(@Param('id') id: string, @UploadedFile() file: UploadFile | undefined) {
    if (!file) throw badRequest('Attach a file in the "file" field');
    return this.media.replace(id, file);
  }

  @Access('media.delete', 'media', 'id') @HttpCode(204) @Delete('media/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.media.remove(id, user); }

  @Access('media.read', 'organization', 'orgId') @Get('organizations/:orgId/media-folders')
  async folders(@Param('orgId') orgId: string, @CurrentAccess() access: AccessContext, @Query('websiteId') websiteId?: string) {
    await this.access.assertWebsiteInScope(access, websiteId);
    return this.media.folders(orgId, websiteId);
  }

  @Access('media.upload', 'organization', 'orgId') @Post('organizations/:orgId/media-folders')
  async createFolder(@Param('orgId') orgId: string, @Body(new ZodBody(z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().optional(), websiteId: z.string().optional() }))) body: { name: string; parentId?: string; websiteId?: string }, @CurrentAccess() access: AccessContext) {
    await this.access.assertWebsiteInScope(access, body.websiteId);
    return this.media.createFolder(orgId, body);
  }

  @Access('media.upload', 'mediaFolder', 'id') @Patch('media-folders/:id')
  updateFolder(@Param('id') id: string, @Body(new ZodBody(z.object({ name: z.string().trim().min(1).max(80).optional(), parentId: z.string().nullable().optional() }))) body: { name?: string; parentId?: string | null }) { return this.media.updateFolder(id, body); }

  @Access('media.delete', 'mediaFolder', 'id') @HttpCode(204) @Delete('media-folders/:id')
  removeFolder(@Param('id') id: string) { return this.media.removeFolder(id); }
}
