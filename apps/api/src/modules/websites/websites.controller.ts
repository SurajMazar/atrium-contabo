import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SiteOperationSchema } from '@atrium/builder-core';
import { NavigationSchema, NodeSchema, SiteSettingsSchema, ThemeTokensSchema, type ThemeTokens } from '@atrium/schema';
import type { Response } from 'express';
import { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AppRequest, type AuthUser } from '../../common/decorators';
import { badRequest, forbidden } from '../../common/errors';
import { ZodBody } from '../../common/zod.pipe';
import { PublishingService } from '../publishing/publishing.service';
import { TemplatesService } from '../templates/templates.service';
import { DraftService } from './draft.service';
import { ExportService } from './export.service';
import { TrashService } from './trash.service';
import { WebsitesService } from './websites.service';
import { BundleAssetsService } from './bundle-assets.service';

const Source = z.discriminatedUnion('type', [
  z.object({ type: z.literal('blank'), presetKey: z.string().optional() }),
  z.object({ type: z.literal('template'), templateKey: z.string() }),
  z.object({ type: z.literal('import'), definition: z.unknown() }),
]);
const CreateBody = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().max(60).optional(), source: Source.default({ type: 'blank' }) });
const UpdateBody = z.object({ name: z.string().trim().min(1).max(120).optional(), slug: z.string().max(60).optional(), deploymentMode: z.enum(['PLATFORM', 'INDEPENDENT']).optional(), deploymentIntegrationId: z.string().nullable().optional() });
const SiteBody = z.object({ settings: SiteSettingsSchema.optional(), navigation: NavigationSchema.optional(), header: NodeSchema.optional(), footer: NodeSchema.optional(), customCss: z.string().max(100_000).optional(), revision: z.number().int() });
const ThemeBody = z.object({ tokens: ThemeTokensSchema, presetKey: z.string().optional(), revision: z.number().int() });
const OpsBody = z.object({ operations: z.array(SiteOperationSchema).min(1).max(200), label: z.string().max(200).optional() });
const CloneBody = z.object({ name: z.string().trim().min(1).max(120), include: z.object({ pages: z.boolean().optional(), theme: z.boolean().optional(), forms: z.boolean().optional(), collections: z.boolean().optional(), media: z.boolean().optional() }).default({}) });

@Controller()
export class WebsitesController {
  constructor(
    private readonly websites: WebsitesService,
    private readonly drafts: DraftService,
    private readonly exporter: ExportService,
    private readonly templates: TemplatesService,
    private readonly publishing: PublishingService,
    private readonly access: AccessService,
    private readonly bundleAssets: BundleAssetsService,
    private readonly trash: TrashService,
  ) {}

  @Access('website.read', 'organization', 'orgId')
  @Get('organizations/:orgId/websites')
  list(@Param('orgId') orgId: string, @CurrentUser() user: AuthUser) {
    return this.websites.list(orgId, user);
  }

  @Access('website.create', 'organization', 'orgId')
  @Post('organizations/:orgId/websites')
  create(@Param('orgId') orgId: string, @Body(new ZodBody(CreateBody)) body: z.infer<typeof CreateBody>, @CurrentUser() user: AuthUser) {
    return this.websites.create(orgId, body, user);
  }

  @Access('website.create', 'organization', 'orgId')
  @Post('organizations/:orgId/websites/import')
  // Bundles may carry their own images/video (assets/…), hence the larger limit.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 300 * 1024 * 1024, files: 1 } }))
  async import(@Param('orgId') orgId: string, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() body: { definition?: unknown; name?: string }, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    const resolveAssets = async (files: Map<string, Buffer>) => {
      // Uploading media is part of the import: require the same permission as the media library.
      if (!this.access.can(access, 'media.upload')) throw forbidden('Importing a bundle with media requires media.upload');
      return (await this.bundleAssets.resolve(orgId, files, user)).files;
    };
    const raw = file ? await this.exporter.parseUpload(file.buffer, file.originalname, resolveAssets) : body.definition;
    if (!raw) throw badRequest('Upload a site export (.json or .zip) or send { definition }');
    const input = this.templates.parseImport(raw);
    const name = body.name?.trim() || input.settings.name;
    const w = await this.websites.createFromInput(orgId, name, input, user);
    return this.websites.get(w.id, new Set());
  }

  @Access('website.read', 'website', 'id')
  @Get('websites/:id')
  get(@Param('id') id: string, @CurrentAccess() access: AccessContext) {
    return this.websites.get(id, access.permissions);
  }

  @Access('website.update', 'website', 'id')
  @Patch('websites/:id')
  async update(@Param('id') id: string, @Body(new ZodBody(UpdateBody)) body: z.infer<typeof UpdateBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    if ((body.deploymentMode || body.deploymentIntegrationId !== undefined) && !this.access.can(access, 'deployment.publish')) throw forbidden('Changing deployment settings requires deployment.publish');
    return this.websites.update(id, body, user, access);
  }

  @Access('website.delete', 'website', 'id')
  @HttpCode(204)
  @Delete('websites/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Deleting removes the domain rows, so read the hostnames first: the renderer must drop this site's
    // cached pages for them too, or a deleted site keeps being served from cache.
    const hosts = await this.websites.hostnames(id);
    await this.websites.remove(id, user);
    await this.publishing.revalidate(id, hosts);
  }

  @Access('website.delete', 'organization', 'orgId')
  @Get('organizations/:orgId/trash/websites')
  trashList(@Param('orgId') orgId: string) {
    return this.trash.list(orgId);
  }

  @Access('website.delete', 'organization', 'orgId')
  @Post('organizations/:orgId/trash/websites/:id/restore')
  restore(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.trash.restore(orgId, id, user);
  }

  @Access('website.delete', 'organization', 'orgId')
  @Delete('organizations/:orgId/trash/websites/:id')
  purge(@Param('orgId') orgId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.trash.purge(orgId, id, user);
  }

  @Access('website.read', 'website', 'id')
  @Get('websites/:id/dashboard')
  dashboard(@Param('id') id: string) {
    return this.websites.dashboard(id);
  }

  @Access('page.read', 'website', 'id')
  @Get('websites/:id/draft')
  draft(@Param('id') id: string) {
    return this.drafts.load(id);
  }

  /** Site-level draft units. Authorized by what actually changes (settings, SEO, scripts, CSS, navigation). */
  @Access('website.read', 'website', 'id')
  @Put('websites/:id/draft/site')
  async saveSite(@Param('id') id: string, @Body(new ZodBody(SiteBody)) body: z.infer<typeof SiteBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.websites.saveSite(id, body, user, access);
  }

  @Access('theme.update', 'website', 'id')
  @Put('websites/:id/theme')
  saveTheme(@Param('id') id: string, @Body(new ZodBody(ThemeBody)) body: { tokens: ThemeTokens; presetKey?: string; revision: number }, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.websites.saveTheme(id, body, user, access);
  }

  @Access('page.update', 'website', 'id')
  @Post('websites/:id/operations')
  async operations(@Param('id') id: string, @Body(new ZodBody(OpsBody)) body: z.infer<typeof OpsBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    // The route needs page.update; anything else the operations touch (scripts, theme, forms…) is checked on the diff.
    const res = await this.drafts.applyOperations(id, body.operations, { userId: user.id, versionSource: 'MANUAL', versionMessage: body.label }, { access });
    return { results: res.results, revisions: res.revisions };
  }

  @Access('website.export', 'website', 'id')
  @Post('websites/:id/clone')
  async clone(@Param('id') id: string, @Body(new ZodBody(CloneBody)) body: z.infer<typeof CloneBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    // A clone is a new website: it needs website.create in the organization (website-scoped
    // members such as Website Managers cannot create websites this way).
    await this.access.check(user, 'organization', access.organizationId, 'website.create');
    return this.websites.clone(id, body, user);
  }

  @Access('website.export', 'website', 'id')
  @Get('websites/:id/export')
  async export(@Param('id') id: string, @Query('format') format = 'json', @Res() res: Response) {
    const site = await this.websites.get(id, new Set());
    const { definition } = await this.drafts.load(id);
    const base = site.slug;
    if (format === 'zip') {
      res.setHeader('Content-Type', 'application/zip').setHeader('Content-Disposition', `attachment; filename="${base}-site.zip"`).send(await this.exporter.zip(definition));
    } else if (format === 'nextjs') {
      const snapshot = await this.publishing.buildSnapshot(id, { preview: false, fromDraft: true });
      res.setHeader('Content-Type', 'application/zip').setHeader('Content-Disposition', `attachment; filename="${base}-nextjs.zip"`).send(await this.exporter.nextProject(snapshot));
    } else {
      res.setHeader('Content-Type', 'application/json').setHeader('Content-Disposition', `attachment; filename="${base}-site.json"`).send(await this.exporter.json(definition));
    }
  }

  @Access('website.read', 'website', 'id')
  @Get('websites/:id/activity')
  activity(@Param('id') id: string, @Query('cursor') cursor?: string, @Req() _req?: AppRequest) {
    return this.websites.activity(id, cursor);
  }
}
