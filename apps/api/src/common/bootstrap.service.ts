import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DEFAULT_PLANS, DEFAULT_ROLES, FEATURE_FLAGS, PERMISSIONS } from '@atrium/schema';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';

const EXAMPLE_ADMIN_PASSWORD = 'Atrium!2026';

/**
 * Runs on every API start and only ever adds what is missing — existing rows are never changed or
 * removed (plans keep their edited limits, roles keep their edited permissions, users keep their
 * passwords):
 *   - reference data: permissions, plans, feature flags
 *   - built-in roles missing from existing organizations (e.g. a role added in a newer release)
 *   - the first super admin, from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, while the platform has none
 * Set ATRIUM_BOOTSTRAP=0 to skip it.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (['0', 'false', 'no'].includes((process.env.ATRIUM_BOOTSTRAP ?? '').toLowerCase())) return;
    await this.step('reference data', () => this.referenceData());
    await this.step('built-in roles', () => this.builtInRoles());
    await this.step('super admin', () => this.superAdmin());
  }

  private async step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      // Never block the API from starting; the next start retries.
      this.logger.error(`${name} bootstrap failed: ${(err as Error).message}`);
    }
  }

  private async referenceData() {
    const db = this.prisma.client;
    await db.$transaction([
      ...Object.entries(PERMISSIONS).map(([key, description]) => db.permission.upsert({ where: { key }, create: { key, description }, update: { description } })),
      ...DEFAULT_PLANS.map((p) => db.plan.upsert({ where: { key: p.key }, create: { key: p.key, name: p.name, limits: p.limits as object, features: p.features }, update: {} })),
      ...Object.entries(FEATURE_FLAGS).map(([key, description]) => db.featureFlag.upsert({ where: { key }, create: { key, description, enabled: key !== 'collaboration' }, update: { description } })),
    ]);
  }

  /** Adds built-in roles an organization does not have yet; never touches roles that exist. */
  private async builtInRoles() {
    const db = this.prisma.client;
    const [orgs, roles] = await Promise.all([
      db.organization.findMany({ select: { id: true } }),
      db.role.findMany({ where: { key: { in: DEFAULT_ROLES.map((r) => r.key) } }, select: { organizationId: true, key: true } }),
    ]);
    const have = new Set(roles.map((r) => `${r.organizationId}:${r.key}`));
    let added = 0;
    for (const org of orgs) {
      for (const r of DEFAULT_ROLES) {
        if (have.has(`${org.id}:${r.key}`)) continue;
        try {
          await db.role.create({ data: { organizationId: org.id, key: r.key, name: r.name, description: r.description, isSystem: true, permissions: { create: r.permissions.map((p) => ({ permissionKey: p })) } } });
          added++;
        } catch (err) {
          // Another API instance created it at the same time (unique organizationId+key).
          if ((err as { code?: string }).code !== 'P2002') throw err;
        }
      }
    }
    if (added) this.logger.log(`added ${added} built-in role(s) to existing organizations`);
  }

  /**
   * The first super admin. Only while no super admin exists at all, so revoking or replacing the
   * seeded account later is respected. An existing account with that email is promoted (its
   * password is left alone); otherwise it is created with SEED_ADMIN_PASSWORD.
   */
  private async superAdmin() {
    const db = this.prisma.client;
    const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
    if (!email || (await db.user.count({ where: { isSuperAdmin: true } })) > 0) return;
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true } });
      await this.audit(existing.id, `Promoted ${email} to super admin (SEED_ADMIN_EMAIL; the platform had none)`);
      this.logger.log(`promoted ${email} to super admin`);
      return;
    }
    const password = process.env.SEED_ADMIN_PASSWORD ?? '';
    const production = process.env.NODE_ENV === 'production';
    if (production && email.endsWith('.localhost')) {
      this.logger.warn(`no super admin yet: SEED_ADMIN_EMAIL is the local-development address (${email})`);
      return;
    }
    if (password.length < 12 || (production && password === EXAMPLE_ADMIN_PASSWORD) || /change[-_ ]?me|replace[-_ ]?me/i.test(password)) {
      this.logger.warn(`no super admin yet: set a strong SEED_ADMIN_PASSWORD (12+ characters) to create ${email} on the next start`);
      return;
    }
    const user = await db.user.create({ data: { email, name: 'Atrium Admin', isSuperAdmin: true, emailVerifiedAt: new Date(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } });
    await this.audit(user.id, `Created super admin ${email} from SEED_ADMIN_EMAIL`);
    this.logger.log(`created super admin ${email} (password: SEED_ADMIN_PASSWORD)`);
  }

  private audit(userId: string, summary: string) {
    return this.prisma.client.auditLog
      .create({ data: { actorType: 'SYSTEM', actorName: 'bootstrap', action: 'user.super_admin_granted', resourceType: 'user', resourceId: userId, summary } })
      .catch(() => undefined);
  }
}
