import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminBrandingSchema, mergeBranding, type AdminBranding } from '@atrium/schema';
import { organizationForAdminHost } from '../../common/admin-hosts';
import { AuditService } from '../../common/audit.service';
import { Access, CurrentAccess, CurrentUser, Public, SuperAdminOnly, type AccessContext, type AuthUser } from '../../common/decorators';
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
  async resolved(@Query('organizationId') organizationId?: string, @Query('websiteId') websiteId?: string, @Query('host') host?: string) {
    const platform = await this.platform();
    // On an organization's own admin hostname the sign-in page (no session yet) shows its branding.
    const hostOrgId = organizationForAdminHost(host);
    if (!organizationId && !websiteId && hostOrgId) organizationId = hostOrgId;
    let org: AdminBranding | undefined;
    let site: AdminBranding | undefined;
    if (websiteId) {
      const w = await this.prisma.client.website.findFirst({ where: { id: websiteId, deletedAt: null }, select: { organizationId: true, adminBranding: true } });
      // A website only ever layers over its own organization's branding.
      if (w && (!organizationId || organizationId === w.organizationId)) {
        organizationId = w.organizationId;
        site = w.adminBranding ? AdminBrandingSchema.parse(w.adminBranding) : undefined;
      }
    }
    if (organizationId) {
      const o = await this.prisma.client.organization.findUnique({ where: { id: organizationId }, select: { branding: true } });
      org = o?.branding ? AdminBrandingSchema.parse(o.branding) : undefined;
    }
    let hostOrganization: { id: string; name: string } | null = null;
    if (hostOrgId) {
      const o = await this.prisma.client.organization.findFirst({ where: { id: hostOrgId, suspendedAt: null }, select: { id: true, name: true } });
      hostOrganization = o ?? null;
    }
    return { platform, organization: org ?? null, website: site ?? null, hostOrganization, resolved: mergeBranding(platform, org, site) };
  }

  private async orgLayers(websiteId: string) {
    const w = await this.prisma.client.website.findUniqueOrThrow({ where: { id: websiteId }, select: { adminBranding: true, organization: { select: { branding: true } } } });
    const org = w.organization.branding ? AdminBrandingSchema.parse(w.organization.branding) : undefined;
    return { platform: await this.platform(), org, site: AdminBrandingSchema.parse(w.adminBranding ?? {}) };
  }

  /** Dashboard branding for one website (what its members see in the admin), over the organization's. */
  @Access('website.read', 'website', 'websiteId')
  @Get('websites/:websiteId/branding')
  async getWebsite(@Param('websiteId') websiteId: string) {
    const { platform, org, site } = await this.orgLayers(websiteId);
    return { website: site, inherited: mergeBranding(platform, org), resolved: mergeBranding(platform, org, site) };
  }

  @Access('website.update', 'website', 'websiteId')
  @Put('websites/:websiteId/branding')
  async saveWebsite(@Param('websiteId') websiteId: string, @Body(new ZodBody(AdminBrandingSchema)) body: AdminBranding, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    await this.prisma.client.website.update({ where: { id: websiteId }, data: { adminBranding: body as object } });
    await this.audit.log({ organizationId: access.organizationId, websiteId, actor: user, action: 'website.branding_updated', resourceType: 'website', resourceId: websiteId, summary: `${user.name} updated the dashboard branding` });
    const { platform, org } = await this.orgLayers(websiteId);
    return { website: body, inherited: mergeBranding(platform, org), resolved: mergeBranding(platform, org, body) };
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
