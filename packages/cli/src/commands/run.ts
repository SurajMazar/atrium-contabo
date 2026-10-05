import { createReadStream, existsSync, readFileSync, statSync, watchFile } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { context, type Context } from '../lib/context';
import { migrationStatus } from '../lib/db';
import { run } from '../lib/exec';
import { examples } from '../lib/help';
import { BACKING_SERVICES, infraHealthy, infraUp } from '../lib/infra';
import { httpProbe } from '../lib/net';
import { currentPorts } from '../lib/ports';
import { alivePids, launchDetached, readPids, runForeground, stopPid, type LaunchSpec } from '../lib/procs';
import { MiniRedis, bullQueueCounts, type QueueCounts } from '../lib/redis';
import { compose, detectEngine, listProjectContainers, requireEngine, serviceContainer } from '../lib/runtime';
import { APP_SERVICES, SERVICES, isBuilt, parseOnly, procfile, type AppService } from '../lib/services';
import { CliError, color, intro, isJson, log, printJson, statusIcon, table, task } from '../lib/ui';
import { buildPackages, pnpm, unbuiltPackages } from '../lib/workspace';

function portsOf(ctx: Context): Record<string, number> {
  return currentPorts(ctx.env) as Record<string, number>;
}

function launchSpecs(ctx: Context, services: AppService[], mode: 'dev' | 'prod'): LaunchSpec[] {
  const ports = portsOf(ctx);
  return services.map((name) => {
    const s = SERVICES[name];
    const command = mode === 'dev' ? s.dev(ports) : s.prod(ports, ctx.root);
    return { name, command, cwd: command.cwd ? join(ctx.root, command.cwd) : ctx.root, env: ctx.childEnv(command.env) };
  });
}

export function registerRun(program: Command) {
  program
    .command('start')
    .description('Start the platform (like `bench start`): ensures infra is up, then runs api, worker, renderer and admin with prefixed logs')
    .option('--prod', 'run built production servers (node dist / next start) instead of dev watchers')
    .option('--only <services>', `comma-separated subset of ${APP_SERVICES.join(',')}`)
    .option('--no-infra', 'do not start/check the compose backing services')
    .option('-d, --detach', 'run in the background; logs in .atrium/logs, stop with `atrium stop`')
    .option('--turbo', 'delegate to `pnpm dev` (turbo) instead of the built-in process manager')
    .option('--keep-going', 'keep other services running when one exits')
    .addHelpText(
      'after',
      examples([
        ['atrium start', 'dev mode: infra + all four apps in one terminal (Ctrl+C stops everything)'],
        ['atrium start --only api,worker', 'just the backend'],
        ['atrium start --prod -d', 'production servers in the background (after `atrium build`)'],
        ['atrium setup procfile', 'write the equivalent Procfile for honcho/overmind'],
      ]),
    )
    .action(async function (this: Command, opts: { prod?: boolean; only?: string; infra?: boolean; detach?: boolean; turbo?: boolean; keepGoing?: boolean }) {
      const ctx = context(this);
      if (!ctx.env) throw new CliError('.env not found', 'Run `atrium init` (or `atrium setup env`) first.');
      let services: AppService[];
      try {
        services = parseOnly(opts.only);
      } catch (e) {
        throw new CliError((e as Error).message);
      }
      const mode = opts.prod ? 'prod' : 'dev';
      intro(`atrium start · ${mode}`);

      const running = alivePids(ctx.p.runDir).filter((r) => services.includes(r.service as AppService));
      if (running.length) throw new CliError(`Already running in the background: ${running.map((r) => `${r.service} (pid ${r.pid})`).join(', ')}`, 'Stop them with `atrium stop`.');

      if (opts.infra !== false) {
        if (await infraHealthy()) log.success('Infrastructure healthy');
        else await infraUp({ wait: true });
      }
      const missingLibs = unbuiltPackages(ctx.root);
      if (missingLibs.length) await task(`Building workspace packages (${missingLibs.join(', ')})`, () => buildPackages(ctx, { stdio: 'pipe' }));

      if (mode === 'prod') {
        const unbuilt = services.filter((s) => !isBuilt(ctx.root, s));
        if (unbuilt.length) throw new CliError(`Not built: ${unbuilt.join(', ')}`, 'Run `atrium build` first.');
      }
      for (const s of services) if (!existsSync(join(ctx.root, SERVICES[s].dir, 'package.json'))) throw new CliError(`${SERVICES[s].dir} does not exist`);

      if (opts.turbo) {
        if (mode === 'prod') throw new CliError('--turbo only applies to dev mode');
        await pnpm(ctx, ['dev']);
        return;
      }
      const specs = launchSpecs(ctx, services, mode);
      const ports = portsOf(ctx);
      log.raw(
        table(
          ['SERVICE', 'URL'],
          services.map((s) => [s, SERVICES[s].portKey ? `http://localhost:${ports[SERVICES[s].portKey!]}${s === 'api' ? '/v1' : ''}` : color.dim('(background jobs)')]),
        ),
      );
      if (opts.detach) {
        const recs = launchDetached(specs, mode, ctx.p.logsDir, ctx.p.runDir);
        for (const r of recs) log.success(`${r.service} started (pid ${r.pid}) → ${color.dim(r.log)}`);
        log.info(`Follow logs: ${color.cyan('atrium logs -f')} · status: ${color.cyan('atrium status')} · stop: ${color.cyan('atrium stop')}`);
        return;
      }
      const code = await runForeground(specs, { keepGoing: opts.keepGoing });
      process.exitCode = code;
    });

  program
    .command('stop [services...]')
    .description('Stop background app processes started with `atrium start -d` (and, with --infra, the compose services)')
    .option('--infra', 'also stop the backing containers (data is kept)')
    .action(async function (this: Command, names: string[], opts: { infra?: boolean }) {
      const ctx = context(this);
      const recs = readPids(ctx.p.runDir).filter((r) => !names.length || names.includes(r.service));
      if (!recs.length) log.info('No background app processes recorded.');
      for (const r of recs) {
        await task(`Stopping ${r.service} (pid ${r.pid})`, () => stopPid(r, ctx.p.runDir));
      }
      if (opts.infra) {
        await task('Stopping infrastructure containers', () => compose(['stop'], { stdio: 'pipe' }));
      }
    });

  program
    .command('status')
    .description('Show infrastructure health, app endpoints, queue depths, migrations and the current site')
    .action(async function (this: Command) {
      const ctx = context(this);
      const ports = portsOf(ctx);
      const engine = await detectEngine();
      const containers = engine ? await listProjectContainers() : [];
      const pids = readPids(ctx.p.runDir);
      const apiBase = `http://localhost:${ports.API_PORT}`;
      const probes = await Promise.all(
        APP_SERVICES.map(async (s) => {
          const spec = SERVICES[s];
          const pid = pids.find((x) => x.service === s);
          if (!spec.portKey) return { service: s, port: undefined, probe: undefined, pid };
          const url = `http://localhost:${ports[spec.portKey]}${spec.healthPath ?? '/'}`;
          return { service: s, port: ports[spec.portKey], probe: await httpProbe(url, { timeoutMs: 2500 }), pid };
        }),
      );
      const ready = await httpProbe(`${apiBase}/v1/health/ready`, { timeoutMs: 3000 });

      let queues: QueueCounts[] | { error: string } = [];
      if (ctx.vars.REDIS_URL) {
        try {
          const r = await MiniRedis.connect(ctx.vars.REDIS_URL);
          try {
            queues = await bullQueueCounts(r, ctx.vars.BULLMQ_PREFIX ?? 'bull');
          } finally {
            r.close();
          }
        } catch (e) {
          queues = { error: (e as Error).message };
        }
      }
      let migrations: Awaited<ReturnType<typeof migrationStatus>> | { error: string } | undefined;
      if (ctx.vars.DATABASE_URL) {
        migrations = await migrationStatus(ctx.root, ctx.vars.DATABASE_URL, ctx.p.migrationsDir).catch((e: Error) => ({ error: e.message }));
      }

      if (isJson()) {
        return printJson({ engine: engine?.engine ?? null, containers, apps: probes, apiReady: ready, queues, migrations, currentSite: ctx.config.currentSite ?? null });
      }
      intro('atrium status');
      log.raw(color.bold('Infrastructure') + color.dim(engine ? `  (${engine.engine} · ${engine.composeLabel})` : '  (no container engine)'));
      if (!containers.length) log.raw(`  ${statusIcon('warn')} no atrium containers — ${color.cyan('atrium setup infra up')}`);
      else {
        log.raw(
          table(
            ['  SERVICE', 'STATE', 'HEALTH', 'PORTS'],
            containers.map((c) => [
              `  ${statusIcon(c.state === 'running' && c.health !== 'unhealthy' ? 'ok' : c.service === 's3-init' && c.state === 'exited' ? 'skip' : 'fail')} ${c.service}`,
              c.state,
              c.health,
              c.ports.map((p) => `${p.host}→${p.container}`).join(' '),
            ]),
          ),
        );
        const missing = BACKING_SERVICES.filter((s) => !containers.some((c) => c.service === s));
        if (missing.length) log.raw(`  ${statusIcon('warn')} not created: ${missing.join(', ')}`);
      }

      log.raw(`\n${color.bold('Applications')}`);
      log.raw(
        table(
          ['  SERVICE', 'ENDPOINT', 'STATUS', 'PROCESS'],
          probes.map((x) => [
            `  ${statusIcon(x.probe ? (x.probe.ok ? 'ok' : 'fail') : x.pid ? 'ok' : 'skip')} ${x.service}`,
            x.port ? `http://localhost:${x.port}` : '—',
            x.probe ? (x.probe.ok ? color.green(`${x.probe.detail} · ${x.probe.ms}ms`) : color.dim(x.probe.detail ?? 'down')) : color.dim('no HTTP endpoint'),
            x.pid ? `${x.pid.mode} pid ${x.pid.pid}` : color.dim('—'),
          ]),
        ),
      );
      if (probes[0]?.probe?.ok) {
        const detail = ready.ok ? color.green('ready (db + redis)') : color.red(`not ready: ${JSON.stringify(ready.body ?? ready.detail)}`);
        log.raw(`  ${statusIcon(ready.ok ? 'ok' : 'fail')} /v1/health/ready — ${detail}`);
      }

      log.raw(`\n${color.bold('Queues')} ${color.dim('(BullMQ)')}`);
      if (!Array.isArray(queues)) log.raw(`  ${statusIcon('fail')} redis: ${queues.error}`);
      else if (!queues.length) log.raw(`  ${statusIcon('info')} no queues registered yet (the worker/API create them on first use)`);
      else log.raw(table(['  QUEUE', 'WAITING', 'ACTIVE', 'DELAYED', 'FAILED', 'COMPLETED'], queues.map((q) => [`  ${q.name}${q.paused ? color.yellow(' (paused)') : ''}`, q.waiting, q.active, q.delayed, q.failed ? color.red(String(q.failed)) : 0, q.completed])));

      log.raw(`\n${color.bold('Database')}`);
      if (!migrations) log.raw(`  ${statusIcon('warn')} DATABASE_URL not set`);
      else if ('error' in migrations) log.raw(`  ${statusIcon('fail')} ${migrations.error}`);
      else {
        const m = migrations;
        log.raw(`  ${statusIcon(m.pending.length || m.failed.length ? 'warn' : 'ok')} migrations: ${m.applied.length} applied, ${m.pending.length} pending${m.failed.length ? color.red(`, ${m.failed.length} failed`) : ''}${m.pending.length ? ` → ${color.cyan('atrium migrate')}` : ''}`);
      }
      log.raw(`\n${color.bold('Current site')}: ${ctx.config.currentSite ? color.cyan(ctx.config.currentSite) : color.dim('none (atrium use <site>)')}`);
    });

  program
    .command('logs [service]')
    .description('Show logs for an infra container (postgres, redis, s3, mailpit…) or a background app (api, worker, renderer, admin)')
    .option('-f, --follow', 'follow output')
    .option('-n, --tail <lines>', 'number of lines', '100')
    .addHelpText('after', examples([['atrium logs postgres -f'], ['atrium logs api -n 200'], ['atrium logs -f', 'all background app logs']]))
    .action(async function (this: Command, service: string | undefined, opts: { follow?: boolean; tail: string }) {
      const ctx = context(this);
      const tail = Number(opts.tail) || 100;
      const appNames = service ? (APP_SERVICES.includes(service as AppService) ? [service as AppService] : []) : APP_SERVICES;
      if (service && !appNames.length) {
        const c = await serviceContainer(service);
        if (!c) {
          const list = await listProjectContainers();
          throw new CliError(`No container or app named "${service}"`, `Containers: ${list.map((x) => x.service).join(', ') || '(none)'} · apps: ${APP_SERVICES.join(', ')}`);
        }
        const e = await requireEngine(false);
        await run(e.bin, ['logs', '--tail', String(tail), ...(opts.follow ? ['-f'] : []), c.name]);
        return;
      }
      // App logs: background log file, else the app container when running with --profile app.
      const files = appNames.map((s) => ({ s, file: join(ctx.p.logsDir, `${s}.log`) })).filter((x) => existsSync(x.file));
      if (!files.length) {
        if (service) {
          const c = await serviceContainer(service);
          if (c) {
            const e = await requireEngine(false);
            await run(e.bin, ['logs', '--tail', String(tail), ...(opts.follow ? ['-f'] : []), c.name]);
            return;
          }
        }
        throw new CliError('No app logs yet', 'Logs are written when services run in the background (`atrium start -d`); foreground `atrium start` prints them to the terminal.');
      }
      const width = Math.max(...files.map((f) => f.s.length));
      for (const { s, file } of files) {
        const lines = readFileSync(file, 'utf8').split('\n');
        const prefix = files.length > 1 ? `${color.cyan(s.padEnd(width))} | ` : '';
        for (const l of lines.slice(-tail - 1)) if (l) process.stdout.write(`${prefix}${l}\n`);
      }
      if (!opts.follow) return;
      await new Promise<void>(() => {
        for (const { s, file } of files) {
          let pos = statSync(file).size;
          const prefix = files.length > 1 ? `${color.cyan(s.padEnd(width))} | ` : '';
          watchFile(file, { interval: 500 }, (cur) => {
            if (cur.size < pos) pos = 0;
            if (cur.size === pos) return;
            const stream = createReadStream(file, { start: pos, end: cur.size - 1, encoding: 'utf8' });
            pos = cur.size;
            let buf = '';
            stream.on('data', (d) => (buf += d));
            stream.on('end', () => {
              for (const l of buf.split('\n')) if (l) process.stdout.write(`${prefix}${l}\n`);
            });
          });
        }
      });
    });

  program
    .command('procfile')
    .description('Print the Procfile equivalent of `atrium start` (see `atrium setup procfile` to write it)')
    .option('--prod', 'production commands')
    .action((opts: { prod?: boolean }) => {
      process.stdout.write(procfile(opts.prod ? 'prod' : 'dev'));
    });
}
