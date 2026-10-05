import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Redis-backed distributed rate-limit storage (fixed window + block). */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const r = this.redis.client;
    const hitKey = `rl:${throttlerName}:${key}`;
    const blockKey = `${hitKey}:blocked`;
    const blockedTtl = await r.pttl(blockKey);
    if (blockedTtl > 0) return { totalHits: limit + 1, timeToExpire: Math.ceil(blockedTtl / 1000), isBlocked: true, timeToBlockExpire: Math.ceil(blockedTtl / 1000) };
    const res = await r.multi().incr(hitKey).pttl(hitKey).exec();
    const totalHits = Number(res?.[0]?.[1] ?? 1);
    let pttl = Number(res?.[1]?.[1] ?? -1);
    if (pttl < 0) {
      await r.pexpire(hitKey, ttl);
      pttl = ttl;
    }
    if (totalHits > limit) {
      const block = blockDuration > 0 ? blockDuration : pttl;
      await r.set(blockKey, '1', 'PX', block);
      return { totalHits, timeToExpire: Math.ceil(pttl / 1000), isBlocked: true, timeToBlockExpire: Math.ceil(block / 1000) };
    }
    return { totalHits, timeToExpire: Math.ceil(pttl / 1000), isBlocked: false, timeToBlockExpire: 0 };
  }
}
