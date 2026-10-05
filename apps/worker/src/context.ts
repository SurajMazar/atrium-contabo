import type { PrismaClient } from '@atrium/db';
import type { JobInput, JobName, Logger, ProviderResolver } from '@atrium/server-kit';
import type { JobsOptions } from 'bullmq';

/** Worker settings (from env; see main.ts). */
export interface WorkerSettings {
  nodeEnv: 'development' | 'test' | 'production';
  apiUrl: string;
  adminUrl: string;
  rendererUrl: string;
  repoRoot?: string;
  /** Allow webhooks/HTTP actions to target private network addresses (default: non-production only). */
  allowPrivateNetwork: boolean;
  /** Allow npm install/build inside the worker for static-only hosts (Netlify, Cloudflare Pages). */
  enableLocalBuilds: boolean;
  deploymentPollIntervalMs: number;
  deploymentPollMaxAttempts: number;
}

/** Everything a processor may touch — injected so processors are unit-testable with mocks. */
export interface WorkerContext {
  prisma: PrismaClient;
  resolver: ProviderResolver;
  logger: Logger;
  settings: WorkerSettings;
  enqueue<N extends JobName>(name: N, data: JobInput<N>, opts?: JobsOptions): Promise<unknown>;
  /** Overridable for tests. */
  fetch: typeof fetch;
  now(): Date;
}

/** Subset of a BullMQ job processors need (also easy to fake in tests). */
export interface JobInfo {
  id?: string;
  name: string;
  attemptsMade: number;
  /** Max attempts configured for the job. */
  attempts: number;
  updateProgress?(progress: number | object): Promise<void>;
  log?(row: string): Promise<unknown>;
}

export function isFinalAttempt(job: JobInfo): boolean {
  return job.attemptsMade + 1 >= Math.max(1, job.attempts);
}
