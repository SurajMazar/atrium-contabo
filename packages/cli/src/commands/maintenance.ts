import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { context } from '../lib/context';
import { migrationStatus } from '../lib/db';
import { run, tryCapture } from '../lib/exec';
import { examples } from '../lib/help';
import { cliVersion, rootPackageJson } from '../lib/paths';
import { detectEngine } from '../lib/runtime';
import { CliError, color, intro, isJson, log, outro, printJson, table, task } from '../lib/ui';
import { buildPackages, migrateDeploy, pnpm } from '../lib/workspace';

export function registerMaintenance(program: Command) {
  program
    .command('update')
    .description('Update the installation (like `bench update`): backup → git pull → pnpm install → migrate → build')
    .option('--no-pull', 'skip git pull')
    .option('--no-backup', 'skip the pre-update database backup')
    .option('--no-install', 'skip pnpm install')
    .option('--no-migrate', 'skip migrations')
    .option('--no-build', 'skip the build')
    .option('--reset', 'discard local changes (git reset --hard to upstream) — careful')
    .addHelpText('after', examples([['atrium update'], ['atrium update --no-pull', 'after switching branches yourself'], ['atrium update --no-backup --no-build', 'quick dev refresh']]))
    .action(async function (this: Command, opts: { pull?: boolean; backup?: boolean; install?: boolean; migrate?: boolean; build?: boolean; reset?: boolean }) {
      const ctx = context(this);
      intro('atrium update');
      if (opts.pull !== false) {
        const dirty = await tryCapture('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ctx.root });
        if (dirty === null) throw new CliError('Not a git repository (or git missing)', 'Use --no-pull.');
        if (dirty && !opts.reset) throw new CliError('Working tree has uncommitted changes', 'Commit/stash them, use --no-pull, or --reset to discard.');
      }
      if (opts.backup !== false && ctx.vars.DATABASE_URL) {
        await run(process.execPath, [...process.execArgv, process.argv[1]!, '--root', ctx.root, 'backup', '--label', 'pre-update'], { cwd: ctx.root, env: process.env }).catch((e: Error) => {
          throw new CliError(`Pre-update backup failed: ${e.message}`, 'Fix it, or pass --no-backup.');
        });
      }
      if (opts.pull !== false) {
        const before = await tryCapture('git', ['rev-parse', '--short', 'HEAD'], { cwd: ctx.root });
        if (opts.reset) {
          await run('git', ['fetch', '--prune'], { cwd: ctx.root });
          await run('git', ['reset', '--hard', '@{u}'], { cwd: ctx.root });
        } else await task('Pulling latest code', () => run('git', ['pull', '--ff-only'], { cwd: ctx.root, stdio: 'pipe' }));
        const after = await tryCapture('git', ['rev-parse', '--short', 'HEAD'], { cwd: ctx.root });
        log.info(before === after ? 'Already up to date' : `Updated ${before} → ${after}`);
      }
      if (opts.install !== false) await task('Installing dependencies', () => pnpm(ctx, ['install', '--frozen-lockfile'], { stdio: 'pipe' }));
      if (opts.build !== false) await task('Building workspace packages', () => buildPackages(ctx, { stdio: 'pipe' }));
      if (opts.migrate !== false) await task('Applying migrations', () => migrateDeploy(ctx, { stdio: 'pipe' }));
      if (opts.build !== false) await task('Building apps', () => pnpm(ctx, ['build'], { stdio: 'pipe' }));
      outro(`Updated. Restart services: ${color.cyan('atrium stop && atrium start --prod -d')} (or restart your systemd/k8s workloads)`);
    });

  program
    .command('build')
    .description('Build the monorepo with turbo (all apps and packages by default)')
    .option('--packages', 'only libraries under packages/')
    .option('--filter <filters...>', 'turbo filters, e.g. @atrium/api')
    .addHelpText('after', examples([['atrium build'], ['atrium build --packages'], ['atrium build --filter @atrium/api @atrium/worker']]))
    .action(async function (this: Command, opts: { packages?: boolean; filter?: string[] }) {
      const ctx = context(this);
      if (opts.packages) return buildPackages(ctx);
      const filters = (opts.filter ?? []).map((f) => `--filter=${f}`);
      await pnpm(ctx, ['exec', 'turbo', 'run', 'build', ...filters]);
    });

  program
    .command('version')
    .description('Show versions of the CLI, platform packages, toolchain and database schema')
    .action(async function (this: Command) {
      const ctx = context(this);
      const pkgs: Array<[string, string]> = [];
      for (const dir of ['apps', 'packages']) {
        const base = join(ctx.root, dir);
        if (!existsSync(base)) continue;
        for (const name of readdirSync(base)) {
          try {
            const pkg = JSON.parse(readFileSync(join(base, name, 'package.json'), 'utf8')) as { name: string; version: string };
            pkgs.push([pkg.name, pkg.version]);
          } catch {
            /* not a package */
          }
        }
      }
      const engine = await detectEngine();
      const info = {
        cli: cliVersion(),
        platform: rootPackageJson(ctx.root).version ?? null,
        git: await tryCapture('git', ['describe', '--always', '--dirty', '--tags'], { cwd: ctx.root }),
        node: process.versions.node,
        pnpm: await tryCapture('pnpm', ['--version']),
        engine: engine ? `${engine.engine} (${engine.composeLabel})` : null,
        migrations: ctx.vars.DATABASE_URL ? await migrationStatus(ctx.root, ctx.vars.DATABASE_URL, ctx.p.migrationsDir).then((m) => `${m.applied.length} applied / ${m.local.length} local`).catch(() => 'database unreachable') : null,
        packages: Object.fromEntries(pkgs),
      };
      if (isJson()) return printJson(info);
      log.raw(
        table(
          ['COMPONENT', 'VERSION'],
          [
            ['atrium cli', info.cli],
            ['git', info.git ?? '—'],
            ['node', info.node],
            ['pnpm', info.pnpm ?? '—'],
            ['container engine', info.engine ?? '—'],
            ['db migrations', info.migrations ?? '—'],
            ...pkgs.map(([n, v]) => [color.dim(n), v]),
          ],
        ),
      );
    });
}
