import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from '../../common/errors';
import { RedisService } from '../../common/redis.service';

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Tunables (env overrides). */
export const AI_LIMITS = {
  /** Model-backed AI requests in flight per organization / per user. */
  perOrg: () => envInt('AI_MAX_CONCURRENT_PER_ORG', 2),
  perUser: () => envInt('AI_MAX_CONCURRENT_PER_USER', 2),
  /** TTL safety for a leaked slot (process crash): a bit above the propose deadline. */
  slotTtlMs: () => envInt('AI_SLOT_TTL_MS', 180_000),
  /** Concurrent SSE progress streams per user. */
  streamsPerUser: () => envInt('AI_MAX_STREAMS_PER_USER', 5),
  streamTtlMs: 16 * 60_000,
  /** Single-use SSE stream ticket lifetime. */
  ticketTtlSec: 60,
  /** Site generations PENDING/RUNNING per organization (fairness across tenants). */
  siteGenerationsPerOrg: () => envInt('AI_MAX_SITE_GENERATIONS_PER_ORG', 1),
} as const;

export const tooManyAiRequests = (message: string) => new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message);

/** Minimal Redis surface used here (ioredis-compatible; easy to fake in tests). */
export interface LimiterPipeline {
  zremrangebyscore(key: string, min: number | string, max: number | string): LimiterPipeline;
  zadd(key: string, score: number, member: string): LimiterPipeline;
  zcard(key: string): LimiterPipeline;
  pexpire(key: string, ms: number): LimiterPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export interface LimiterRedis {
  multi(): LimiterPipeline;
  zrem(key: string, member: string): Promise<number>;
  set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<'OK' | null>;
  set(key: string, value: string, ex: 'EX', sec: number): Promise<'OK' | null>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

const hashTicket = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Redis-backed AI cost/abuse controls shared by every API instance:
 * - counting semaphores (sorted set per key, members expire by score → crash-safe),
 * - short mutual-exclusion locks,
 * - single-use, short-lived SSE stream tickets bound to user + generation.
 */
@Injectable()
export class AiLimiter {
  private readonly redis: LimiterRedis;
  constructor(redis: RedisService) {
    this.redis = redis.client as unknown as LimiterRedis;
  }

  /** Try to take one of `limit` slots under `key`. Returns a release function, or null when full. */
  async acquire(key: string, limit: number, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const k = `ai:sem:${key}`;
    const token = randomUUID();
    const now = Date.now();
    const res = await this.redis.multi().zremrangebyscore(k, '-inf', now - ttlMs).zadd(k, now, token).zcard(k).pexpire(k, ttlMs).exec();
    const count = Number(res?.[2]?.[1] ?? Number.POSITIVE_INFINITY);
    const release = async () => void (await this.redis.zrem(k, token).catch(() => 0));
    if (count > limit) {
      await release();
      return null;
    }
    return release;
  }

  /** Run `fn` holding an org slot and a user slot (429 when either is exhausted). */
  async runAiRequest<T>(organizationId: string, userId: string, fn: () => Promise<T>): Promise<T> {
    const ttl = AI_LIMITS.slotTtlMs();
    const org = await this.acquire(`org:${organizationId}`, AI_LIMITS.perOrg(), ttl);
    if (!org) throw tooManyAiRequests('Your organization already has the maximum number of AI requests in progress. Try again in a moment.');
    const user = await this.acquire(`user:${userId}`, AI_LIMITS.perUser(), ttl);
    if (!user) {
      await org();
      throw tooManyAiRequests('You already have the maximum number of AI requests in progress. Try again in a moment.');
    }
    try {
      return await fn();
    } finally {
      await Promise.all([org(), user()]);
    }
  }

  /** Mutual exclusion for short critical sections (e.g. apply/revert, site-generation admission). */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>, busy: () => Error): Promise<T> {
    const k = `ai:lock:${key}`;
    const ok = await this.redis.set(k, '1', 'PX', ttlMs, 'NX');
    if (ok !== 'OK') throw busy();
    try {
      return await fn();
    } finally {
      await this.redis.del(k).catch(() => 0);
    }
  }

  /** Opaque single-use ticket for the SSE stream (stored hashed; 60 s TTL). */
  async issueStreamTicket(userId: string, generationId: string): Promise<{ ticket: string; expiresIn: number }> {
    const ticket = randomBytes(32).toString('base64url');
    await this.redis.set(`ai:ticket:${hashTicket(ticket)}`, JSON.stringify({ u: userId, g: generationId }), 'EX', AI_LIMITS.ticketTtlSec);
    return { ticket, expiresIn: AI_LIMITS.ticketTtlSec };
  }

  /** Consume a ticket (atomic GETDEL). Returns the bound user id, or null when invalid/expired/used/wrong generation. */
  async consumeStreamTicket(ticket: string, generationId: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(ticket)) return null;
    const raw = await this.redis.getdel(`ai:ticket:${hashTicket(ticket)}`);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { u?: string; g?: string };
      return v.g === generationId && typeof v.u === 'string' ? v.u : null;
    } catch {
      return null;
    }
  }
}
