import type { INestApplication } from '@nestjs/common';
import { RedisService } from '../src/common/redis.service';

/** Integration suites share 127.0.0.1: start each from clean rate-limit counters (prefix `rl:`, auth locks `auth:`). */
export async function resetThrottles(app: INestApplication) {
  const redis = app.get(RedisService).client;
  for (const pattern of ['rl:default:*', 'auth:login-fail:*']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }
}
