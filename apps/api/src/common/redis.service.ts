import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  /** Shared connection for BullMQ producers and rate limiting (maxRetriesPerRequest must be null for BullMQ). */
  readonly client: Redis = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false, enableOfflineQueue: true });

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
