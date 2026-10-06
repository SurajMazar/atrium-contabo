import { Injectable } from '@nestjs/common';
import { missingRequirements, type ChangeRequirement } from '@atrium/builder-core';
import { hasPermission, type Permission } from '@atrium/schema';
import { forbidden, notFound } from './errors';
import type { AccessContext, AuthUser, ResourceKind } from './decorators';
import { PrismaService } from './prisma.service';

interface Owner {
  organizationId: string;
  websiteId?: string | null;
}

export interface MembershipInfo {
  memberId: string;
  roleId: string;
  roleKey: string;
  permissions: Set<string>;
  websiteIds: string[];
  suspended?: boolean;
}

/**
 * Members limited to specific websites (OrganizationMember.websiteIds) work inside those websites
 * only. Organization-level routes stay open to them just for what working on a website needs
 * (the organization's name, their own website list, media, AI); organization-wide resources that
 * belong to no website (shared media and folders, org webhooks/providers/integrations, templates)
 * are read-only for them.
 */
const SCOPED_ORG_ROUTE: ReadonlySet<string> = new Set(['organization.read', 'website.read', 'media.read', 'media.upload', 'ai.use']);
const SCOPED_SHARED_READ: ReadonlySet<string> = new Set(['organization.read', 'website.read', 'media.read']);

/** True when the member only has access to some websites of the organization. */
export const isWebsiteScoped = (access: Pick<AccessContext, 'websiteIds' | 'permissions'>) => access.websiteIds.length > 0 && !access.permissions.has('*');

/** Throws FORBIDDEN listing every change the actor is not allowed to make. */
export function assertRequirements(access: Pick<AccessContext, 'permissions'>, reqs: ChangeRequirement[]): void {
  const missing = missingRequirements(reqs, access.permissions);
  if (missing.length) {
    throw forbidden(`You are not allowed to ${missing.map((m) => m.reason).join(', ')} (requires ${[...new Set(missing.map((m) => m.anyOf.join(' or ')))].join('; ')})`, { missing });
  }
}

/** Resolves resource ownership from the database and enforces RBAC + website scoping. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async owner(resource: ResourceKind, id: string): Promise<Owner> {
    const db = this.db;
    // Children of a soft-deleted website are treated as gone (not readable, editable or deployable by id).
    const w = (x: { websiteId: string; website: { organizationId: string; deletedAt: Date | null } } | null) => (x && !x.website.deletedAt ? { organizationId: x.website.organizationId, websiteId: x.websiteId } : null);
    const sel = { websiteId: true, website: { select: { organizationId: true, deletedAt: true } } } as const;
    const liveSite = async (o: { organizationId: string; websiteId: string | null } | null): Promise<Owner | null> => {
      if (!o?.websiteId) return o;
      const site = await db.website.findUnique({ where: { id: o.websiteId }, select: { deletedAt: true } });
      return site && !site.deletedAt ? o : null;
    };
    let found: Owner | null = null;
    switch (resource) {
      case 'organization':
        found = (await db.organization.findUnique({ where: { id }, select: { id: true } })) ? { organizationId: id } : null;
        break;
      case 'website': {
        const site = await db.website.findFirst({ where: { id, deletedAt: null }, select: { organizationId: true } });
        found = site ? { organizationId: site.organizationId, websiteId: id } : null;
        break;
      }
      case 'page':
        found = w(await db.page.findUnique({ where: { id }, select: sel }));
        break;
      case 'pageVersion': {
        const v = await db.pageVersion.findUnique({ where: { id }, select: { page: { select: sel } } });
        found = v ? w(v.page) : null;
        break;
      }
      case 'form':
        found = w(await db.form.findUnique({ where: { id }, select: sel }));
        break;
      case 'submission':
        found = w(await db.formSubmission.findUnique({ where: { id }, select: sel }));
        break;
      case 'collection':
        found = w(await db.collection.findUnique({ where: { id }, select: sel }));
        break;
      case 'collectionItem': {
        const it = await db.collectionItem.findUnique({ where: { id }, select: { collection: { select: sel } } });
        found = it ? w(it.collection) : null;
        break;
      }
      case 'globalSection':
        found = w(await db.globalSection.findUnique({ where: { id }, select: sel }));
        break;
      case 'domain':
        found = w(await db.domain.findUnique({ where: { id }, select: sel }));
        break;
      case 'deployment':
        found = w(await db.deployment.findUnique({ where: { id }, select: sel }));
        break;
      case 'media': {
        // Media is an organization asset (websiteId is only a tag), so it stays manageable after a site is deleted.
        found = await db.media.findFirst({ where: { id, deletedAt: null }, select: { organizationId: true, websiteId: true } });
        break;
      }
      case 'mediaFolder':
        found = await db.mediaFolder.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
        break;
      case 'webhook':
        found = await liveSite(await db.webhook.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } }));
        break;
      case 'webhookDelivery': {
        const d = await db.webhookDelivery.findUnique({ where: { id }, select: { webhook: { select: { organizationId: true, websiteId: true } } } });
        found = await liveSite(d?.webhook ?? null);
        break;
      }
      case 'emailProvider':
        found = await liveSite(await db.emailProvider.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } }));
        break;
      case 'smsProvider':
        found = await liveSite(await db.smsProvider.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } }));
        break;
      case 'storageProvider':
        found = await db.storageProvider.findUnique({ where: { id }, select: { organizationId: true } });
        break;
      case 'integration':
        found = await liveSite(await db.integration.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } }));
        break;
      case 'aiGeneration':
        found = await liveSite(await db.aiGeneration.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } }));
        break;
      case 'template': {
        const t = await db.template.findUnique({ where: { id }, select: { organizationId: true } });
        if (t && !t.organizationId) throw forbidden('Platform templates are read-only');
        found = t ? { organizationId: t.organizationId! } : null;
        break;
      }
    }
    if (!found) throw notFound(resource);
    return found;
  }

  async membership(userId: string, organizationId: string): Promise<MembershipInfo | null> {
    const m = await this.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, roleId: true, websiteIds: true, organization: { select: { suspendedAt: true } }, role: { select: { key: true, permissions: { select: { permissionKey: true } } } } },
    });
    if (!m) return null;
    return { memberId: m.id, roleId: m.roleId, roleKey: m.role.key, permissions: new Set(m.role.permissions.map((p) => p.permissionKey)), websiteIds: m.websiteIds, suspended: !!m.organization?.suspendedAt };
  }

  /** Throws unless the user may perform `permission` within the owner tenant. */
  async authorize(user: AuthUser, owner: Owner, permission?: Permission | Permission[]): Promise<AccessContext> {
    const m = await this.membership(user.id, owner.organizationId);
    if (!m) {
      if (user.isSuperAdmin) return { organizationId: owner.organizationId, websiteId: owner.websiteId ?? undefined, permissions: new Set(['*']), websiteIds: [], superAdminOverride: true };
      throw notFound('Resource'); // don't reveal existence across tenants
    }
    if (m.suspended) throw forbidden('This organization is suspended. Contact support.');
    if (owner.websiteId && m.websiteIds.length > 0 && !m.websiteIds.includes(owner.websiteId)) throw forbidden('You do not have access to this website');
    if (permission && !hasPermission(m.permissions, permission)) throw forbidden(`Missing permission: ${[permission].flat().join(', ')}`);
    return { organizationId: owner.organizationId, websiteId: owner.websiteId ?? undefined, permissions: m.permissions, roleKey: m.roleKey, websiteIds: m.websiteIds };
  }

  /**
   * Org-level routes that take a websiteId in the query/body must still honour
   * per-member website restrictions, and the website must belong to the tenant.
   */
  async assertWebsiteInScope(access: AccessContext, websiteId: string | null | undefined): Promise<void> {
    if (!websiteId) return;
    if (access.websiteIds.length > 0 && !access.websiteIds.includes(websiteId)) throw forbidden('You do not have access to this website');
    const site = await this.db.website.findFirst({ where: { id: websiteId, organizationId: access.organizationId, deletedAt: null }, select: { id: true } });
    if (!site) throw notFound('Website');
  }

  /** Throws FORBIDDEN listing every change the actor is not allowed to make. */
  assertChanges(access: AccessContext, reqs: ChangeRequirement[]): void {
    assertRequirements(access, reqs);
  }

  async check(user: AuthUser, resource: ResourceKind, id: string, permission?: Permission | Permission[]): Promise<AccessContext> {
    const owner = await this.owner(resource, id);
    const access = await this.authorize(user, owner, permission);
    if (isWebsiteScoped(access) && !owner.websiteId) {
      const allowed = resource === 'organization' ? SCOPED_ORG_ROUTE : SCOPED_SHARED_READ;
      if ([permission ?? []].flat().some((p) => !allowed.has(p))) throw forbidden('You only have access to specific websites');
    }
    return access;
  }

  /** Organization-wide views (members, usage, …) are for members with access to every website. */
  assertOrganizationWide(access: AccessContext): void {
    if (isWebsiteScoped(access)) throw forbidden('You only have access to specific websites');
  }

  /**
   * The website an org-level write (upload, new folder) is filed under. Website-scoped members must
   * file it under one of their websites; with exactly one, it is used by default.
   */
  async websiteForWrite(access: AccessContext, websiteId: string | null | undefined): Promise<string | undefined> {
    if (!websiteId && isWebsiteScoped(access)) {
      if (access.websiteIds.length !== 1) throw forbidden('Choose one of your websites');
      websiteId = access.websiteIds[0];
    }
    await this.assertWebsiteInScope(access, websiteId);
    return websiteId ?? undefined;
  }

  can(access: AccessContext, permission: Permission): boolean {
    return access.permissions.has('*') || access.permissions.has(permission);
  }

  /** Every permission in `perms` is held by the actor (`*` = all). */
  holdsAll(access: AccessContext, perms: Iterable<string>): boolean {
    if (access.permissions.has('*')) return true;
    for (const p of perms) if (!access.permissions.has(p)) return false;
    return true;
  }
}
