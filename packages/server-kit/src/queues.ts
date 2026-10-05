import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';
import { z } from 'zod';

/** BullMQ queue names (one queue per concern; job names below route inside them). */
export const QUEUES = {
  email: 'email',
  sms: 'sms',
  webhook: 'webhook',
  formRules: 'form-rules',
  media: 'media',
  deployment: 'deployment',
  ai: 'ai',
  analytics: 'analytics',
  maintenance: 'maintenance',
} as const;
export type QueueKey = keyof typeof QUEUES;
export type QueueName = (typeof QUEUES)[QueueKey];

// ───────────────────────────── Payload schemas ─────────────────────────────

export const EmailAddressPayloadSchema = z.object({ email: z.string().email(), name: z.string().optional() });

export const EmailMessagePayloadSchema = z.object({
  /** Optional — the resolved provider's sender is used when omitted. */
  from: EmailAddressPayloadSchema.optional(),
  to: z.array(EmailAddressPayloadSchema).min(1),
  cc: z.array(EmailAddressPayloadSchema).optional(),
  bcc: z.array(EmailAddressPayloadSchema).optional(),
  replyTo: EmailAddressPayloadSchema.optional(),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  /** JSON-safe attachments (base64 content). Keep small — large files belong in storage links. */
  attachments: z.array(z.object({ filename: z.string(), contentBase64: z.string(), contentType: z.string().optional() })).optional(),
});

export const JobContextSchema = z
  .object({
    /** When set, the result is appended to FormSubmission.actionsLog. */
    submissionId: z.string().optional(),
    ruleId: z.string().optional(),
    actionType: z.string().optional(),
    /** Free-form classification, e.g. 'password-reset', 'invitation', 'form-notification'. */
    kind: z.string().optional(),
  })
  .passthrough();

export const JOB_SCHEMAS = {
  /**
   * `organizationId` null/absent = platform email (password reset, invitations) sent through
   * the platform SMTP (SMTP_* + MAIL_FROM).
   */
  'email.send': z.object({
    organizationId: z.string().nullish(),
    websiteId: z.string().nullish(),
    providerId: z.string().nullish(),
    message: EmailMessagePayloadSchema,
    context: JobContextSchema.optional(),
  }),
  'sms.send': z.object({
    organizationId: z.string(),
    websiteId: z.string().nullish(),
    providerId: z.string().nullish(),
    to: z.string().min(3),
    body: z.string().min(1).max(1600),
    from: z.string().optional(),
    context: JobContextSchema.optional(),
  }),
  /** Fan-out: create WebhookDelivery rows for matching webhooks, then enqueue `webhook.deliver` per row. */
  'webhook.dispatch': z.object({
    organizationId: z.string(),
    websiteId: z.string().nullish(),
    event: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
    /** Restrict to one webhook (form rule "webhook" action with webhookId). */
    webhookId: z.string().optional(),
  }),
  'webhook.deliver': z.object({ deliveryId: z.string() }),
  /** Form rule engine for a stored submission. */
  'form.process': z.object({ submissionId: z.string() }),
  /** Responsive variants, blur placeholder, dominant color. */
  'media.process': z.object({ mediaId: z.string() }),
  'deployment.run': z.object({ deploymentId: z.string() }),
  'deployment.poll': z.object({ deploymentId: z.string(), attempt: z.number().int().min(0).default(0) }),
  'ai.generate-site': z.object({ generationId: z.string() }),
  /** Aggregate AnalyticsEvent → AnalyticsDaily. `date` = YYYY-MM-DD (UTC); default: today + yesterday. */
  'analytics.rollup': z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), websiteId: z.string().optional() }),
  'maintenance.cleanup': z.object({}).passthrough(),
} as const;

export type JobName = keyof typeof JOB_SCHEMAS;
export type JobPayload<N extends JobName> = z.output<(typeof JOB_SCHEMAS)[N]>;
export type JobInput<N extends JobName> = z.input<(typeof JOB_SCHEMAS)[N]>;
export const JOB_NAMES = Object.keys(JOB_SCHEMAS) as JobName[];

/** Which queue each job is routed to. */
export const JOB_QUEUE: Record<JobName, QueueName> = {
  'email.send': QUEUES.email,
  'sms.send': QUEUES.sms,
  'webhook.dispatch': QUEUES.webhook,
  'webhook.deliver': QUEUES.webhook,
  'form.process': QUEUES.formRules,
  'media.process': QUEUES.media,
  'deployment.run': QUEUES.deployment,
  'deployment.poll': QUEUES.deployment,
  'ai.generate-site': QUEUES.ai,
  'analytics.rollup': QUEUES.analytics,
  'maintenance.cleanup': QUEUES.maintenance,
};

const KEEP = { removeOnComplete: { age: 24 * 3600, count: 2000 }, removeOnFail: { age: 14 * 24 * 3600, count: 10_000 } } satisfies JobsOptions;

/** Default job options per job: attempts 5 with exponential 5s backoff; webhooks 8 attempts / 30s. */
export const DEFAULT_JOB_OPTIONS: Record<JobName, JobsOptions> = {
  'email.send': { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, ...KEEP },
  'sms.send': { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, ...KEEP },
  'webhook.dispatch': { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, ...KEEP },
  'webhook.deliver': { attempts: 8, backoff: { type: 'exponential', delay: 30_000 }, ...KEEP },
  'form.process': { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, ...KEEP },
  'media.process': { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, ...KEEP },
  'deployment.run': { attempts: 2, backoff: { type: 'exponential', delay: 15_000 }, ...KEEP },
  'deployment.poll': { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, ...KEEP },
  // AI generations are expensive and non-idempotent: one attempt; the agent handles its own retries.
  'ai.generate-site': { attempts: 1, ...KEEP },
  'analytics.rollup': { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, ...KEEP },
  'maintenance.cleanup': { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, ...KEEP },
};

/** Repeatable schedules registered by the worker (BullMQ job schedulers). */
export const SCHEDULES: Array<{ id: string; job: JobName; pattern: string; data: Record<string, unknown> }> = [
  { id: 'analytics-rollup-hourly', job: 'analytics.rollup', pattern: '7 * * * *', data: {} },
  { id: 'maintenance-cleanup-daily', job: 'maintenance.cleanup', pattern: '30 3 * * *', data: {} },
];

export function parseJobPayload<N extends JobName>(name: N, data: unknown): JobPayload<N> {
  const schema = JOB_SCHEMAS[name];
  if (!schema) throw new Error(`Unknown job "${String(name)}"`);
  return schema.parse(data) as JobPayload<N>;
}

// ───────────────────────────── Connections & queues ─────────────────────────────

/** ioredis connection suitable for BullMQ (maxRetriesPerRequest must be null for workers). */
export function redisConnection(url: string = process.env.REDIS_URL ?? 'redis://localhost:6379', opts: RedisOptions = {}): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false, ...opts });
}

export function createQueue(name: QueueName, connection: ConnectionOptions, prefix = process.env.QUEUE_PREFIX ?? 'atrium'): Queue {
  return new Queue(name, { connection, prefix });
}

export type QueueMap = Partial<Record<QueueName, Queue>>;

/** Lazily creates and caches one Queue per name for a shared connection. */
export class QueueRegistry {
  private readonly queues = new Map<QueueName, Queue>();
  constructor(
    private readonly connection: ConnectionOptions,
    private readonly prefix = process.env.QUEUE_PREFIX ?? 'atrium',
  ) {}

  get(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) this.queues.set(name, (q = createQueue(name, this.connection, this.prefix)));
    return q;
  }

  all(): Queue[] {
    return Object.values(QUEUES).map((n) => this.get(n));
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}

/** Create every queue up front (API convenience). */
export function createQueues(connection: ConnectionOptions, prefix?: string): Record<QueueName, Queue> {
  const out = {} as Record<QueueName, Queue>;
  for (const name of Object.values(QUEUES)) out[name] = createQueue(name, connection, prefix);
  return out;
}

/**
 * Validate and enqueue a job on its queue with default options merged with `opts`.
 * Pass a `jobId` for idempotency (e.g. `form-${submissionId}`; BullMQ job ids must not contain ":").
 */
export async function enqueue<N extends JobName>(queues: QueueMap | QueueRegistry, name: N, data: JobInput<N>, opts: JobsOptions = {}) {
  const payload = parseJobPayload(name, data);
  const queueName = JOB_QUEUE[name];
  const queue = queues instanceof QueueRegistry ? queues.get(queueName) : queues[queueName];
  if (!queue) throw new Error(`Queue "${queueName}" for job "${name}" is not available`);
  return queue.add(name, payload, { ...DEFAULT_JOB_OPTIONS[name], ...opts });
}
