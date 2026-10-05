import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminBrandingSchema, mergeBranding, type AdminBranding } from '@atrium/schema';
import { AuditService } from '../../common/audit.service';
import { Access, CurrentUser, Public, SuperAdminOnly, type AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';

const KEY = 'branding';

/**
 * White-label branding for the admin. GET is public (the login page needs it
 * before sign-in) and only ever returns presentation data.
 */
@Controller()
export class BrandingController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async platform(): Promise<AdminBranding> {
    const row = await this.prisma.client.platformSetting.findUnique({ where: { key: KEY } });
    return AdminBrandingSchema.parse(row?.value ?? {});
  }

  @Public()
  @SkipThrottle()
  @Get('branding')
  async resolved(@Query('organizationId') organizationId?: string) {
    const platform = await this.platform();
    let org: AdminBranding | undefined;
    if (organizationId) {
      const o = await this.prisma.client.organization.findUnique({ where: { id: organizationId }, select: { branding: true } });
      org = o?.branding ? AdminBrandingSchema.parse(o.branding) : undefined;
    }
    return { platform, organization: org ?? null, resolved: mergeBranding(platform, org) };
  }

  @SuperAdminOnly()
  @Put('admin/branding')
  async savePlatform(@Body(new ZodBody(AdminBrandingSchema)) body: AdminBranding, @CurrentUser() user: AuthUser) {
    await this.prisma.client.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: body as object }, update: { value: body as object } });
    await this.audit.log({ actor: user, action: 'platform.branding_updated', resourceType: 'platform', summary: `Super admin ${user.name} updated platform branding` });
    return { platform: body, resolved: mergeBranding(body) };
  }

  @Access('organization.update', 'organization', 'orgId')
  @Get('organizations/:orgId/branding')
  async getOrg(@Param('orgId') orgId: string) {
    const o = await this.prisma.client.organization.findUniqueOrThrow({ where: { id: orgId }, select: { branding: true } });
    const org = AdminBrandingSchema.parse(o.branding ?? {});
    return { organization: org, resolved: mergeBranding(await this.platform(), org) };
  }

  @Access('organization.update', 'organization', 'orgId')
  @Put('organizations/:orgId/branding')
  async saveOrg(@Param('orgId') orgId: string, @Body(new ZodBody(AdminBrandingSchema)) body: AdminBranding, @CurrentUser() user: AuthUser) {
    await this.prisma.client.organization.update({ where: { id: orgId }, data: { branding: body as object } });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'organization.branding_updated', resourceType: 'organization', resourceId: orgId, summary: `${user.name} updated admin branding` });
    return { organization: body, resolved: mergeBranding(await this.platform(), body) };
  }
}
