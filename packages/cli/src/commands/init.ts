import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { summarize } from '../lib/checks';
import { globalsOf } from '../lib/context';
import { EnvFile } from '../lib/env';
import { run } from '../lib/exec';
import { examples } from '../lib/help';
import { infraHealthy, infraUp } from '../lib/infra';
import { isAtriumRoot, paths, setRootOverride } from '../lib/paths';
import { APP_PORT_KEYS, INFRA_PORT_KEYS, applyPorts, currentPorts, pickPorts, type PortKey } from '../lib/ports';
import { prerequisiteChecks } from '../lib/prereqs';
import { listProjectContainers } from '../lib/runtime';
import { generateSecret } from '../lib/secrets';
import { CliError, ask, color, intro, isInteractive, log, note, outro, statusIcon, table, task } from '../lib/ui';
import { buildPackages, migrateDeploy, pnpm, seed } from '../lib/workspace';
import { setupEnv } from './setup';

interface InitOptions {
  repo?: string;
  branch?: string;
  install?: boolean;
  infra?: boolean;
  build?: boolean;
  migrate?: boolean;
  seed?: boolean;
  demo?: boolean;
  devMigrate?: boolean;
  checkPorts?: boolean;
  adminEmail?: string;
  generateAdminPassword?: boolean;
  anthropicKey?: string;
}

export function registerInit(program: Command) {
  program
    .command('init [dir]')
    .description('Bootstrap a development environment end to end (like `bench init`): prerequisites, .env with secrets, ports, install, infra, migrations, seed, build')
    .option('--repo <url>', 'git URL to clone when [dir] is not an Atrium checkout')
    .option('--branch <name>', 'branch to clone')
    .option('--no-install', 'skip `pnpm install`')
    .option('--no-infra', 'skip starting podman/docker compose services (use external Postgres/Redis/S3)')
    .option('--no-build', 'skip building workspace packages')
    .option('--no-migrate', 'skip applying database migrations')
    .option('--no-seed', 'skip seeding')
    .option('--demo', 'seed demo organization and websites')
    .option('--dev-migrate', 'use `prisma migrate dev` instead of `migrate deploy`')
    .option('--no-check-ports', 'do not auto-pick free ports')
    .option('--admin-email <email>', 'super-admin email to seed')
    .option('--generate-admin-password', 'generate a strong seed admin password instead of the documented default')
    .option('--anthropic-key <key>', 'platform Anthropic API key (optional; prefer `atrium config set ANTHROPIC_API_KEY --stdin`)')
    .addHelpText(
      'after',
      examples([
        ['pnpm atrium init', 'inside a checkout: interactive setup'],
        ['pnpm atrium init --yes --demo', 'non-interactive (CI), with demo content'],
        ['npx @atrium/cli init ./atrium --repo https://github.com/<you>/atrium.git', 'clone then set up'],
        ['pnpm atrium init --no-infra', 'bring your own PostgreSQL/Redis (edit DATABASE_URL/REDIS_URL first)'],
      ]),
    )
    .action(async function (this: Command, dir: string | undefined, opts: InitOptions) {
      const globals = globalsOf(this);
      intro('atrium init');
      const target = resolve(dir ?? globals.root ?? process.cwd());

      // 1. Prerequisites
      const checks = await task('Checking prerequisites', () => prerequisiteChecks({ needEngine: opts.infra !== false }));
      for (const c of checks) log.raw(`  ${statusIcon(c.status)} ${c.label}${c.detail ? color.dim(` — ${c.detail}`) : ''}${c.hint && c.status !== 'ok' ? `\n      ${color.dim('↳')} ${color.cyan(c.hint)}` : ''}`);
      const blocking = checks.filter((c) => c.status === 'fail');
      if (blocking.length) throw new CliError(`Missing prerequisites: ${blocking.map((c) => c.label).join(', ')}`, 'Fix the items above and re-run `atrium init` (it is safe to re-run).');

      // 2. Checkout
      if (!isAtriumRoot(target)) {
        if (!opts.repo) throw new CliError(`${target} is not an Atrium checkout`, 'Run inside the repository, or pass --repo <git-url> to clone into it.');
        if (existsSync(target) && readdirSync(target).length) throw new CliError(`${target} exists and is not empty`);
        mkdirSync(target, { recursive: true });
        await task(`Cloning ${opts.repo}`, () => run('git', ['clone', ...(opts.branch ? ['--branch', opts.branch] : []), opts.repo!, target], { stdio: 'pipe' }));
      }
      setRootOverride(target);
      const p = paths(target);
      const childEnv = (extra: Record<string, string | undefined> = {}) => ({ ...(EnvFile.read(p.env)?.toObject() ?? {}), ...process.env, ...extra }) as NodeJS.ProcessEnv;
      const ctx = { root: target, p, childEnv };

      // 3. .env
      const overrides: Record<string, string> = {};
      const existed = existsSync(p.env);
      const current = EnvFile.read(p.env) ?? EnvFile.read(p.envExample);
      if (opts.adminEmail) overrides.SEED_ADMIN_EMAIL = opts.adminEmail;
      if (opts.anthropicKey) overrides.ANTHROPIC_API_KEY = opts.anthropicKey;
      if (isInteractive() && !existed) {
        const email = await ask.text('Super-admin email', { initial: opts.adminEmail ?? current?.get('SEED_ADMIN_EMAIL') ?? 'admin@atrium.localhost', required: true });
        overrides.SEED_ADMIN_EMAIL = email;
        if (opts.generateAdminPassword || (await ask.confirm('Generate a strong admin password? (No = documented demo password)', false))) overrides.SEED_ADMIN_PASSWORD = generateSecret('SEED_ADMIN_PASSWORD');
        if (!opts.anthropicKey && (await ask.confirm('Add a platform Anthropic API key now? (optional — orgs can bring their own)', false))) {
          const key = await ask.password('ANTHROPIC_API_KEY', { optional: true });
          if (key) overrides.ANTHROPIC_API_KEY = key;
        }
      } else if (opts.generateAdminPassword && !existed) overrides.SEED_ADMIN_PASSWORD = generateSecret('SEED_ADMIN_PASSWORD');
      await setupEnv({ p }, { overrides });

      // 4. Ports
      if (opts.checkPorts !== false) {
        const env = EnvFile.read(p.env)!;
        const ports = currentPorts(env);
        const running = opts.infra === false ? [] : await listProjectContainers();
        const ours = new Set<PortKey>();
        for (const k of INFRA_PORT_KEYS) if (running.some((c) => c.state === 'running' && c.ports.some((pp) => pp.host === ports[k]))) ours.add(k);
        const keys: PortKey[] = opts.infra === false ? APP_PORT_KEYS : [...APP_PORT_KEYS, ...INFRA_PORT_KEYS];
        const plan = await task('Checking ports', () => pickPorts(keys, ports, undefined, ours));
        const changed = plan.filter((x) => x.changed);
        if (changed.length) {
          log.raw(table(['SETTING', 'WANTED', 'USING'], changed.map((c) => [c.key, String(c.wanted), color.green(String(c.chosen))])));
          if (await ask.confirm('Some default ports are busy. Use the free ports above?', true)) {
            const touched = applyPorts(env, changed.map((c) => ({ key: c.key, from: c.wanted, to: c.chosen })));
            env.write(p.env);
            log.success(`Updated ${touched.join(', ')}`);
          }
        } else log.success('All ports available');
      }

      // 5. Install
      if (opts.install !== false) await task('Installing dependencies (pnpm install)', () => pnpm(ctx, ['install', '--frozen-lockfile'], { stdio: 'pipe' }).catch(() => pnpm(ctx, ['install'], { stdio: 'pipe' })));

      // 6. Infra
      if (opts.infra !== false) {
        if (await infraHealthy()) log.success('Infrastructure already running and healthy');
        else await infraUp({ wait: true });
      }

      // 7. Build packages (db client, schema, registry… needed by migrations/seed)
      if (opts.build !== false) await task('Building workspace packages', () => buildPackages(ctx, { stdio: 'pipe' }));

      // 8. Database
      if (opts.migrate !== false) {
        if (opts.devMigrate) await pnpm(ctx, ['--filter', '@atrium/db', 'db:migrate']);
        else await task('Applying database migrations', () => migrateDeploy(ctx, { stdio: 'pipe' }));
      }
      if (opts.seed !== false && opts.migrate !== false) {
        await task(`Seeding${opts.demo ? ' (with demo content)' : ''}`, () => seed(ctx, !!opts.demo, { stdio: 'pipe' })).catch((err: Error) => {
          log.warn(`Seeding failed: ${err.message.split('\n')[0]} — run \`atrium seed\` once the seed script is available.`);
        });
      }

      // 9. Summary
      const env = EnvFile.read(p.env)!;
      const g = (k: string, d = '') => env.get(k) ?? d;
      note(
        table(
          ['SERVICE', 'URL'],
          [
            ['Admin + builder', g('ADMIN_URL')],
            ['API', `${g('API_URL')}/v1  (health: /v1/health)`],
            ['Public sites', `http://<slug>.${g('PLATFORM_SITES_DOMAIN')}`],
            ['Mailpit (email)', `http://localhost:${g('ATRIUM_MAILPIT_PORT', '58025')}`],
            ['PostgreSQL', `localhost:${g('ATRIUM_PG_PORT', '55432')}`],
            ['Redis', `localhost:${g('ATRIUM_REDIS_PORT', '56379')}`],
            ['S3 (SeaweedFS)', g('S3_ENDPOINT')],
          ],
        ),
        'Atrium is ready',
      );
      log.info(`Super-admin: ${color.cyan(g('SEED_ADMIN_EMAIL'))} — password is SEED_ADMIN_PASSWORD in .env (${color.cyan('atrium config get SEED_ADMIN_PASSWORD --reveal')})`);
      const s = summarize(checks);
      if (s.warn) log.warn(`${s.warn} prerequisite warning(s) above.`);
      outro(`Next: ${color.cyan('pnpm atrium start')}  ·  health check: ${color.cyan('pnpm atrium doctor')}`);
    });
}
