import type { JobPayload } from '@atrium/server-kit';
import type { JobInfo, WorkerContext } from '../context';
import { errorMessage, PermanentError } from '../lib/errors';

/** Expected export of @atrium/agent. */
export type RunSiteGeneration = (opts: {
  prisma: WorkerContext['prisma'];
  resolver: WorkerContext['resolver'];
  generationId: string;
  onProgress?: (progress: unknown) => void;
  signal?: AbortSignal;
  deadlineMs?: number;
}) => Promise<unknown>;

let agentLoader: () => Promise<{ runSiteGeneration?: RunSiteGeneration }> = async () => {
  const specifier = '@atrium/agent';
  return (await import(specifier)) as { runSiteGeneration?: RunSiteGeneration };
};

/** Test hook: replace the dynamic agent import. */
export function setAgentLoader(loader: typeof agentLoader): void {
  agentLoader = loader;
}

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Overall wall-clock deadline for one generation (the BullMQ lock for the ai queue is 10 min). */
export const AI_JOB_DEADLINE_MS = () => envInt('AI_SITE_DEADLINE_MS', 10 * 60_000);
/** Delay before retrying a generation deferred for per-org fairness. */
const REQUEUE_DELAY_MS = 30_000;

/**
 * `ai.generate-site` — delegates to `runSiteGeneration` from @atrium/agent (dynamically imported
 * so the worker boots even when the agent package isn't built). The agent re-validates the
 * generation at start (still PENDING, website not deleted, requester still a member with
 * ai.use + website.create, plan includes aiBuilder), enforces per-org fairness, claims it
 * atomically, records progress, usage and the final status; this wrapper re-enqueues deferred
 * generations with a delay, adds an overall deadline, forwards
 * progress to BullMQ and marks the generation FAILED if the agent could not even start.
 */
export async function processAiGenerateSite(ctx: WorkerContext, data: JobPayload<'ai.generate-site'>, job: JobInfo) {
  const markFailed = async (message: string) => {
    await ctx.prisma.aiGeneration.updateMany({ where: { id: data.generationId, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'FAILED', error: message.slice(0, 2000), finishedAt: ctx.now() } });
  };

  let run: RunSiteGeneration | undefined;
  try {
    run = (await agentLoader()).runSiteGeneration;
  } catch (err) {
    ctx.logger.error({ err: errorMessage(err) }, 'could not load @atrium/agent');
  }
  if (typeof run !== 'function') {
    const message = '@atrium/agent is not available (runSiteGeneration export missing) — build the agent package and restart the worker';
    await markFailed(message);
    throw new PermanentError(message);
  }
  const deadlineMs = AI_JOB_DEADLINE_MS();
  const signal = AbortSignal.timeout(deadlineMs);
  let lastProgress = 0;
  try {
    const result = await run({
      prisma: ctx.prisma,
      resolver: ctx.resolver,
      generationId: data.generationId,
      signal,
      deadlineMs,
      onProgress: (progress) => {
        const now = Date.now();
        if (now - lastProgress < 500) return;
        lastProgress = now;
        void job.updateProgress?.({ steps: progress } as object).catch(() => undefined);
      },
    });
    if ((result as { deferred?: boolean } | undefined)?.deferred) {
      // Fairness: the organization already has a generation running — try again shortly.
      await ctx.enqueue('ai.generate-site', { generationId: data.generationId }, { delay: REQUEUE_DELAY_MS, attempts: 1, jobId: `gen-${data.generationId}-${ctx.now().getTime()}` });
      ctx.logger.info({ generationId: data.generationId }, 'site generation deferred (organization already has one running)');
      return result;
    }
    if ((result as { skipped?: string } | undefined)?.skipped) {
      ctx.logger.info({ generationId: data.generationId, reason: (result as { skipped: string }).skipped }, 'site generation skipped');
      return result;
    }
    ctx.logger.info({ generationId: data.generationId }, 'site generation finished');
    return result ?? { ok: true };
  } catch (err) {
    const message = signal.aborted ? `Site generation exceeded its ${Math.round(deadlineMs / 60_000)} minute limit` : errorMessage(err);
    await markFailed(message);
    ctx.logger.error({ generationId: data.generationId, err: message }, 'site generation failed');
    // Generations are expensive and non-idempotent: never retry automatically.
    throw new PermanentError(message);
  }
}
