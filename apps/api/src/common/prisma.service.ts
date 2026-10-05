import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, createPrismaClient } from '@atrium/db';

/** Prisma client as an injectable. Extends PrismaClient's surface via a proxy-free delegate. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

/** Convenience alias type for services. */
export type Db = PrismaClient;
