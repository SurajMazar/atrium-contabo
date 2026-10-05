import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { NodeInputSchema, PageDocumentSchema } from '@atrium/schema';
import { z } from 'zod';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';
import { PagesService } from './pages.service';

const CreateBody = z.object({ title: z.string().trim().min(1).max(200), slug: z.string().max(200).default(''), kind: z.enum(['page', 'collection-template', 'not-found']).optional(), templateId: z.string().optional(), sections: z.array(NodeInputSchema).optional(), collection: z.string().optional() });
const UpdateBody = z.object({ document: PageDocumentSchema.optional(), title: z.string().trim().min(1).max(200).optional(), slug: z.string().max(200).optional(), status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional(), publishAt: z.string().datetime().nullable().optional(), revision: z.number().int() });

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService, private readonly prisma: PrismaService) {}

  @Access('page.read', 'website', 'websiteId')
  @Get('websites/:websiteId/pages')
  list(@Param('websiteId') websiteId: string) {
    return this.pages.list(websiteId);
  }

  @Access('page.create', 'website', 'websiteId')
  @Post('websites/:websiteId/pages')
  async create(@Param('websiteId') websiteId: string, @Body(new ZodBody(CreateBody)) body: z.infer<typeof CreateBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    // Page templates may come from the platform or from the website's own organization only.
    return this.pages.create(websiteId, body, user, [access.organizationId], access);
  }

  @Access('page.read', 'page', 'pageId')
  @Get('pages/:pageId')
  get(@Param('pageId') pageId: string) {
    return this.pages.get(pageId);
  }

  @Access('page.update', 'page', 'pageId')
  @Patch('pages/:pageId')
  update(@Param('pageId') pageId: string, @Body(new ZodBody(UpdateBody)) body: z.infer<typeof UpdateBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.pages.update(pageId, body, user, access);
  }

  @Access('page.delete', 'page', 'pageId')
  @HttpCode(204)
  @Delete('pages/:pageId')
  remove(@Param('pageId') pageId: string, @CurrentUser() user: AuthUser) {
    return this.pages.remove(pageId, user);
  }

  @Access('page.create', 'page', 'pageId')
  @Post('pages/:pageId/duplicate')
  duplicate(@Param('pageId') pageId: string, @Body(new ZodBody(z.object({ title: z.string().max(200).optional(), slug: z.string().max(200).optional() }))) body: { title?: string; slug?: string }, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.pages.duplicate(pageId, body, user, access);
  }

  @Access('page.update', 'page', 'pageId')
  @HttpCode(204)
  @Post('pages/:pageId/homepage')
  homepage(@Param('pageId') pageId: string, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.pages.setHomepage(pageId, user, access);
  }

  @Access('page.read', 'page', 'pageId')
  @Get('pages/:pageId/versions')
  versions(@Param('pageId') pageId: string) {
    return this.pages.versions(pageId);
  }

  @Access('page.read', 'page', 'pageId')
  @Get('pages/:pageId/versions/:versionId')
  version(@Param('pageId') pageId: string, @Param('versionId') versionId: string) {
    return this.pages.version(pageId, versionId);
  }

  @Access('page.update', 'page', 'pageId')
  @Post('pages/:pageId/versions')
  createVersion(@Param('pageId') pageId: string, @Body(new ZodBody(z.object({ message: z.string().trim().min(1).max(200) }))) body: { message: string }, @CurrentUser() user: AuthUser) {
    return this.pages.createVersion(pageId, body.message, user);
  }

  @Access('page.update', 'page', 'pageId')
  @Post('pages/:pageId/versions/:versionId/restore')
  restore(@Param('pageId') pageId: string, @Param('versionId') versionId: string, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.pages.restoreVersion(pageId, versionId, user, access);
  }

  @Access('page.update', 'page', 'pageId')
  @Post('pages/:pageId/lock')
  lock(@Param('pageId') pageId: string, @CurrentUser() user: AuthUser) {
    return this.pages.lock(pageId, user);
  }

  @Access('page.read', 'page', 'pageId')
  @HttpCode(204)
  @Delete('pages/:pageId/lock')
  unlock(@Param('pageId') pageId: string, @CurrentUser() user: AuthUser) {
    return this.pages.unlock(pageId, user);
  }

  @Access('page.read', 'page', 'pageId')
  @Get('pages/:pageId/seo')
  seo(@Param('pageId') pageId: string) {
    return this.pages.seo(pageId);
  }
}
