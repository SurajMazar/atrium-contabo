import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QUEUES } from '@atrium/server-kit';
import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env';
import { RedisService } from './redis.service';

export interface EmailAddress {
  email: string;
  name?: string;
}

type QueueKey = keyof typeof QUEUES;

const DEFAULTS: JobsOptions = { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 86_400, count: 5000 }, removeOnFail: { age: 7 * 86_400 } };

/** Producer side of background jobs. Expensive work never runs inside HTTP requests. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('Queues');
  private readonly queues = new Map<string, Queue>();
  constructor(private readonly redis: RedisService) {}

  queue(key: QueueKey): Queue {
    const name = QUEUES[key] as string;
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis.client.duplicate() });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(key: QueueKey, jobName: string, data: unknown, opts: JobsOptions = {}) {
    if (env().DISABLE_QUEUES) {
      this.logger.debug(`queues disabled; dropped ${jobName}`);
      return null;
    }
    return this.queue(key).add(jobName, data, { ...DEFAULTS, ...opts });
  }

  /** Platform-level transactional email (password reset, invitations) via the platform SMTP. */
  platformEmail(message: { to: EmailAddress[]; subject: string; text?: string; html?: string }) {
    return this.add('email', 'email.send', { organizationId: null, message, context: { kind: 'platform' } });
  }

  emit(organizationId: string, websiteId: string | null | undefined, event: string, payload: unknown) {
    return this.add('webhook', 'webhook.dispatch', { organizationId, websiteId: websiteId ?? null, event, payload }, { attempts: 3 });
  }

  all(): Queue[] {
    return (Object.keys(QUEUES) as QueueKey[]).map((k) => this.queue(k));
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}
