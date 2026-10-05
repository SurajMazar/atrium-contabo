import { AiLimitError } from '@atrium/agent';
import { describe, expect, it } from 'vitest';
import type { RedisService } from '../../common/redis.service';
import { AiLimiter, type LimiterPipeline } from './ai-limits';
import { confirmationReasons, mapAiError, touchedUnits } from './ai-policy';

/** In-memory Redis subset with per-command async hops, so interleavings resemble a real server. */
class FakeRedis {
  zsets = new Map<string, Map<string, number>>();
  strings = new Map<string, { v: string; exp?: number }>();
  now = () => Date.now();
  private tick = () => new Promise((r) => setImmediate(r));

  multi(): LimiterPipeline {
    const ops: Array<() => unknown> = [];
    const p: LimiterPipeline = {
      zremrangebyscore: (k, _min, max) => (ops.push(() => {
        const z = this.zsets.get(k);
        if (!z) return 0;
        let n = 0;
        for (const [m, s] of z) if (s <= Number(max)) (z.delete(m), n++);
        return n;
      }), p),
      zadd: (k, score, member) => (ops.push(() => {
        const z = this.zsets.get(k) ?? new Map();
        this.zsets.set(k, z);
        z.set(member, score);
        return 1;
      }), p),
      zcard: (k) => (ops.push(() => this.zsets.get(k)?.size ?? 0), p),
      pexpire: (_k, _ms) => (ops.push(() => 1), p),
      exec: async () => {
        await this.tick();
        return ops.map((f) => [null, f()] as [null, unknown]); // MULTI is atomic
      },
    };
    return p;
  }
  async zrem(k: string, m: string) {
    await this.tick();
    return this.zsets.get(k)?.delete(m) ? 1 : 0;
  }
  async set(k: string, v: string, mode: 'PX' | 'EX', ttl: number, nx?: 'NX') {
    await this.tick();
    const cur = this.strings.get(k);
    const alive = cur && (!cur.exp || cur.exp > this.now());
    if (nx === 'NX' && alive) return null;
    this.strings.set(k, { v, exp: this.now() + (mode === 'PX' ? ttl : ttl * 1000) });
    return 'OK' as const;
  }
  async getdel(k: string) {
    await this.tick();
    const cur = this.strings.get(k);
    this.strings.delete(k);
    return cur && (!cur.exp || cur.exp > this.now()) ? cur.v : null;
  }
  async del(k: string) {
    await this.tick();
    return this.strings.delete(k) ? 1 : 0;
  }
}

const limiterWith = (redis: FakeRedis) => new AiLimiter({ client: redis } as unknown as RedisService);

describe('AiLimiter', () => {
  it('admits at most N concurrent holders under parallel load and frees slots on release', async () => {
    const redis = new FakeRedis();
    const limiter = limiterWith(redis);
    const results = await Promise.all(Array.from({ length: 30 }, () => limiter.acquire('org:o1', 2, 60_000)));
    const held = results.filter(Boolean);
    expect(held.length).toBeLessThanOrEqual(2);
    expect(held.length).toBeGreaterThanOrEqual(1);
    await Promise.all(held.map((r) => r!()));
    expect(redis.zsets.get('ai:sem:org:o1')?.size ?? 0).toBe(0);
    expect(await limiter.acquire('org:o1', 2, 60_000)).toBeTruthy();
  });

  it('expires leaked slots after the TTL (crash safety)', async () => {
    const redis = new FakeRedis();
    const limiter = limiterWith(redis);
    redis.zsets.set('ai:sem:user:u1', new Map([['leaked-a', Date.now() - 200_000], ['leaked-b', Date.now() - 200_000]]));
    expect(await limiter.acquire('user:u1', 2, 180_000)).toBeTruthy();
  });

  it('runAiRequest enforces per-org and per-user concurrency with 429s', async () => {
    const limiter = limiterWith(new FakeRedis());
    let inFlight = 0;
    let peak = 0;
    const work = () => limiter.runAiRequest('org-1', `user-${Math.random()}`, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return 'ok';
    });
    const settled = await Promise.allSettled(Array.from({ length: 10 }, work));
    expect(peak).toBeLessThanOrEqual(2);
    const rejected = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.length).toBeGreaterThanOrEqual(8);
    expect((rejected[0]!.reason as { getStatus(): number }).getStatus()).toBe(429);
    // slots are released afterwards
    await expect(work()).resolves.toBe('ok');
  });

  it('stream tickets are single use, bound to the generation and expire', async () => {
    const redis = new FakeRedis();
    const limiter = limiterWith(redis);
    const { ticket, expiresIn } = await limiter.issueStreamTicket('u1', 'gen1');
    expect(expiresIn).toBe(60);
    expect([...redis.strings.keys()][0]).not.toContain(ticket); // stored hashed
    expect(await limiter.consumeStreamTicket(ticket, 'gen-other')).toBeNull();
    const t2 = (await limiter.issueStreamTicket('u1', 'gen1')).ticket;
    expect(await limiter.consumeStreamTicket(t2, 'gen1')).toBe('u1');
    expect(await limiter.consumeStreamTicket(t2, 'gen1')).toBeNull();
    const t3 = (await limiter.issueStreamTicket('u1', 'gen1')).ticket;
    redis.now = () => Date.now() + 61_000;
    expect(await limiter.consumeStreamTicket(t3, 'gen1')).toBeNull();
    expect(await limiter.consumeStreamTicket('short', 'gen1')).toBeNull();
  });

  it('withLock serializes critical sections', async () => {
    const limiter = limiterWith(new FakeRedis());
    const busy = () => new Error('busy');
    let release!: () => void;
    const first = limiter.withLock('gen:1', 10_000, () => new Promise<void>((r) => (release = r)), busy);
    await new Promise((r) => setTimeout(r, 5));
    await expect(limiter.withLock('gen:1', 10_000, async () => 1, busy)).rejects.toThrow('busy');
    release();
    await first;
    await expect(limiter.withLock('gen:1', 10_000, async () => 2, busy)).resolves.toBe(2);
  });
});

describe('AI confirmation + error mapping', () => {
  it('requires confirmation for sensitive / structural changes and lists reasons', () => {
    expect(confirmationReasons({ changes: [{ kind: 'modified', scope: 'section', id: 'n1', label: 'hero', pageId: 'p' }] }, 'edit')).toEqual([]);
    const r = confirmationReasons({ changes: [{ kind: 'modified', scope: 'theme', id: 'theme', label: 'Theme' }, { kind: 'modified', scope: 'form', id: 'f:rules', label: 'Contact: notifications', detail: 'email to x@evil.test', sensitive: true }], rejected: [{ op: 'setRedirects', reason: 'no' }] }, 'edit');
    expect(r).toContain('Changes the site theme');
    expect(r).toContain('Sensitive: Contact: notifications (email to x@evil.test)');
    expect(r.some((x) => /blocked by the AI safety policy/.test(x))).toBe(true);
    expect(confirmationReasons({ changes: [] }, 'section')).toEqual(['Adds a new section']);
  });

  it('maps agent limit errors to API errors', () => {
    const status = (e: AiLimitError) => {
      try {
        mapAiError(e);
      } catch (err) {
        return (err as { getStatus(): number }).getStatus();
      }
    };
    expect(status(new AiLimitError('q', 'quota'))).toBe(402);
    expect(status(new AiLimitError('b', 'budget'))).toBe(402);
    expect(status(new AiLimitError('d', 'deadline'))).toBe(504);
    expect(status(new AiLimitError('m', 'model'))).toBe(400);
    expect(() => mapAiError(new Error('other'))).toThrow('other');
  });

  it('touchedUnits covers created and deleted pages', () => {
    expect(touchedUnits({ site: false, theme: true, pages: ['a'], forms: [], redirects: false }, ['b'], ['c'])).toMatchObject({ theme: true, pages: ['a', 'b', 'c'] });
  });
});
