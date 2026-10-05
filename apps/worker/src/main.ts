import { createServer, type Server } from 'node:http';
import { createPrismaClient } from '@atrium/db';
import {
  createLogger,
  DEFAULT_JOB_OPTIONS,
  enqueue,
  JOB_QUEUE,
  loadEnv,
  ProviderResolver,
  QUEUES,
  QueueRegistry,
  redisConnection,
  SCHEDULES,
  type QueueName,
} from '@atrium/server-kit';
import { Worker, type Job } from 'bullmq';
import type { WorkerContext, WorkerSettings } from './context';
import { routeJob } from './router';

/** Default per-queue concurrency; override with WORKER_CONCURRENCY_<QUEUE> (e.g. WORKER_CONCURRENCY_MEDIA=4). */
const DEFAULT_CONCURRENCY: Record<QueueName, number> = {
  email: 10,
  sms: 5,
  webhook: 20,
  'form-rules': 5,
  media: 2,
  deployment: 2,
  ai: 2,
  analytics: 1,
  maintenance: 1,
};

const envKey = (q: string) => `WORKER_CONCURRENCY_${q.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
const int = (v: string | undefined, def: number) => (v && /^\d+$/.test(v) ? Number(v) : def);

interface ErrorReporter {
  capture(err: unknown, extra: Record<string, unknown>): void;
  flush(): Promise<void>;
}

/** Optional Sentry integration (no hard dependency): enabled when SENTRY_DSN is set and @sentry/node is installed. */
async function initErrorReporter(dsn: string | undefined, logger: WorkerContext['logger']): Promise<ErrorReporter | undefined> {
  if (!dsn) return undefined;
  try {
    const specifier = '@sentry/node';
    const Sentry = (await import(specifier)) as { init(o: object): void; captureException(e: unknown, o?: object): void; flush(ms: number): Promise<boolean> };
    Sentry.init({ dsn, environment: process.env.NODE_ENV, release: process.env.ATRIUM_RELEASE, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0) });
    logger.info('sentry error reporting enabled');
    return { capture: (err, extra) => Sentry.captureException(err, { extra }), flush: async () => void (await Sentry.flush(2000)) };
  } catch {
    logger.warn('SENTRY_DSN is set but @sentry/node is not installed — error reporting disabled');
    return undefined;
  }
}

/** Optional OpenTelemetry auto-instrumentation when OTEL_EXPORTER_OTLP_ENDPOINT is set and the SDK is installed. */
async function initTelemetry(endpoint: string | undefined, logger: WorkerContext['logger']): Promise<(() => Promise<void>) | undefined> {
  if (!endpoint) return undefined;
  try {
    const sdkSpecifier = '@opentelemetry/sdk-node';
    const autoSpecifier = '@opentelemetry/auto-instrumentations-node';
    const { NodeSDK } = (await import(sdkSpecifier)) as { NodeSDK: new (o: object) => { start(): void; shutdown(): Promise<void> } };
    const auto = (await import(autoSpecifier).catch(() => undefined)) as { getNodeAutoInstrumentations?: () => unknown[] } | undefined;
    const sdk = new NodeSDK({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'atrium-worker', instrumentations: auto?.getNodeAutoInstrumentations?.() ?? [] });
    sdk.start();
    logger.info({ endpoint }, 'opentelemetry enabled');
    return () => sdk.shutdown();
  } catch {
    logger.warn('OTEL_EXPORTER_OTLP_ENDPOINT is set but @opentelemetry/sdk-node is not installed — tracing disabled');
    return undefined;
  }
}

export async function startWorker(opts: { handleSignals?: boolean } = {}) {
  const env = loadEnv({ required: ['DATABASE_URL', 'ENCRYPTION_KEY'] });
  const logger = createLogger({ name: 'worker', level: env.LOG_LEVEL });
  const stopTelemetry = await initTelemetry(env.OTEL_EXPORTER_OTLP_ENDPOINT, logger);
  const reporter = await initErrorReporter(env.SENTRY_DSN, logger);

  const prisma = createPrismaClient({ max: int(process.env.WORKER_DB_POOL_SIZE, 10) });
  const connection = redisConnection(env.REDIS_URL);
  const queues = new QueueRegistry(connection, env.QUEUE_PREFIX);
  const resolver = new ProviderResolver(prisma);
  const settings: WorkerSettings = {
    nodeEnv: env.NODE_ENV,
    apiUrl: env.API_URL,
    adminUrl: env.ADMIN_URL,
    rendererUrl: env.RENDERER_URL,
    repoRoot: process.env.ATRIUM_REPO_ROOT || undefined,
    allowPrivateNetwork: process.env.WORKER_ALLOW_PRIVATE_NETWORK ? process.env.WORKER_ALLOW_PRIVATE_NETWORK === '1' : env.NODE_ENV !== 'production',
    enableLocalBuilds: process.env.WORKER_ENABLE_LOCAL_BUILDS === '1',
    deploymentPollIntervalMs: int(process.env.WORKER_DEPLOYMENT_POLL_MS, 5000),
    deploymentPollMaxAttempts: int(process.env.WORKER_DEPLOYMENT_POLL_MAX_ATTEMPTS, 720),
  };
  const ctx: WorkerContext = {
    prisma,
    resolver,
    logger,
    settings,
    enqueue: (name, data, opts) => enqueue(queues, name, data, opts),
    fetch: globalThis.fetch.bind(globalThis),
    now: () => new Date(),
  };

  const only = (process.env.WORKER_QUEUES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const queueNames = (Object.values(QUEUES) as QueueName[]).filter((q) => !only.length || only.includes(q));
  const stats = { completed: 0, failed: 0, active: 0 };
  const workers = queueNames.map((queueName) => {
    const concurrency = int(process.env[envKey(queueName)], DEFAULT_CONCURRENCY[queueName]);
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        stats.active++;
        const started = Date.now();
        const log = logger.child({ queue: queueName, job: job.name, jobId: job.id, attempt: job.attemptsMade + 1 });
        try {
          const result = await routeJob({ ...ctx, logger: log }, job.name, job.data, {
            id: job.id,
            name: job.name,
            attemptsMade: job.attemptsMade,
            attempts: job.opts.attempts ?? 1,
            updateProgress: (p) => job.updateProgress(p),
            log: (row) => job.log(row),
          });
          log.debug({ ms: Date.now() - started }, 'job completed');
          return result;
        } finally {
          stats.active--;
        }
      },
      { connection, prefix: env.QUEUE_PREFIX, concurrency, autorun: true, lockDuration: queueName === 'deployment' || queueName === 'ai' ? 10 * 60_000 : 60_000 },
    );
    worker.on('completed', () => stats.completed++);
    worker.on('failed', (job, err) => {
      stats.failed++;
      const final = !job || job.attemptsMade >= (job.opts.attempts ?? 1) || err.name === 'UnrecoverableError' || err.name === 'PermanentError';
      logger[final ? 'error' : 'warn']({ queue: queueName, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, final, err: { name: err.name, message: err.message } }, final ? 'job failed permanently' : 'job failed — will retry');
      if (final) reporter?.capture(err, { queue: queueName, job: job?.name, jobId: job?.id });
    });
    worker.on('error', (err) => logger.error({ queue: queueName, err }, 'worker error'));
    return { worker, queueName, concurrency };
  });

  // Repeatable jobs (analytics rollup hourly, maintenance daily) — idempotent upserts.
  for (const s of SCHEDULES) {
    const queueName = JOB_QUEUE[s.job];
    if (!queueNames.includes(queueName)) continue;
    await queues.get(queueName).upsertJobScheduler(s.id, { pattern: s.pattern, tz: 'UTC' }, { name: s.job, data: s.data, opts: DEFAULT_JOB_OPTIONS[s.job] });
  }

  logger.info({ queues: Object.fromEntries(workers.map((w) => [w.queueName, w.concurrency])), redis: env.REDIS_URL.replace(/\/\/[^@]*@/, '//***@'), schedules: SCHEDULES.map((s) => `${s.job}@${s.pattern}`) }, 'worker ready');

  const heartbeatMs = int(process.env.WORKER_HEARTBEAT_MS, 60_000);
  const heartbeat = setInterval(async () => {
    try {
      const counts = Object.fromEntries(await Promise.all(queueNames.map(async (q) => [q, await queues.get(q).getJobCounts('waiting', 'active', 'delayed', 'failed')] as const)));
      logger.info({ ...stats, counts }, 'worker heartbeat');
    } catch (err) {
      logger.warn({ err }, 'heartbeat failed (redis unavailable?)');
    }
  }, heartbeatMs);
  heartbeat.unref();

  let health: Server | undefined;
  const healthPort = int(process.env.WORKER_HEALTH_PORT, 0);
  if (healthPort) {
    health = createServer(async (req, res) => {
      const ok = connection.status === 'ready' && workers.every((w) => w.worker.isRunning());
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok, redis: connection.status, ...stats, queues: workers.map((w) => ({ queue: w.queueName, running: w.worker.isRunning() })) }));
    }).listen(healthPort, () => logger.info({ port: healthPort }, 'health endpoint listening'));
  }

  let stopping: Promise<void> | undefined;
  /** Graceful stop: finish active jobs, then close queues, DB and Redis (does not exit the process). */
  const stop = () =>
    (stopping ??= (async () => {
      clearInterval(heartbeat);
    health?.close();
    await Promise.allSettled(workers.map((w) => w.worker.close()));
    await queues.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    await connection.quit().catch(() => undefined);
    await reporter?.flush().catch(() => undefined);
      await stopTelemetry?.().catch(() => undefined);
      logger.info('worker stopped');
    })());
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down: waiting for active jobs');
    const force = setTimeout(() => {
      logger.error('graceful shutdown timed out — exiting');
      process.exit(1);
    }, int(process.env.WORKER_SHUTDOWN_TIMEOUT_MS, 30_000));
    force.unref();
    await stop();
    process.exit(0);
  };
  if (opts.handleSignals !== false) {
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
  }

  return { ctx, workers: workers.map((w) => w.worker), queues, stop };
}

const isEntrypoint = (() => {
  const argv = process.argv[1] ?? '';
  return /main\.(ts|js|mjs)$/.test(argv) || argv.endsWith('/worker') || process.env.ATRIUM_WORKER_AUTOSTART === '1';
})();

if (isEntrypoint) {
  startWorker().catch((err) => {
    console.error('worker failed to start:', err);
    process.exit(1);
  });
}
