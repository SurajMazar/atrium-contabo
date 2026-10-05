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
}) => Promise<unknown>;

let agentLoader: () => Promise<{ runSiteGeneration?: RunSiteGeneration }> = async () => {
  const specifier = '@atrium/agent';
  return (await import(specifier)) as { runSiteGeneration?: RunSiteGeneration };
};

/** Test hook: replace the dynamic agent import. */
export function setAgentLoader(loader: typeof agentLoader): void {
  agentLoader = loader;
}

/**
 * `ai.generate-site` — delegates to `runSiteGeneration` from @atrium/agent (dynamically imported
 * so the worker boots even when the agent package isn't built). The agent records progress,
 * usage and the final status; this wrapper forwards progress to BullMQ and marks the generation
 * FAILED if the agent could not even start.
 */
export async function processAiGenerateSite(ctx: WorkerContext, data: JobPayload<'ai.generate-site'>, job: JobInfo) {
  let run: RunSiteGeneration | undefined;
  try {
    run = (await agentLoader()).runSiteGeneration;
  } catch (err) {
    ctx.logger.error({ err: errorMessage(err) }, 'could not load @atrium/agent');
  }
  const markFailed = async (message: string) => {
    await ctx.prisma.aiGeneration.updateMany({ where: { id: data.generationId, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'FAILED', error: message.slice(0, 2000), finishedAt: ctx.now() } });
  };
  if (typeof run !== 'function') {
    const message = '@atrium/agent is not available (runSiteGeneration export missing) — build the agent package and restart the worker';
    await markFailed(message);
    throw new PermanentError(message);
  }
  let lastProgress = 0;
  try {
    const result = await run({
      prisma: ctx.prisma,
      resolver: ctx.resolver,
      generationId: data.generationId,
      onProgress: (progress) => {
        const now = Date.now();
        if (now - lastProgress < 500) return;
        lastProgress = now;
        void job.updateProgress?.({ steps: progress } as object).catch(() => undefined);
      },
    });
    ctx.logger.info({ generationId: data.generationId }, 'site generation finished');
    return result ?? { ok: true };
  } catch (err) {
    const message = errorMessage(err);
    await markFailed(message);
    ctx.logger.error({ generationId: data.generationId, err: message }, 'site generation failed');
    // Generations are expensive and non-idempotent: never retry automatically.
    throw new PermanentError(message);
  }
}
