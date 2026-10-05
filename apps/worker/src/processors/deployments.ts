import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNextProject, findRepoRoot, toDeploymentFiles, writeProject } from '@atrium/exporter';
import type { DeploymentFile, DeploymentInfo, DeploymentLogLine, DeploymentProvider, DeploymentStatus as ProviderStatus } from '@atrium/providers';
import { SiteSnapshotSchema } from '@atrium/schema';
import type { JobPayload } from '@atrium/server-kit';
import type { JobInfo, WorkerContext } from '../context';
import { errorMessage, PermanentError } from '../lib/errors';

type DbStatus = 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED' | 'CANCELLED';
const TERMINAL = new Set<DbStatus>(['READY', 'FAILED', 'CANCELLED']);
const STATIC_ONLY = new Set(['netlify', 'cloudflare-pages']);
const MAX_LOG_LINES = 500;

export function toDbStatus(s: ProviderStatus): DbStatus {
  return ({ queued: 'QUEUED', building: 'BUILDING', ready: 'READY', failed: 'FAILED', cancelled: 'CANCELLED' } as const)[s];
}

function logLine(message: string, level: DeploymentLogLine['level'] = 'info', now = new Date()): DeploymentLogLine {
  return { timestamp: now.toISOString(), level, message };
}

/** Provider-side project name for a website (stable; persisted on Website.externalProject). */
export function projectNameFor(slug: string): string {
  return `atrium-${slug}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
}

async function loadDeployment(ctx: WorkerContext, id: string) {
  return ctx.prisma.deployment.findUnique({
    where: { id },
    include: {
      version: { select: { id: true, number: true, snapshot: true } },
      website: { select: { id: true, organizationId: true, slug: true, name: true, deploymentMode: true, deploymentProvider: true, deploymentIntegrationId: true, externalProject: true, publishedVersionId: true } },
    },
  });
}

type LoadedDeployment = NonNullable<Awaited<ReturnType<typeof loadDeployment>>>;

async function resolveProvider(ctx: WorkerContext, d: LoadedDeployment): Promise<{ provider: DeploymentProvider; driver: string; platform: boolean }> {
  const platform = d.website.deploymentMode === 'PLATFORM' || d.provider === 'self-hosted' || d.provider === 'platform';
  if (platform) {
    const r = ctx.resolver.platformDeployment();
    return { provider: r, driver: 'self-hosted', platform: true };
  }
  const meta = (d.meta ?? {}) as { integrationId?: string };
  const r = await ctx.resolver.deployment({ organizationId: d.website.organizationId, websiteId: d.website.id, integrationId: meta.integrationId ?? d.website.deploymentIntegrationId, driver: d.provider });
  return { provider: r, driver: r.driver, platform: false };
}

/** Host variables a build legitimately needs (toolchain lookup, locale, proxies, npm registry). */
const BUILD_ENV_PASSTHROUGH = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'npm_config_registry', 'NPM_CONFIG_REGISTRY'] as const;

/**
 * INT-2: environment for tenant builds — an allow-list, never the worker's own environment
 * (which holds DATABASE_URL, ENCRYPTION_KEY(S), REDIS_URL, VERCEL_TOKEN, AI keys…). HOME and the
 * npm cache point into the build's private temp directory.
 */
export function buildEnv(home: string, extra: Record<string, string>, source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of BUILD_ENV_PASSTHROUGH) {
    const v = source[k];
    if (v) env[k] = v;
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: home,
    npm_config_cache: join(home, '.npm'),
    npm_config_userconfig: join(home, '.npmrc'),
    npm_config_update_notifier: 'false',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    ...extra,
  };
}

function run(cmd: string, args: string[], cwd: string, env: Record<string, string>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const append = (b: Buffer) => {
      out = (out + b.toString()).slice(-20_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code}):\n${out.slice(-4000)}`));
    });
  });
}

async function collectDir(root: string, rel = ''): Promise<DeploymentFile[]> {
  const out: DeploymentFile[] = [];
  for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await collectDir(root, r)));
    else if (e.isFile()) out.push({ path: r, content: await readFile(join(root, r)) });
  }
  return out;
}

/** Static hosts need built output: npm install + static export build in a temp dir (opt-in). */
async function buildStatic(ctx: WorkerContext, files: Map<string, Buffer | string>, logs: DeploymentLogLine[]): Promise<DeploymentFile[]> {
  if (!ctx.settings.enableLocalBuilds) {
    throw new PermanentError('This provider deploys static files only; enable WORKER_ENABLE_LOCAL_BUILDS=1 to build static exports inside the worker, or use Vercel.');
  }
  const root = await mkdtemp(join(tmpdir(), 'atrium-build-'));
  const dir = join(root, 'project');
  const home = join(root, 'home');
  try {
    await mkdir(dir, { recursive: true });
    await mkdir(home, { recursive: true });
    await writeProject(files, dir);
    logs.push(logLine('Installing dependencies (npm install --ignore-scripts)'));
    // Lifecycle scripts of dependencies never run inside the worker.
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], dir, buildEnv(home, { NODE_ENV: 'development' }), 10 * 60_000);
    logs.push(logLine('Building static export (next build)'));
    await run('npm', ['run', 'build'], dir, buildEnv(home, { ATRIUM_STATIC_EXPORT: '1', NODE_ENV: 'production' }), 15 * 60_000);
    const out = await collectDir(join(dir, 'out'));
    logs.push(logLine(`Static export ready (${out.length} files)`));
    return out;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function emit(ctx: WorkerContext, d: LoadedDeployment, event: 'deployment.completed' | 'deployment.failed', extra: Record<string, unknown>) {
  await ctx.enqueue('webhook.dispatch', {
    organizationId: d.website.organizationId,
    websiteId: d.website.id,
    event,
    payload: { deploymentId: d.id, websiteId: d.website.id, target: d.target.toLowerCase(), provider: d.provider, version: d.version?.number ?? null, ...extra },
  }, { jobId: `dep-${d.id}-${event.replace('.', '-')}` });
  await ctx.prisma.auditLog.create({
    data: {
      organizationId: d.website.organizationId,
      websiteId: d.website.id,
      actorType: 'SYSTEM',
      actorName: 'Deployment worker',
      action: event,
      resourceType: 'deployment',
      resourceId: d.id,
      summary: event === 'deployment.completed' ? `${d.target === 'PRODUCTION' ? 'Production' : 'Preview'} deployment of v${d.version?.number ?? '?'} is live${extra.url ? ` at ${String(extra.url)}` : ''}` : `Deployment of v${d.version?.number ?? '?'} failed: ${String(extra.error ?? 'unknown error')}`,
      metadata: extra as object,
    },
  });
}

/** Persist a provider status update and run terminal side effects exactly once. */
async function applyInfo(ctx: WorkerContext, d: LoadedDeployment, info: DeploymentInfo, logs: DeploymentLogLine[], provider: DeploymentProvider, projectName: string) {
  const status = toDbStatus(info.status);
  const terminal = TERMINAL.has(status);
  const existing = (d.logs as unknown as DeploymentLogLine[]) ?? [];
  const merged = [...existing, ...logs].slice(-MAX_LOG_LINES);
  const updated = await ctx.prisma.deployment.updateMany({
    where: { id: d.id, status: { notIn: ['READY', 'FAILED', 'CANCELLED'] } },
    data: {
      status,
      externalId: info.id,
      url: info.url ?? d.url,
      inspectorUrl: info.inspectorUrl ?? d.inspectorUrl,
      error: info.error ?? (status === 'FAILED' ? 'Deployment failed at the provider' : null),
      logs: merged as unknown as object,
      ...(terminal ? { finishedAt: ctx.now() } : {}),
      meta: { ...((d.meta ?? {}) as object), projectName, ...(info.projectId ? { projectId: info.projectId } : {}) },
    },
  });
  if (!terminal || updated.count === 0) return { status, terminal };

  if (status === 'READY') {
    if (d.target === 'PRODUCTION' && d.versionId) {
      await ctx.prisma.website.update({ where: { id: d.website.id }, data: { publishedVersionId: d.versionId, status: 'PUBLISHED' } });
      await attachDomains(ctx, d, provider, projectName);
    }
    await emit(ctx, d, 'deployment.completed', { url: info.url ?? null, externalId: info.id });
  } else if (status === 'FAILED') {
    await emit(ctx, d, 'deployment.failed', { error: info.error ?? 'Deployment failed', externalId: info.id });
  }
  return { status, terminal };
}

async function attachDomains(ctx: WorkerContext, d: LoadedDeployment, provider: DeploymentProvider, projectName: string) {
  const domains = await ctx.prisma.domain.findMany({ where: { websiteId: d.website.id, environment: 'production' } });
  for (const domain of domains) {
    try {
      const cfg = await provider.addDomain(projectName, domain.hostname);
      await ctx.prisma.domain.update({
        where: { id: domain.id },
        data: {
          provider: provider.driver,
          dnsRecords: cfg.records as unknown as object,
          dnsStatus: cfg.verified ? 'verified' : cfg.misconfigured ? 'misconfigured' : 'unverified',
          sslStatus: cfg.ssl ?? (cfg.verified ? 'active' : 'pending'),
          status: cfg.verified ? 'active' : 'pending',
          lastCheckedAt: ctx.now(),
          ...(cfg.verified && !domain.verifiedAt ? { verifiedAt: ctx.now() } : {}),
        },
      });
    } catch (err) {
      ctx.logger.warn({ deploymentId: d.id, domain: domain.hostname, err: errorMessage(err) }, 'could not attach domain');
    }
  }
}

/**
 * `deployment.run` — platform mode: the self-hosted driver marks the snapshot live (no upload).
 * Independent mode: build a standalone Next.js project from the version snapshot (exporter) and
 * deploy it with the website's provider (Vercel by default), or redeploy / roll back when the
 * deployment was created by those actions. Then polls until a terminal state.
 */
export async function processDeploymentRun(ctx: WorkerContext, data: JobPayload<'deployment.run'>, _job: JobInfo) {
  const d = await loadDeployment(ctx, data.deploymentId);
  if (!d) return { skipped: 'deployment not found' };
  if (TERMINAL.has(d.status as DbStatus)) return { skipped: `already ${d.status.toLowerCase()}` };
  const logs: DeploymentLogLine[] = [logLine(`Deployment started (${d.target.toLowerCase()}, provider ${d.provider})`)];
  await ctx.prisma.deployment.update({ where: { id: d.id }, data: { status: 'BUILDING', startedAt: ctx.now() } });
  const projectName = d.website.externalProject ?? projectNameFor(d.website.slug);

  let provider: DeploymentProvider;
  let info: DeploymentInfo;
  try {
    const resolved = await resolveProvider(ctx, d);
    provider = resolved.provider;
    const meta = (d.meta ?? {}) as { action?: string; redeployExternalId?: string | null; rollbackExternalId?: string | null };
    const target = d.target === 'PRODUCTION' ? 'production' : 'preview';
    if (resolved.platform) {
      logs.push(logLine('Platform hosting: activating the published snapshot'));
      info = await provider.deploy({ projectName: d.website.slug, target, files: [], framework: 'nextjs', meta: { deploymentId: d.id } });
    } else if (meta.action === 'rollback' && meta.rollbackExternalId) {
      logs.push(logLine(`Rolling back to provider deployment ${meta.rollbackExternalId}`));
      info = await provider.rollback(projectName, meta.rollbackExternalId);
    } else if (meta.action === 'redeploy' && meta.redeployExternalId) {
      logs.push(logLine(`Redeploying provider deployment ${meta.redeployExternalId}`));
      info = await provider.redeploy(meta.redeployExternalId, target);
    } else {
      if (!d.version) throw new PermanentError('Deployment has no website version to deploy');
      const snapshot = SiteSnapshotSchema.parse(d.version.snapshot);
      const repoRoot = ctx.settings.repoRoot ?? findRepoRoot();
      const staticOnly = STATIC_ONLY.has(resolved.driver);
      const project = await buildNextProject({ snapshot, repoRoot, apiBaseUrl: snapshot.apiBaseUrl ?? ctx.settings.apiUrl, staticExport: staticOnly });
      logs.push(logLine(`Generated standalone Next.js project (${project.size} files)`));
      const files = staticOnly ? await buildStatic(ctx, project, logs) : toDeploymentFiles(project);
      info = await provider.deploy({
        projectName,
        target,
        files,
        framework: staticOnly ? 'static' : 'nextjs',
        env: { ATRIUM_SNAPSHOT_SOURCE: 'file', ATRIUM_SNAPSHOT_FILE: './site.json', ...(snapshot.apiBaseUrl ? { NEXT_PUBLIC_ATRIUM_API_URL: snapshot.apiBaseUrl } : {}) },
        meta: { atriumDeploymentId: d.id, atriumWebsiteId: d.website.id, atriumVersion: String(d.version.number) },
      });
      if (!d.website.externalProject) await ctx.prisma.website.update({ where: { id: d.website.id }, data: { externalProject: projectName } });
    }
    logs.push(logLine(`Provider accepted deployment ${info.id} (${info.status})`));
  } catch (err) {
    const message = errorMessage(err);
    logs.push(logLine(message, 'error'));
    await applyInfo(ctx, d, { id: d.externalId ?? 'n/a', status: 'failed', target: d.target === 'PRODUCTION' ? 'production' : 'preview', error: message }, logs, { driver: d.provider } as DeploymentProvider, projectName);
    ctx.logger.error({ deploymentId: d.id, err: message }, 'deployment failed');
    return { status: 'FAILED', error: message };
  }

  const res = await applyInfo(ctx, d, info, logs, provider, projectName);
  if (!res.terminal) await ctx.enqueue('deployment.poll', { deploymentId: d.id, attempt: 0 }, { delay: ctx.settings.deploymentPollIntervalMs, jobId: `dpoll-${d.id}-0` });
  ctx.logger.info({ deploymentId: d.id, status: res.status, externalId: info.id }, 'deployment submitted');
  return { status: res.status, externalId: info.id, url: info.url };
}

/** `deployment.poll` — refresh provider status + logs every few seconds until terminal (or timeout). */
export async function processDeploymentPoll(ctx: WorkerContext, data: JobPayload<'deployment.poll'>, _job: JobInfo) {
  const d = await loadDeployment(ctx, data.deploymentId);
  if (!d) return { skipped: 'deployment not found' };
  if (TERMINAL.has(d.status as DbStatus)) return { skipped: `already ${d.status.toLowerCase()}` };
  if (!d.externalId) return { skipped: 'no external id yet' };
  const projectName = ((d.meta ?? {}) as { projectName?: string }).projectName ?? d.website.externalProject ?? projectNameFor(d.website.slug);
  const { provider } = await resolveProvider(ctx, d);
  const info = await provider.getStatus(d.externalId);
  // Our own lines are kept; the provider's log stream is re-fetched in full and replaces earlier copies.
  let logs: DeploymentLogLine[] = [];
  try {
    logs = (await provider.getLogs(d.externalId)).map((l) => ({ ...l, message: `[provider] ${l.message}` }));
    d.logs = ((d.logs as unknown as DeploymentLogLine[]) ?? []).filter((l) => !l.message.startsWith('[provider] ')) as unknown as typeof d.logs;
  } catch (err) {
    ctx.logger.debug({ deploymentId: d.id, err: errorMessage(err) }, 'could not fetch provider logs');
  }
  if (toDbStatus(info.status) === 'BUILDING' || toDbStatus(info.status) === 'QUEUED') {
    if (data.attempt + 1 >= ctx.settings.deploymentPollMaxAttempts) {
      const timeout = { ...info, status: 'failed' as const, error: `Timed out waiting for the provider after ${Math.round((data.attempt * ctx.settings.deploymentPollIntervalMs) / 60_000)} minutes` };
      await applyInfo(ctx, d, timeout, [...logs, logLine(timeout.error, 'error')], provider, projectName);
      return { status: 'FAILED', timeout: true };
    }
    await applyInfo(ctx, d, info, logs, provider, projectName);
    await ctx.enqueue('deployment.poll', { deploymentId: d.id, attempt: data.attempt + 1 }, { delay: ctx.settings.deploymentPollIntervalMs, jobId: `dpoll-${d.id}-${data.attempt + 1}` });
    return { status: toDbStatus(info.status), attempt: data.attempt + 1 };
  }
  const res = await applyInfo(ctx, d, info, [...logs, logLine(`Deployment ${info.status}${info.url ? ` — ${info.url}` : ''}`, info.status === 'failed' ? 'error' : 'info')], provider, projectName);
  return { status: res.status };
}
