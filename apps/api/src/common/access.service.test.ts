import { describe, expect, it } from 'vitest';
import { AccessService } from './access.service';
import type { AuthUser } from './decorators';

const user: AuthUser = { id: 'u1', email: 'a@b.c', name: 'A', isSuperAdmin: false, sessionId: 's' };

function svc(member: null | { permissions: string[]; websiteIds?: string[] }) {
  const prisma = {
    client: {
      organizationMember: {
        findUnique: async () => (member ? { id: 'm', roleId: 'r', websiteIds: member.websiteIds ?? [], role: { key: 'custom', permissions: member.permissions.map((p) => ({ permissionKey: p })) } } : null),
      },
    },
  };
  return new AccessService(prisma as never);
}

describe('AccessService.authorize', () => {
  it('hides other tenants behind 404', async () => {
    await expect(svc(null).authorize(user, { organizationId: 'o2' }, 'website.read')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('enforces permission keys, not role names', async () => {
    await expect(svc({ permissions: ['website.read'] }).authorize(user, { organizationId: 'o1' }, 'page.publish')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ctx = await svc({ permissions: ['website.read', 'page.publish'] }).authorize(user, { organizationId: 'o1', websiteId: 'w1' }, ['website.read', 'page.publish']);
    expect(ctx.organizationId).toBe('o1');
  });
  it('applies resource-level website scoping', async () => {
    await expect(svc({ permissions: ['website.read'], websiteIds: ['w2'] }).authorize(user, { organizationId: 'o1', websiteId: 'w1' }, 'website.read')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc({ permissions: ['website.read'], websiteIds: ['w1'] }).authorize(user, { organizationId: 'o1', websiteId: 'w1' }, 'website.read')).resolves.toBeTruthy();
  });
  it('lets super admins through with an audited override flag', async () => {
    const ctx = await svc(null).authorize({ ...user, isSuperAdmin: true }, { organizationId: 'o9' }, 'website.delete');
    expect(ctx.superAdminOverride).toBe(true);
  });
});
