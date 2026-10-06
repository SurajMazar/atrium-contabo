import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DEFAULT_PLANS, DEFAULT_ROLES, PERMISSIONS, slugify, type Permission } from '@atrium/schema';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AccessContext, AuthUser } from '../../common/decorators';
import { badRequest, conflict, forbidden, limitExceeded, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { escapeHtml } from '../../common/html';
import { assertPasswordStrength, generatePassword } from '../../common/passwords';
import { hashToken, randomToken } from '../../common/tokens';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly queues: QueueService) {}

  private get db() {
    return this.prisma.client;
  }

  async uniqueSlug(name: string) {
    const base = slugify(name) || 'org';
    let slug = base;
    for (let i = 2; await this.db.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  /** Create an organization with default roles, a default workspace and the user as owner. */
  async createWithOwner(name: string, userId: string, planKey = 'starter') {
    return this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name, slug: await this.uniqueSlug(name), planKey } });
      let ownerRoleId = '';
      for (const r of DEFAULT_ROLES) {
        const role = await tx.role.create({ data: { organizationId: org.id, key: r.key, name: r.name, description: r.description, isSystem: true, permissions: { create: r.permissions.map((p) => ({ permissionKey: p })) } } });
        if (r.key === 'owner') ownerRoleId = role.id;
      }
      await tx.organizationMember.create({ data: { organizationId: org.id, userId, roleId: ownerRoleId } });
      await tx.workspace.create({ data: { organizationId: org.id, name: 'Default' } });
      return org;
    });
  }

  list(userId: string) {
    return this.db.organization
      .findMany({ where: { members: { some: { userId } }, suspendedAt: null }, orderBy: { createdAt: 'asc' } })
      .then((rows) => rows.map((o) => ({ id: o.id, name: o.name, slug: o.slug, planKey: o.planKey })));
  }

  async get(orgId: string) {
    const o = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    return { id: o.id, name: o.name, slug: o.slug, planKey: o.planKey, createdAt: o.createdAt.toISOString() };
  }

  async update(orgId: string, body: { name?: string }, user: AuthUser) {
    const o = await this.db.organization.update({ where: { id: orgId }, data: body });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'organization.updated', resourceType: 'organization', resourceId: orgId, summary: `${user.name} updated organization settings` });
    return { id: o.id, name: o.name, slug: o.slug, planKey: o.planKey };
  }

  async limits(orgId: string): Promise<Record<string, number>> {
    const o = await this.db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { plan: true } });
    const planLimits = (o.plan?.limits as Record<string, number>) ?? DEFAULT_PLANS[0]!.limits;
    return { ...planLimits, ...((o.limits as Record<string, number> | null) ?? {}) };
  }

  async usage(orgId: string) {
    const o = await this.db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { plan: true } });
    const period = new Date().toISOString().slice(0, 7);
    const monthStart = new Date(`${period}-01T00:00:00Z`);
    const [websites, members, storage, ai, submissions, domains] = await Promise.all([
      this.db.website.count({ where: { organizationId: orgId, deletedAt: null } }),
      this.db.organizationMember.count({ where: { organizationId: orgId } }),
      this.db.media.aggregate({ where: { organizationId: orgId, deletedAt: null }, _sum: { size: true } }),
      this.db.aiUsage.findUnique({ where: { organizationId_period: { organizationId: orgId, period } } }),
      this.db.formSubmission.count({ where: { website: { organizationId: orgId }, createdAt: { gte: monthStart } } }),
      this.db.domain.count({ where: { website: { organizationId: orgId } } }),
    ]);
    return {
      plan: { key: o.planKey, name: o.plan?.name ?? o.planKey },
      limits: await this.limits(orgId),
      usage: {
        websites, members, storageMb: Math.round(((storage._sum.size ?? 0) / 1_048_576) * 10) / 10,
        aiRequests: ai?.requests ?? 0, aiTokens: (ai?.inputTokens ?? 0) + (ai?.outputTokens ?? 0), aiCostUsd: Number(ai?.costUsd ?? 0),
        submissions, customDomains: domains,
      },
    };
  }

  /** Throws LIMIT_EXCEEDED when a plan limit would be exceeded. */
  async assertLimit(orgId: string, key: 'websites' | 'members' | 'customDomains' | 'storageMb', adding = 1) {
    const [limits, u] = await Promise.all([this.limits(orgId), this.usage(orgId)]);
    const current = (u.usage as Record<string, number>)[key] ?? 0;
    if (limits[key] !== undefined && current + adding > limits[key]!) {
      throw limitExceeded(`Your plan allows ${limits[key]} ${key}. Upgrade to add more.`, { key, limit: limits[key], current });
    }
  }

  // ── members ──
  async members(orgId: string) {
    const rows = await this.db.organizationMember.findMany({ where: { organizationId: orgId }, include: { user: true, role: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((m) => ({ id: m.id, user: { id: m.user.id, email: m.user.email, name: m.user.name, avatarUrl: m.user.avatarUrl }, role: { id: m.role.id, key: m.role.key, name: m.role.name }, websiteIds: m.websiteIds, createdAt: m.createdAt.toISOString() }));
  }

  // ── privilege ceiling ──
  // Nobody can grant, assign, edit or remove access beyond what they hold themselves,
  // and only owners can create owners or act on owners.

  private isOwner(access: AccessContext) {
    return access.roleKey === 'owner' || access.permissions.has('*');
  }

  private async rolePermissions(roleId: string): Promise<string[]> {
    return (await this.db.rolePermission.findMany({ where: { roleId }, select: { permissionKey: true } })).map((p) => p.permissionKey);
  }

  private async assertCanGrantRole(access: AccessContext, role: { id: string; key: string }, action: string) {
    if (role.key === 'owner' && !this.isOwner(access)) throw forbidden(`Only organization owners can ${action} the Owner role`);
    const perms = await this.rolePermissions(role.id);
    const extra = access.permissions.has('*') ? [] : perms.filter((p) => !access.permissions.has(p));
    if (extra.length) throw forbidden(`You cannot ${action} a role with permissions you do not have: ${extra.join(', ')}`);
  }

  private assertCanGrantPermissions(access: AccessContext, perms: string[]) {
    const extra = access.permissions.has('*') ? [] : perms.filter((p) => !access.permissions.has(p));
    if (extra.length) throw forbidden(`You cannot grant permissions you do not have: ${extra.join(', ')}`);
  }

  async updateMember(orgId: string, memberId: string, body: { roleId?: string; websiteIds?: string[] }, user: AuthUser, access: AccessContext) {
    const member = await this.db.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId }, include: { role: true } });
    if (!member) throw notFound('Member');
    if (member.userId === user.id && !access.permissions.has('*')) throw forbidden('You cannot change your own access. Ask another administrator.');
    // Acting on someone means being at least as privileged as their current role.
    await this.assertCanGrantRole(access, member.role, 'manage members with');
    if (body.roleId) {
      const role = await this.db.role.findFirst({ where: { id: body.roleId, organizationId: orgId } });
      if (!role) throw badRequest('Role not found in this organization');
      await this.assertCanGrantRole(access, role, 'assign');
      if (member.role.key === 'owner' && role.key !== 'owner') await this.assertAnotherOwner(orgId, memberId);
    }
    if (body.websiteIds) await this.assertWebsiteAccessList(orgId, body.websiteIds, access);
    await this.db.organizationMember.update({ where: { id: memberId }, data: { roleId: body.roleId, websiteIds: body.websiteIds } });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'member.updated', resourceType: 'member', resourceId: memberId, summary: `${user.name} changed access for a member`, metadata: { roleId: body.roleId, previousRoleId: member.roleId, websiteIds: body.websiteIds } });
    return (await this.members(orgId)).find((m) => m.id === memberId);
  }

  private async assertAnotherOwner(orgId: string, exceptMemberId: string) {
    const owners = await this.db.organizationMember.count({ where: { organizationId: orgId, role: { key: 'owner' }, id: { not: exceptMemberId } } });
    if (owners === 0) throw badRequest('An organization must keep at least one owner');
  }

  /**
   * Website access handed to someone: websites of this organization only, and someone who is
   * themselves limited to some websites can neither grant "all websites" nor websites outside their own.
   */
  private async assertWebsiteAccessList(orgId: string, websiteIds: string[], access: AccessContext) {
    const ids = [...new Set(websiteIds)];
    if (ids.length) {
      const count = await this.db.website.count({ where: { id: { in: ids }, organizationId: orgId, deletedAt: null } });
      if (count !== ids.length) throw badRequest('Unknown website in access list');
    }
    if (access.permissions.has('*') || access.websiteIds.length === 0) return;
    if (!ids.length) throw forbidden('You can only give access to the websites you have access to');
    const outside = ids.filter((id) => !access.websiteIds.includes(id));
    if (outside.length) throw forbidden('You can only give access to the websites you have access to');
  }

  async removeMember(orgId: string, memberId: string, user: AuthUser, access: AccessContext) {
    const member = await this.db.organizationMember.findFirst({ where: { id: memberId, organizationId: orgId }, include: { role: true } });
    if (!member) throw notFound('Member');
    // Leaving an organization yourself is always allowed (except as its last owner).
    if (member.userId !== user.id) await this.assertCanGrantRole(access, member.role, 'remove members with');
    if (member.role.key === 'owner') await this.assertAnotherOwner(orgId, memberId);
    await this.db.organizationMember.delete({ where: { id: memberId } });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'member.removed', resourceType: 'member', resourceId: memberId, summary: `${user.name} removed a member` });
  }

  /**
   * Add someone without an email invitation: creates their account with a password the admin sets
   * (or a generated one, returned once) and adds them with the role and website access chosen.
   * Same rules as inviting — role ceiling, website scope, seat limit. Existing accounts are never
   * pulled in this way (they must accept an invitation), so nobody joins an organization unasked.
   */
  async addMember(orgId: string, body: { email: string; name: string; roleId: string; websiteIds?: string[]; password?: string }, user: AuthUser, access: AccessContext) {
    const email = body.email.trim().toLowerCase();
    const role = await this.db.role.findFirst({ where: { id: body.roleId, organizationId: orgId } });
    if (!role) throw badRequest('Role not found');
    await this.assertCanGrantRole(access, role, 'add people to');
    if (role.key === 'owner' && body.websiteIds?.length) throw badRequest('Owners always have access to every website');
    const websiteIds = role.key === 'owner' ? [] : [...new Set(body.websiteIds ?? [])];
    await this.assertWebsiteAccessList(orgId, websiteIds, access);
    if (await this.db.user.findUnique({ where: { email }, select: { id: true } })) {
      throw conflict('This person already has an account. Send them an invitation instead.', { reason: 'ACCOUNT_EXISTS' });
    }
    const pending = await this.db.invitation.count({ where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } } });
    await this.assertLimit(orgId, 'members', 1 + pending);
    const generated = !body.password;
    const password = body.password ?? generatePassword();
    assertPasswordStrength(password);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const created = await this.db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, name: body.name.trim(), passwordHash } });
      const m = await tx.organizationMember.create({ data: { organizationId: orgId, userId: u.id, roleId: role.id, websiteIds } });
      // A pending invitation for the same address is superseded.
      await tx.invitation.deleteMany({ where: { organizationId: orgId, email, acceptedAt: null } });
      return { userId: u.id, memberId: m.id };
    });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'member.added', resourceType: 'member', resourceId: created.memberId, summary: `${user.name} added ${email} as ${role.name} (account created without an invitation)`, metadata: { roleId: role.id, websiteIds } });
    await this.queues.emit(orgId, null, 'user.added', { email, role: role.key });
    const member = (await this.members(orgId)).find((m) => m.id === created.memberId);
    return { member, ...(generated ? { password } : {}) };
  }

  // ── invitations ──
  async invitations(orgId: string) {
    const rows = await this.db.invitation.findMany({ where: { organizationId: orgId, acceptedAt: null }, include: { role: true }, orderBy: { createdAt: 'desc' } });
    return rows.map((i) => ({ id: i.id, email: i.email, role: { id: i.role.id, key: i.role.key, name: i.role.name }, websiteIds: i.websiteIds, expiresAt: i.expiresAt.toISOString(), acceptedAt: null, createdAt: i.createdAt.toISOString() }));
  }

  async invite(orgId: string, body: { email: string; roleId: string; websiteIds?: string[] }, user: AuthUser, access: AccessContext) {
    const email = body.email.trim().toLowerCase();
    const role = await this.db.role.findFirst({ where: { id: body.roleId, organizationId: orgId } });
    if (!role) throw badRequest('Role not found');
    await this.assertCanGrantRole(access, role, 'invite people to');
    // Owners always see every website; a scoped inviter's invitees are scoped too.
    const websiteIds = role.key === 'owner' ? [] : [...new Set(body.websiteIds ?? (access.permissions.has('*') ? [] : access.websiteIds))];
    if (role.key === 'owner' && body.websiteIds?.length) throw badRequest('Owners always have access to every website');
    await this.assertWebsiteAccessList(orgId, websiteIds, access);
    const existing = await this.db.organizationMember.findFirst({ where: { organizationId: orgId, user: { email } } });
    if (existing) throw conflict('This person is already a member');
    // Pending invitations count toward the seat limit, and invitation email volume is capped per day.
    const pending = await this.db.invitation.count({ where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } } });
    await this.assertLimit(orgId, 'members', 1 + pending);
    const today = await this.db.invitation.count({ where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= 100) throw limitExceeded('Too many invitations sent today. Try again tomorrow.');
    await this.db.invitation.deleteMany({ where: { organizationId: orgId, email, acceptedAt: null } });
    const token = randomToken();
    const inv = await this.db.invitation.create({ data: { organizationId: orgId, email, roleId: role.id, websiteIds, tokenHash: hashToken(token), invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const url = `${env().ADMIN_URL}/invite/${token}`;
    await this.queues.platformEmail({
      to: [{ email }],
      // Names are user-controlled: strip line breaks from the subject and escape everything in HTML.
      subject: `${user.name} invited you to ${org.name} on Atrium`.replace(/[\r\n]+/g, ' ').slice(0, 200),
      text: `${user.name} invited you to join ${org.name} as ${role.name}.\n\nAccept: ${url}\n\nThis invitation expires in 7 days.`,
      html: `<p>${escapeHtml(user.name)} invited you to join <strong>${escapeHtml(org.name)}</strong> as ${escapeHtml(role.name)}.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#1b1b19;color:#fff;text-decoration:none;border-radius:6px">Accept invitation</a></p><p style="color:#666">This invitation expires in 7 days.</p>`,
    });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'user.invited', resourceType: 'invitation', resourceId: inv.id, summary: `${user.name} invited ${email}` });
    await this.queues.emit(orgId, null, 'user.invited', { email, role: role.key });
    return { id: inv.id, email, role: { id: role.id, key: role.key, name: role.name }, websiteIds, expiresAt: inv.expiresAt.toISOString(), acceptedAt: null, createdAt: inv.createdAt.toISOString(), ...(env().NODE_ENV !== 'production' ? { devAcceptUrl: url } : {}) };
  }

  async revokeInvitation(orgId: string, id: string) {
    await this.db.invitation.deleteMany({ where: { id, organizationId: orgId } });
  }

  async acceptInvitation(token: string, user: AuthUser) {
    const inv = await this.db.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw badRequest('This invitation is invalid or has expired');
    if (inv.email !== user.email.toLowerCase()) throw forbidden('This invitation was sent to a different email address. Sign in with that address to accept it.');
    if (env().NODE_ENV === 'production') {
      const u = await this.db.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true } });
      if (!u.emailVerifiedAt) throw forbidden('Confirm your email address before joining an organization. Check your inbox for the confirmation link.');
    }
    await this.db.$transaction(async (tx) => {
      // Single use under concurrency.
      const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw badRequest('This invitation is invalid or has expired');
      await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } }, create: { organizationId: inv.organizationId, userId: user.id, roleId: inv.roleId, websiteIds: inv.websiteIds }, update: {} });
    });
    await this.audit.log({ organizationId: inv.organizationId, actor: user, action: 'invitation.accepted', resourceType: 'invitation', resourceId: inv.id, summary: `${user.name} joined the organization` });
    return { organizationId: inv.organizationId };
  }

  // ── roles ──
  async roles(orgId: string) {
    const rows = await this.db.role.findMany({ where: { organizationId: orgId }, include: { permissions: true, _count: { select: { members: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, permissions: r.permissions.map((p) => p.permissionKey), memberCount: r._count.members }));
  }

  private cleanPermissions(perms: string[]): Permission[] {
    const valid = new Set(Object.keys(PERMISSIONS));
    const bad = perms.filter((p) => !valid.has(p));
    if (bad.length) throw badRequest(`Unknown permissions: ${bad.join(', ')}`);
    return [...new Set(perms)] as Permission[];
  }

  async createRole(orgId: string, body: { name: string; description?: string; permissions: string[] }, user: AuthUser, access: AccessContext) {
    const perms = this.cleanPermissions(body.permissions);
    this.assertCanGrantPermissions(access, perms);
    let key = slugify(body.name).replace(/-/g, '_') || 'custom';
    for (let i = 2; await this.db.role.findUnique({ where: { organizationId_key: { organizationId: orgId, key } } }); i++) key = `${slugify(body.name).replace(/-/g, '_')}_${i}`;
    const role = await this.db.role.create({ data: { organizationId: orgId, key, name: body.name, description: body.description, permissions: { create: perms.map((p) => ({ permissionKey: p })) } } });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'role.created', resourceType: 'role', resourceId: role.id, summary: `${user.name} created role ${role.name}` });
    return (await this.roles(orgId)).find((r) => r.id === role.id);
  }

  async updateRole(orgId: string, roleId: string, body: { name?: string; description?: string; permissions?: string[] }, user: AuthUser, access: AccessContext) {
    const role = await this.db.role.findFirst({ where: { id: roleId, organizationId: orgId } });
    if (!role) throw notFound('Role');
    if (role.key === 'owner' && body.permissions) throw badRequest('Owner permissions cannot be changed');
    if (role.isSystem && body.permissions && !this.isOwner(access)) throw forbidden('Only owners can change the permissions of built-in roles');
    await this.assertCanGrantRole(access, role, 'edit');
    if (body.permissions) this.assertCanGrantPermissions(access, this.cleanPermissions(body.permissions));
    if (access.roleKey === role.key && body.permissions && !this.isOwner(access)) throw forbidden('You cannot change the permissions of your own role');
    await this.db.$transaction(async (tx) => {
      await tx.role.update({ where: { id: roleId }, data: { name: body.name, description: body.description } });
      if (body.permissions) {
        const perms = this.cleanPermissions(body.permissions);
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionKey: p })) });
      }
    });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'role.updated', resourceType: 'role', resourceId: roleId, summary: `${user.name} updated role ${role.name}`, metadata: { permissions: body.permissions } });
    return (await this.roles(orgId)).find((r) => r.id === roleId);
  }

  async deleteRole(orgId: string, roleId: string, user: AuthUser, access: AccessContext) {
    const role = await this.db.role.findFirst({ where: { id: roleId, organizationId: orgId }, include: { _count: { select: { members: true } } } });
    if (!role) throw notFound('Role');
    await this.assertCanGrantRole(access, role, 'delete');
    if (role.isSystem) throw badRequest('System roles cannot be deleted');
    if (role._count.members > 0) throw badRequest('Reassign members before deleting this role');
    await this.db.role.delete({ where: { id: roleId } });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'role.deleted', resourceType: 'role', resourceId: roleId, summary: `${user.name} deleted role ${role.name}` });
  }

  async auditLogs(orgId: string, q: { websiteId?: string; action?: string; cursor?: string; limit: number }) {
    const rows = await this.db.auditLog.findMany({
      where: { organizationId: orgId, websiteId: q.websiteId, action: q.action ? { startsWith: q.action } : undefined },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((a) => ({ id: a.id, action: a.action, summary: a.summary, actorType: a.actorType, actorName: a.actorName, resourceType: a.resourceType, resourceId: a.resourceId, ip: a.ip, websiteId: a.websiteId, metadata: a.metadata, createdAt: a.createdAt.toISOString() }));
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }
}
