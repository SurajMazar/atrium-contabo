import { Injectable } from '@nestjs/common';
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
    const w = (x: { websiteId: string; website: { organizationId: string } } | null) => (x ? { organizationId: x.website.organizationId, websiteId: x.websiteId } : null);
    const sel = { websiteId: true, website: { select: { organizationId: true } } } as const;
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
        const m = await db.media.findFirst({ where: { id, deletedAt: null }, select: { organizationId: true, websiteId: true } });
        found = m;
        break;
      }
      case 'mediaFolder':
        found = await db.mediaFolder.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
        break;
      case 'webhook':
        found = await db.webhook.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
        break;
      case 'webhookDelivery': {
        const d = await db.webhookDelivery.findUnique({ where: { id }, select: { webhook: { select: { organizationId: true, websiteId: true } } } });
        found = d?.webhook ?? null;
        break;
      }
      case 'emailProvider':
        found = await db.emailProvider.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
        break;
      case 'smsProvider':
        found = await db.smsProvider.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
        break;
      case 'storageProvider':
        found = await db.storageProvider.findUnique({ where: { id }, select: { organizationId: true } });
        break;
      case 'integration':
        found = await db.integration.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
        break;
      case 'aiGeneration':
        found = await db.aiGeneration.findUnique({ where: { id }, select: { organizationId: true, websiteId: true } });
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
      select: { id: true, roleId: true, websiteIds: true, role: { select: { key: true, permissions: { select: { permissionKey: true } } } } },
    });
    if (!m) return null;
    return { memberId: m.id, roleId: m.roleId, roleKey: m.role.key, permissions: new Set(m.role.permissions.map((p) => p.permissionKey)), websiteIds: m.websiteIds };
  }

  /** Throws unless the user may perform `permission` within the owner tenant. */
  async authorize(user: AuthUser, owner: Owner, permission?: Permission | Permission[]): Promise<AccessContext> {
    const m = await this.membership(user.id, owner.organizationId);
    if (!m) {
      if (user.isSuperAdmin) return { organizationId: owner.organizationId, websiteId: owner.websiteId ?? undefined, permissions: new Set(['*']), superAdminOverride: true };
      throw notFound('Resource'); // don't reveal existence across tenants
    }
    if (owner.websiteId && m.websiteIds.length > 0 && !m.websiteIds.includes(owner.websiteId)) throw forbidden('You do not have access to this website');
    if (permission && !hasPermission(m.permissions, permission)) throw forbidden(`Missing permission: ${[permission].flat().join(', ')}`);
    return { organizationId: owner.organizationId, websiteId: owner.websiteId ?? undefined, permissions: m.permissions };
  }

  async check(user: AuthUser, resource: ResourceKind, id: string, permission?: Permission | Permission[]): Promise<AccessContext> {
    return this.authorize(user, await this.owner(resource, id), permission);
  }

  can(access: AccessContext, permission: Permission): boolean {
    return access.permissions.has('*') || access.permissions.has(permission);
  }
}
