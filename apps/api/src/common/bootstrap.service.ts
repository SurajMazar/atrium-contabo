import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DEFAULT_PLANS, FEATURE_FLAGS, PERMISSIONS } from '@atrium/schema';
import { PrismaService } from './prisma.service';

/** Idempotently ensures reference data (permissions, plans, feature flags) exists. */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const db = this.prisma.client;
    try {
      await db.$transaction([
        ...Object.entries(PERMISSIONS).map(([key, description]) => db.permission.upsert({ where: { key }, create: { key, description }, update: { description } })),
        ...DEFAULT_PLANS.map((p) => db.plan.upsert({ where: { key: p.key }, create: { key: p.key, name: p.name, limits: p.limits as object, features: p.features }, update: {} })),
        ...Object.entries(FEATURE_FLAGS).map(([key, description]) => db.featureFlag.upsert({ where: { key }, create: { key, description, enabled: key !== 'collaboration' }, update: { description } })),
      ]);
    } catch (err) {
      this.logger.error(`reference data bootstrap failed: ${(err as Error).message}`);
    }
  }
}
