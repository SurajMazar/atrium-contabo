import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, type PrismaClient } from '@atrium/db';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';

export const REDACTED_PROMPT = '[redacted: retention]';

/** AI_RETENTION_DAYS (default 180; 0 disables). */
export function aiRetentionDays(): number {
  const raw = process.env.AI_RETENTION_DAYS;
  if (raw === undefined || raw === '') return 180;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 180;
}

/**
 * Redact prompts, operations, results, progress and rollback snapshots of AI generations
 * older than `days`. Rows are kept (usage/cost accounting and the audit trail reference them),
 * but the user content and full-site snapshots they carried are removed. Returns rows redacted.
 */
export async function redactOldAiGenerations(prisma: Pick<PrismaClient, 'aiGeneration'>, days: number, now = new Date()): Promise<number> {
  if (!(days > 0)) return 0;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const res = await prisma.aiGeneration.updateMany({
    where: { createdAt: { lt: cutoff }, prompt: { not: REDACTED_PROMPT }, status: { notIn: ['PENDING', 'RUNNING'] } },
    data: { prompt: REDACTED_PROMPT, operations: [], progress: [], result: { redacted: true, redactedAt: now.toISOString() }, rollback: Prisma.DbNull, error: null },
  });
  return res.count;
}

/** Daily retention job (single runner via Redis lock, same pattern as SchedulerService). */
@Injectable()
export class AiRetentionService {
  private readonly logger = new Logger('AiRetention');
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run() {
    const lock = await this.redis.client.set('lock:ai-retention', String(process.pid), 'EX', 3300, 'NX').catch(() => null);
    if (lock !== 'OK') return;
    try {
      const n = await redactOldAiGenerations(this.prisma.client, aiRetentionDays());
      if (n) this.logger.log(`redacted ${n} AI generation(s) older than ${aiRetentionDays()} days`);
    } catch (err) {
      this.logger.warn(`AI retention failed: ${(err as Error).message}`);
    }
  }
}
