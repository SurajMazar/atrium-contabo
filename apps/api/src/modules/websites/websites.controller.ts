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
import { WebsitesService } from './websites.service';

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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async import(@Param('orgId') orgId: string, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() body: { definition?: unknown; name?: string }, @CurrentUser() user: AuthUser) {
    const raw = file ? await this.exporter.parseUpload(file.buffer, file.originalname) : body.definition;
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
    return this.websites.update(id, body, user);
  }

  @Access('website.delete', 'website', 'id')
  @HttpCode(204)
  @Delete('websites/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.websites.remove(id, user);
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

  @Access('website.read', 'website', 'id')
  @Put('websites/:id/draft/site')
  async saveSite(@Param('id') id: string, @Body(new ZodBody(SiteBody)) body: z.infer<typeof SiteBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    if ((body.navigation || body.header || body.footer) && !this.access.can(access, 'navigation.update')) throw forbidden('Editing navigation requires navigation.update');
    if (body.settings && !this.access.can(access, 'website.update')) {
      // SEO managers may change settings.seo only
      const { definition } = await this.drafts.load(id);
      const { seo: _a, ...rest } = body.settings;
      const { seo: _b, ...current } = definition.settings;
      if (!this.access.can(access, 'seo.manage') || JSON.stringify(rest) !== JSON.stringify(current)) throw forbidden('Editing site settings requires website.update');
    }
    if (body.customCss !== undefined && !body.settings && !body.navigation && !body.header && !body.footer && !this.access.can(access, 'website.update') && !this.access.can(access, 'code.manage')) throw forbidden('Editing custom CSS requires code.manage');
    return this.websites.saveSite(id, body, user, this.access.can(access, 'code.manage'));
  }

  @Access('theme.update', 'website', 'id')
  @Put('websites/:id/theme')
  saveTheme(@Param('id') id: string, @Body(new ZodBody(ThemeBody)) body: { tokens: ThemeTokens; presetKey?: string; revision: number }, @CurrentUser() user: AuthUser) {
    return this.websites.saveTheme(id, body, user);
  }

  @Access('page.update', 'website', 'id')
  @Post('websites/:id/operations')
  async operations(@Param('id') id: string, @Body(new ZodBody(OpsBody)) body: z.infer<typeof OpsBody>, @CurrentUser() user: AuthUser) {
    const res = await this.drafts.applyOperations(id, body.operations, { userId: user.id, versionSource: 'MANUAL', versionMessage: body.label });
    return { results: res.results, revisions: res.revisions };
  }

  @Access('website.export', 'website', 'id')
  @Post('websites/:id/clone')
  clone(@Param('id') id: string, @Body(new ZodBody(CloneBody)) body: z.infer<typeof CloneBody>, @CurrentUser() user: AuthUser) {
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
