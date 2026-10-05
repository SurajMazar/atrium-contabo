import { Injectable } from '@nestjs/common';
import { ProviderResolver } from '@atrium/server-kit';
import { PrismaService } from '../../common/prisma.service';

/** Nest-injectable wrapper around the shared ProviderResolver (DB rows → decrypted → driver instance, env fallbacks). */
@Injectable()
export class ResolverService {
  readonly resolver: ProviderResolver;
  constructor(prisma: PrismaService) {
    this.resolver = new ProviderResolver(prisma.client as never);
  }
}
