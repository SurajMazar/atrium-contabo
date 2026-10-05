import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { forbidden } from '../../common/errors';
import { ZodBody } from '../../common/zod.pipe';
import { TemplatesService } from './templates.service';

const Kind = z.enum(['SITE', 'PAGE', 'SECTION', 'COMPONENT_PRESET', 'THEME']);
const CreateBody = z.object({
  kind: Kind,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.string().max(60).optional(),
  data: z.unknown().optional(),
  from: z.object({ websiteId: z.string(), pageId: z.string().optional(), nodeId: z.string().optional() }).optional(),
});

@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService, private readonly prisma: PrismaService, private readonly access: AccessService) {}

  private async orgIds(userId: string) {
    return (await this.prisma.client.organizationMember.findMany({ where: { userId }, select: { organizationId: true } })).map((m) => m.organizationId);
  }

  @Get('templates')
  async list(@Query('kind') kind: string | undefined, @CurrentUser() user: AuthUser) {
    return this.templates.list(kind ? Kind.parse(kind) : undefined, await this.orgIds(user.id));
  }

  @Get('templates/:id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.templates.get(id, await this.orgIds(user.id));
  }

  @Access('template.manage', 'organization', 'orgId')
  @Post('organizations/:orgId/templates')
  async create(@Param('orgId') orgId: string, @Body(new ZodBody(CreateBody)) body: z.infer<typeof CreateBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    if (body.from) {
      // Copying a website's content into a template is a read of that website.
      await this.access.assertWebsiteInScope(access, body.from.websiteId);
      if (!this.access.can(access, 'page.read')) throw forbidden('Saving a template from a website requires page.read');
    }
    return this.templates.create(orgId, body, user);
  }

  @Access('template.manage', 'template', 'id')
  @HttpCode(204)
  @Delete('templates/:id')
  remove(@Param('id') id: string) {
    return this.templates.remove(id);
  }
}
