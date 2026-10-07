import { existsSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { productionChecks, secretChecks, summarize, type CheckResult } from '../lib/checks';
import { context, type Context } from '../lib/context';
import { requireFrom, migrationStatus, withPg } from '../lib/db';
import { EnvFile } from '../lib/env';
import { tryCapture } from '../lib/exec';
import { examples } from '../lib/help';
import { hostPort, httpProbe, tcpProbe } from '../lib/net';
import { s3Settings } from '../lib/object-storage';
import { isListening, PORT_KEYS, type PortKey, currentPorts } from '../lib/ports';
import { compareVersions, prerequisiteChecks } from '../lib/prereqs';
import { MiniRedis } from '../lib/redis';
import { listProjectContainers } from '../lib/runtime';
import { rootPackageJson } from '../lib/paths';
import { alivePids } from '../lib/procs';
import { color, intro, isJson, log, outro, printJson, statusIcon } from '../lib/ui';
import { unbuiltPackages } from '../lib/workspace';

async function envChecks(ctx: Context): Promise<CheckResult[]> {
  const g = 'Environment';
  const out: CheckResult[] = [];
  if (!ctx.env)
    return [
      { group: g, label: '.env', status: 'fail', detail: 'missing', hint: 'atrium setup env' },
    ];
  out.push({ group: g, label: '.env', status: 'ok', detail: ctx.p.env });
  const example = EnvFile.read(ctx.p.envExample);
  if (example) {
    const missing = example.keys().filter((k) => !ctx.env!.has(k));
    out.push(
      missing.length
        ? {
            group: g,
            label: 'All keys from .env.example',
            status: 'warn',
            detail: `missing ${missing.join(', ')}`,
            hint: 'atrium setup env',
          }
        : { group: g, label: 'All keys from .env.example', status: 'ok' },
    );
  }
  out.push(...secretChecks(ctx.vars));
  const pkg = rootPackageJson(ctx.root);
  const wantedPnpm = pkg.packageManager?.split('@')[1];
  const pnpm = await tryCapture('pnpm', ['--version']);
  if (wantedPnpm && pnpm && compareVersions(pnpm, wantedPnpm) < 0)
    out.push({
      group: g,
      label: 'pnpm version',
      status: 'warn',
      detail: `${pnpm} < packageManager ${wantedPnpm}`,
      hint: `corepack prepare pnpm@${wantedPnpm} --activate`,
    });
  return out;
}

async function connectivityChecks(ctx: Context): Promise<CheckResult[]> {
  const g = 'Services';
  const v = ctx.vars;
  const checks: Array<Promise<CheckResult>> = [];

  checks.push(
    (async (): Promise<CheckResult> => {
      if (!v.DATABASE_URL)
        return { group: g, label: 'PostgreSQL', status: 'fail', detail: 'DATABASE_URL not set' };
      try {
        const info = await withPg(ctx.root, v.DATABASE_URL, async (c) => {
          const r = await c.query<{ v: string; db: string }>(
            "select current_setting('server_version') as v, current_database() as db",
          );
          return r.rows[0]!;
        });
        const major = Number(info.v.split('.')[0]);
        return {
          group: g,
          label: 'PostgreSQL',
          status: major >= 15 ? 'ok' : 'warn',
          detail: `v${info.v} · database ${info.db}${major < 17 ? ' (17 recommended)' : ''}`,
        };
      } catch (e) {
        return {
          group: g,
          label: 'PostgreSQL',
          status: 'fail',
          detail: (e as Error).message.slice(0, 120),
          hint: 'atrium setup infra up · check DATABASE_URL',
        };
      }
    })(),
  );

  checks.push(
    (async (): Promise<CheckResult> => {
      if (!v.REDIS_URL)
        return { group: g, label: 'Redis', status: 'fail', detail: 'REDIS_URL not set' };
      try {
        const r = await MiniRedis.connect(v.REDIS_URL);
        try {
          const info = await r.info('server');
          const policy = (
            (await r.command(['CONFIG', 'GET', 'maxmemory-policy']).catch(() => [])) as string[]
          )[1];
          const ok = !policy || policy === 'noeviction';
          return {
            group: g,
            label: 'Redis',
            status: ok ? 'ok' : 'warn',
            detail: `v${info.redis_version}${policy ? ` · maxmemory-policy=${policy}` : ''}`,
            hint: ok ? undefined : 'BullMQ needs noeviction — atrium setup redis --apply',
          };
        } finally {
          r.close();
        }
      } catch (e) {
        return {
          group: g,
          label: 'Redis',
          status: 'fail',
          detail: (e as Error).message,
          hint: 'atrium setup infra up · check REDIS_URL',
        };
      }
    })(),
  );

  checks.push(
    (async (): Promise<CheckResult> => {
      const driver = v.STORAGE_DRIVER ?? 'local';
      if (driver === 'local') {
        return {
          group: g,
          label: 'Object storage',
          status: 'ok',
          detail: `local disk at ${v.LOCAL_STORAGE_DIR ?? './storage'}`,
        };
      }
      if (driver === 'azure-blob')
        return {
          group: g,
          label: 'Object storage',
          status: 'info',
          detail: 'azure-blob (not probed by the CLI)',
        };
      const st = s3Settings(v);
      if (driver === 'r2' && (!st.bucket || !st.endpoint || !st.credentials))
        return {
          group: g,
          label: 'Object storage',
          status: 'fail',
          detail: 'STORAGE_DRIVER=r2 needs R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_URL',
          hint: 'atrium config set R2_ACCOUNT_ID <id> (see docs/deployment/cloudflare.md)',
        };
      try {
        const sdk = requireFrom<{
          S3Client: new (c: Record<string, unknown>) => {
            send(c: unknown): Promise<unknown>;
            destroy(): void;
          };
          HeadBucketCommand: new (i: Record<string, unknown>) => unknown;
        }>(ctx.root, 'packages/providers', '@aws-sdk/client-s3');
        const client = new sdk.S3Client({
          region: st.region,
          endpoint: st.endpoint,
          forcePathStyle: st.forcePathStyle,
          credentials: st.credentials,
          maxAttempts: 1,
        });
        try {
          await Promise.race([
            client.send(new sdk.HeadBucketCommand({ Bucket: st.bucket })),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
          ]);
          return {
            group: g,
            label: 'Object storage',
            status: 'ok',
            detail: `${driver} · bucket ${st.bucket} @ ${st.endpoint ?? 'AWS'}`,
          };
        } finally {
          client.destroy();
        }
      } catch (e) {
        const err = e as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
        const status = err.$metadata?.httpStatusCode;
        const detail =
          status === 404
            ? `bucket ${st.bucket} does not exist`
            : status === 403
              ? `access denied (check ${st.keyVars})`
              : err.message || err.name || 'error';
        if (/Cannot find module/.test(err.message ?? '') && st.endpoint) {
          const hp = hostPort(st.endpoint, 443);
          const t = hp
            ? await tcpProbe(hp.host, hp.port)
            : { ok: false, detail: 'bad storage endpoint' };
          return {
            group: g,
            label: 'Object storage',
            status: t.ok ? 'warn' : 'fail',
            detail: `endpoint ${t.ok ? 'reachable' : t.detail} (AWS SDK unavailable for a bucket check)`,
          };
        }
        return {
          group: g,
          label: 'Object storage',
          status: 'fail',
          detail: `${driver}: ${detail}`,
          hint:
            driver === 'r2'
              ? 'check R2_* settings (the bucket must exist and the API token needs Object Read & Write on it)'
              : status === 404
                ? 'atrium setup infra up (s3-init creates the bucket)'
                : 'atrium setup infra up · check S3_* settings',
        };
      }
    })(),
  );

  checks.push(
    (async (): Promise<CheckResult> => {
      if (!v.SMTP_HOST)
        return {
          group: g,
          label: 'SMTP',
          status: 'warn',
          detail: 'SMTP_HOST not set (platform emails disabled)',
        };
      const port = Number(v.SMTP_PORT ?? 587);
      const r = await tcpProbe(v.SMTP_HOST, port, {
        readGreeting: true,
        tls: v.SMTP_SECURE === 'true' || port === 465,
      });
      return {
        group: g,
        label: 'SMTP',
        status: r.ok ? 'ok' : 'fail',
        detail: r.ok
          ? `${v.SMTP_HOST}:${port} · ${r.detail}`
          : `${v.SMTP_HOST}:${port} — ${r.detail}`,
        hint: r.ok ? undefined : 'atrium setup infra up (mailpit) or fix SMTP_*',
      };
    })(),
  );

  const results = await Promise.all(checks);

  if (v.DATABASE_URL && results[0]?.status !== 'fail') {
    try {
      const m = await migrationStatus(ctx.root, v.DATABASE_URL, ctx.p.migrationsDir);
      results.push(
        m.failed.length
          ? {
              group: g,
              label: 'Migrations',
              status: 'fail',
              detail: `failed: ${m.failed.join(', ')}`,
              hint: 'resolve with `pnpm --filter @atrium/db exec prisma migrate resolve`',
            }
          : m.pending.length
            ? {
                group: g,
                label: 'Migrations',
                status: 'warn',
                detail: `${m.pending.length} pending (${m.pending.join(', ')})`,
                hint: 'atrium migrate',
              }
            : {
                group: g,
                label: 'Migrations',
                status: 'ok',
                detail: `${m.applied.length} applied, none pending`,
              },
      );
    } catch (e) {
      results.push({ group: g, label: 'Migrations', status: 'warn', detail: (e as Error).message });
    }
  }
  return results;
}

async function runtimeChecks(ctx: Context): Promise<CheckResult[]> {
  const g = 'Runtime';
  const out: CheckResult[] = [];
  const ports = currentPorts(ctx.env);
  const containers = await listProjectContainers();
  const pids = alivePids(ctx.p.runDir);
  for (const key of Object.keys(PORT_KEYS) as PortKey[]) {
    const port = ports[key]!;
    const spec = PORT_KEYS[key];
    const busy = await isListening(port);
    const byContainer = containers.find(
      (c) => c.state === 'running' && c.ports.some((p) => p.host === port),
    );
    const byApp = pids.find((p) => p.service === spec.service);
    if (!busy) out.push({ group: g, label: `${key} ${port}`, status: 'ok', detail: 'free' });
    else if (byContainer)
      out.push({
        group: g,
        label: `${key} ${port}`,
        status: 'ok',
        detail: `in use by ${byContainer.name}`,
      });
    else if (byApp)
      out.push({
        group: g,
        label: `${key} ${port}`,
        status: 'ok',
        detail: `in use by atrium ${byApp.service} (pid ${byApp.pid})`,
      });
    else if (
      key === 'API_PORT' &&
      (await httpProbe(`http://localhost:${port}/v1/health`, { timeoutMs: 1500 })).ok
    )
      out.push({
        group: g,
        label: `${key} ${port}`,
        status: 'ok',
        detail: 'Atrium API is running',
      });
    else
      out.push({
        group: g,
        label: `${key} ${port}`,
        status: ['ADMIN_PORT', 'RENDERER_PORT', 'API_PORT'].includes(key) ? 'info' : 'warn',
        detail: 'in use by another process (fine if it is this app in dev mode)',
        hint: `pick another: atrium config set ${key} <port>`,
      });
  }
  try {
    const fs = statfsSync(ctx.root);
    const freeGiB = (fs.bavail * fs.bsize) / 1024 ** 3;
    out.push({
      group: g,
      label: 'Disk space',
      status: freeGiB < 2 ? 'fail' : freeGiB < 10 ? 'warn' : 'ok',
      detail: `${freeGiB.toFixed(1)} GiB free`,
    });
  } catch {
    /* statfs unsupported */
  }
  if (!existsSync(join(ctx.root, 'node_modules')))
    out.push({
      group: g,
      label: 'Dependencies',
      status: 'fail',
      detail: 'node_modules missing',
      hint: 'pnpm install',
    });
  else {
    const unbuilt = unbuiltPackages(ctx.root);
    out.push(
      unbuilt.length
        ? {
            group: g,
            label: 'Workspace packages built',
            status: 'warn',
            detail: `not built: ${unbuilt.join(', ')}`,
            hint: 'atrium build --packages',
          }
        : { group: g, label: 'Workspace packages built', status: 'ok' },
    );
  }
  return out;
}

function integrationChecks(ctx: Context): CheckResult[] {
  const g = 'Integrations (optional)';
  const v = ctx.vars;
  const present = (k: string) => !!v[k] && !/REPLACE_ME/.test(v[k]!);
  const ai = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'].filter(present);
  return [
    ai.length
      ? {
          group: g,
          label: 'AI provider keys',
          status: 'ok',
          detail: `${ai.join(', ')} · default ${v.AI_DEFAULT_PROVIDER ?? 'anthropic'}${v.ANTHROPIC_MODEL ? ` (${v.ANTHROPIC_MODEL})` : ''}`,
        }
      : {
          group: g,
          label: 'AI provider keys',
          status: 'info',
          detail: 'none at platform level — organizations can add their own under Integrations',
          hint: 'atrium config set ANTHROPIC_API_KEY --stdin',
        },
    present('VERCEL_TOKEN')
      ? {
          group: g,
          label: 'Vercel',
          status: 'ok',
          detail: `token set${v.VERCEL_TEAM_ID ? ` · team ${v.VERCEL_TEAM_ID}` : ''}`,
        }
      : {
          group: g,
          label: 'Vercel',
          status: 'info',
          detail: 'no platform token (independent deployments use per-org integrations)',
        },
  ];
}

export function registerDoctor(program: Command) {
  program
    .command('doctor')
    .description(
      'Diagnose the installation: toolchain, podman machine, .env completeness + secret strength, DB/Redis/S3/SMTP connectivity, migrations, ports, disk',
    )
    .option('--quick', 'skip network/service checks')
    .addHelpText(
      'after',
      examples([['atrium doctor'], ['atrium doctor --json', 'machine-readable for CI']]),
    )
    .action(async function (this: Command, opts: { quick?: boolean }) {
      const ctx = context(this);
      if (!isJson()) intro('atrium doctor');
      const results: CheckResult[] = [];
      results.push(...(await prerequisiteChecks()));
      results.push(...(await envChecks(ctx)));
      if (!opts.quick) results.push(...(await connectivityChecks(ctx)));
      results.push(...(await runtimeChecks(ctx)));
      results.push(...integrationChecks(ctx));
      if (ctx.vars.NODE_ENV === 'production') results.push(...productionChecks(ctx.vars));
      const s = summarize(results);
      if (isJson()) {
        printJson({ summary: s, results });
      } else {
        let group = '';
        for (const r of results) {
          if (r.group !== group) {
            group = r.group;
            log.raw(`\n${color.bold(group)}`);
          }
          log.raw(
            `  ${statusIcon(r.status)} ${r.label}${r.detail ? color.dim(` — ${r.detail}`) : ''}`,
          );
          if (r.hint && r.status !== 'ok') log.raw(`      ${color.dim('↳')} ${color.cyan(r.hint)}`);
        }
        log.raw('');
        outro(
          `${s.fail ? color.red(`${s.fail} problem(s)`) : color.green('No blocking problems')} · ${s.warn} warning(s) · ${s.ok} passed`,
        );
      }
      if (s.fail) process.exitCode = 1;
    });
}
