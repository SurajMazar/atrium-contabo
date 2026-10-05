import { vi } from 'vitest';
import type { JobInfo, WorkerContext } from '../src/context';
import { memoryQuotaStore } from '../src/lib/quota';

export function silentLogger(): WorkerContext['logger'] {
  const l = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: () => l };
  return l as unknown as WorkerContext['logger'];
}

export function makeCtx(overrides: { prisma?: Record<string, unknown>; resolver?: Record<string, unknown>; fetch?: typeof fetch } = {}) {
  const enqueued: Array<{ name: string; data: unknown; opts?: unknown }> = [];
  const ctx: WorkerContext = {
    prisma: { $executeRaw: vi.fn(async () => 1), ...(overrides.prisma ?? {}) } as unknown as WorkerContext['prisma'],
    resolver: (overrides.resolver ?? {}) as unknown as WorkerContext['resolver'],
    logger: silentLogger(),
    settings: {
      nodeEnv: 'test',
      apiUrl: 'http://api.test',
      adminUrl: 'http://admin.test',
      rendererUrl: 'http://renderer.test',
      allowPrivateNetwork: true,
      enableLocalBuilds: false,
      deploymentPollIntervalMs: 5000,
      deploymentPollMaxAttempts: 3,
    },
    enqueue: vi.fn(async (name: string, data: unknown, opts?: unknown) => {
      enqueued.push({ name, data, opts });
      return { id: String(enqueued.length) };
    }) as unknown as WorkerContext['enqueue'],
    fetch: overrides.fetch ?? (vi.fn() as unknown as typeof fetch),
    quota: memoryQuotaStore(),
    now: () => new Date('2026-10-05T12:00:00.000Z'),
  };
  return { ctx, enqueued };
}

export function job(over: Partial<JobInfo> = {}): JobInfo {
  return { id: 'job-1', name: 'test', attemptsMade: 0, attempts: 5, updateProgress: vi.fn(async () => undefined), ...over };
}
