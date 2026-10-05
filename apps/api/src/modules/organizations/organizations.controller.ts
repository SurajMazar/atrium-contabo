import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@atrium/schema';
import { z } from 'zod';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AuthUser } from '../../common/decorators';
import { limitOf } from '../../common/http';
import { ZodBody } from '../../common/zod.pipe';
import { OrganizationsService } from './organizations.service';

const Name = z.object({ name: z.string().trim().min(1).max(120) });
const RoleBody = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(300).optional(), permissions: z.array(z.string()).max(200) });

@Controller()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('organizations')
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.list(user.id);
  }

  @Post('organizations')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodBody(Name)) body: { name: string }) {
    const org = await this.orgs.createWithOwner(body.name, user.id);
    return { id: org.id, name: org.name, slug: org.slug, planKey: org.planKey };
  }

  @Get('permissions')
  permissions() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  }

  @Access('organization.read', 'organization', 'orgId')
  @Get('organizations/:orgId')
  get(@Param('orgId') orgId: string) {
    return this.orgs.get(orgId);
  }

  @Access('organization.update', 'organization', 'orgId')
  @Patch('organizations/:orgId')
  update(@Param('orgId') orgId: string, @Body(new ZodBody(Name.partial())) body: { name?: string }, @CurrentUser() user: AuthUser) {
    return this.orgs.update(orgId, body, user);
  }

  @Access('organization.read', 'organization', 'orgId')
  @Get('organizations/:orgId/usage')
  usage(@Param('orgId') orgId: string) {
    return this.orgs.usage(orgId);
  }

  @Access('organization.read', 'organization', 'orgId')
  @Get('organizations/:orgId/members')
  members(@Param('orgId') orgId: string) {
    return this.orgs.members(orgId);
  }

  @Access('role.manage', 'organization', 'orgId')
  @Patch('organizations/:orgId/members/:memberId')
  updateMember(@Param('orgId') orgId: string, @Param('memberId') memberId: string, @Body(new ZodBody(z.object({ roleId: z.string().optional(), websiteIds: z.array(z.string()).max(500).optional() }))) body: { roleId?: string; websiteIds?: string[] }, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.orgs.updateMember(orgId, memberId, body, user, access);
  }

  @Access('user.remove', 'organization', 'orgId')
  @HttpCode(204)
  @Delete('organizations/:orgId/members/:memberId')
  removeMember(@Param('orgId') orgId: string, @Param('memberId') memberId: string, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.orgs.removeMember(orgId, memberId, user, access);
  }

  @Access('user.invite', 'organization', 'orgId')
  @Get('organizations/:orgId/invitations')
  invitations(@Param('orgId') orgId: string) {
    return this.orgs.invitations(orgId);
  }

  @Access('user.invite', 'organization', 'orgId')
  @Post('organizations/:orgId/invitations')
  invite(@Param('orgId') orgId: string, @Body(new ZodBody(z.object({ email: z.string().trim().email().max(254), roleId: z.string() }))) body: { email: string; roleId: string }, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.orgs.invite(orgId, body, user, access);
  }

  @Access('user.invite', 'organization', 'orgId')
  @HttpCode(204)
  @Delete('organizations/:orgId/invitations/:id')
  revokeInvitation(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.orgs.revokeInvitation(orgId, id);
  }

  @HttpCode(200)
  @Post('invitations/accept')
  accept(@Body(new ZodBody(z.object({ token: z.string().min(10) }))) body: { token: string }, @CurrentUser() user: AuthUser) {
    return this.orgs.acceptInvitation(body.token, user);
  }

  @Access('organization.read', 'organization', 'orgId')
  @Get('organizations/:orgId/roles')
  roles(@Param('orgId') orgId: string) {
    return this.orgs.roles(orgId);
  }

  @Access('role.manage', 'organization', 'orgId')
  @Post('organizations/:orgId/roles')
  createRole(@Param('orgId') orgId: string, @Body(new ZodBody(RoleBody)) body: z.infer<typeof RoleBody>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.orgs.createRole(orgId, body, user, access);
  }

  @Access('role.manage', 'organization', 'orgId')
  @Patch('organizations/:orgId/roles/:roleId')
  updateRole(@Param('orgId') orgId: string, @Param('roleId') roleId: string, @Body(new ZodBody(RoleBody.partial())) body: Partial<z.infer<typeof RoleBody>>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.orgs.updateRole(orgId, roleId, body, user, access);
  }

  @Access('role.manage', 'organization', 'orgId')
  @HttpCode(204)
  @Delete('organizations/:orgId/roles/:roleId')
  deleteRole(@Param('orgId') orgId: string, @Param('roleId') roleId: string, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.orgs.deleteRole(orgId, roleId, user, access);
  }

  @Access('audit.read', 'organization', 'orgId')
  @Get('organizations/:orgId/audit-logs')
  auditLogs(@Param('orgId') orgId: string, @Query() q: Record<string, string>) {
    // websiteId is only a filter inside the already-authorized organization.
    return this.orgs.auditLogs(orgId, { websiteId: q.websiteId, action: q.action, cursor: q.cursor, limit: limitOf(q.limit) });
  }
}
