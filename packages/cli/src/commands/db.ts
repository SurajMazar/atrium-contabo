import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import repl from 'node:repl';
import type { Command } from 'commander';
import { context, type Context } from '../lib/context';
import { EnvFile } from '../lib/env';
import { loadDbPackage, migrationStatus, requireFrom, type PrismaLike } from '../lib/db';
import { run, which } from '../lib/exec';
import { examples } from '../lib/help';
import { requireEngine, serviceContainer } from '../lib/runtime';
import {
  CliError,
  ask,
  color,
  intro,
  isInteractive,
  log,
  maskUrl,
  outro,
  table,
  task,
} from '../lib/ui';
import { migrateDeploy, pnpm, seed } from '../lib/workspace';

function dbUrl(ctx: Context): string {
  const url = ctx.vars.DATABASE_URL;
  if (!url)
    throw new CliError(
      'DATABASE_URL is not set',
      'Run `atrium setup env` or `atrium config set DATABASE_URL …`.',
    );
  return url;
}

async function printMigrationStatus(ctx: Context) {
  const m = await migrationStatus(ctx.root, dbUrl(ctx), ctx.p.migrationsDir);
  log.raw(
    table(
      ['MIGRATION', 'STATE'],
      m.local.map((name) => [
        name,
        m.applied.includes(name)
          ? color.green('applied')
          : m.failed.includes(name)
            ? color.red('failed')
            : color.yellow('pending'),
      ]),
    ),
  );
  if (m.unknown.length)
    log.warn(
      `Applied in the database but missing locally: ${m.unknown.join(', ')} (is this checkout behind?)`,
    );
  return m;
}

/** Find a psql-capable runner: the compose postgres container, else local psql. */
async function psqlRunner(ctx: Context): Promise<{ cmd: string; args: string[]; via: string }> {
  const url = new URL(dbUrl(ctx));
  const local = /^(localhost|127\.0\.0\.1|::1)$/.test(url.hostname);
  const container = local ? await serviceContainer('postgres') : undefined;
  if (container?.state === 'running') {
    const e = await requireEngine(false);
    const user = decodeURIComponent(url.username) || ctx.vars.POSTGRES_USER || 'atrium';
    const dbName = url.pathname.slice(1) || ctx.vars.POSTGRES_DB || 'atrium';
    return {
      cmd: e.bin,
      args: [
        'exec',
        isInteractive() ? '-it' : '-i',
        container.name,
        'psql',
        '-U',
        user,
        '-d',
        dbName,
      ],
      via: `${container.name} (${e.engine})`,
    };
  }
  if (which('psql')) return { cmd: 'psql', args: [url.toString()], via: 'local psql' };
  throw new CliError(
    'No psql available',
    'Install the PostgreSQL client (brew install libpq) or start the compose postgres container.',
  );
}

export function registerDb(program: Command) {
  program
    .command('migrate')
    .description('Apply pending database migrations (prisma migrate deploy) — like `bench migrate`')
    .option('--dev', 'create/apply a migration from schema changes (prisma migrate dev)')
    .option('--name <name>', 'migration name for --dev')
    .option('--status', 'only show migration status')
    .option('--create-only', 'with --dev: write the migration without applying it')
    .addHelpText(
      'after',
      examples([
        ['atrium migrate'],
        ['atrium migrate --status'],
        [
          'atrium migrate --dev --name add_site_tags',
          'after editing packages/db/prisma/schema.prisma',
        ],
      ]),
    )
    .action(async function (
      this: Command,
      opts: { dev?: boolean; name?: string; status?: boolean; createOnly?: boolean },
    ) {
      const ctx = context(this);
      log.info(`Database: ${color.dim(maskUrl(dbUrl(ctx)))}`);
      if (opts.status) {
        await printMigrationStatus(ctx);
        return;
      }
      if (opts.dev) {
        if (ctx.vars.NODE_ENV === 'production')
          throw new CliError(
            'Refusing `migrate dev` with NODE_ENV=production',
            'Use `atrium migrate` (deploy) in production.',
          );
        await pnpm(ctx, [
          '--filter',
          '@atrium/db',
          'exec',
          'prisma',
          'migrate',
          'dev',
          ...(opts.name ? ['--name', opts.name] : []),
          ...(opts.createOnly ? ['--create-only'] : []),
        ]);
        return;
      }
      const before = await migrationStatus(ctx.root, dbUrl(ctx), ctx.p.migrationsDir).catch(
        () => null,
      );
      if (before && !before.pending.length) {
        log.success(`Up to date (${before.applied.length} migrations applied)`);
        return;
      }
      if (before) log.info(`Pending: ${before.pending.join(', ')}`);
      await task('Applying migrations (prisma migrate deploy)', () =>
        migrateDeploy(ctx, { stdio: 'pipe' }),
      );
      await printMigrationStatus(ctx);
    });

  program
    .command('seed')
    .description('Seed plans, permissions, platform templates and the super-admin (idempotent)')
    .option('--demo', 'also create the demo organization and websites (local development only)')
    .option(
      '--env-file <file>',
      'seed with a deploy env file (e.g. deploy/podman/.env: NODE_ENV=production, SEED_ADMIN_*) instead of the checkout .env',
    )
    .option('--database-url <url>', 'override DATABASE_URL (e.g. a tunnel to a private database)')
    .action(async function (
      this: Command,
      opts: { demo?: boolean; envFile?: string; databaseUrl?: string },
    ) {
      const ctx = context(this);
      let extra: Record<string, string | undefined> = {};
      if (opts.envFile) {
        const file = EnvFile.read(resolve(opts.envFile));
        if (!file) throw new CliError(`Env file not found: ${opts.envFile}`);
        extra = file.toObject();
      }
      if (opts.databaseUrl) extra.DATABASE_URL = opts.databaseUrl;
      await seed(ctx, !!opts.demo, { env: extra });
      log.success(
        `Seeded${opts.demo ? ' (with demo content)' : ''}. Super-admin: ${color.cyan(extra.SEED_ADMIN_EMAIL ?? ctx.vars.SEED_ADMIN_EMAIL ?? '?')}`,
      );
    });

  const db = program
    .command('db')
    .description('Database utilities: status, reset, console (psql), studio');

  db.command('status')
    .description('Show applied/pending migrations')
    .action(async function (this: Command) {
      await printMigrationStatus(context(this));
    });

  db.command('reset')
    .description('Drop the database, re-apply all migrations and re-seed (DESTROYS DATA)')
    .option('--force', 'required — confirms you want to delete all data')
    .option('--no-seed', 'skip seeding after reset')
    .action(async function (this: Command, opts: { force?: boolean; seed?: boolean }) {
      const ctx = context(this);
      const url = new URL(dbUrl(ctx));
      if (!opts.force)
        throw new CliError(
          '`db reset` deletes every row in the database',
          'Re-run with --force if you are sure.',
        );
      if (ctx.vars.NODE_ENV === 'production')
        throw new CliError('Refusing to reset a database while NODE_ENV=production');
      if (isInteractive()) {
        const answer = await ask.text(
          `Type the database name (${url.pathname.slice(1)}) to confirm`,
          { required: true },
        );
        if (answer !== url.pathname.slice(1))
          throw new CliError('Confirmation did not match — aborted');
      }
      await pnpm(ctx, [
        '--filter',
        '@atrium/db',
        'exec',
        'prisma',
        'migrate',
        'reset',
        '--force',
        ...(opts.seed === false ? ['--skip-seed'] : []),
      ]);
      log.success('Database reset');
    });

  db.command('console')
    .alias('psql')
    .description('Open psql against DATABASE_URL (inside the postgres container when local)')
    .option('-c, --command <sql>', 'run a single SQL command and exit')
    .action(async function (this: Command, opts: { command?: string }) {
      const ctx = context(this);
      const r = await psqlRunner(ctx);
      log.debug(`psql via ${r.via}`);
      await run(r.cmd, [...r.args, ...(opts.command ? ['-c', opts.command] : [])], {
        env: { ...process.env, PGPASSWORD: decodeURIComponent(new URL(dbUrl(ctx)).password) },
      });
    });

  db.command('studio')
    .description('Open Prisma Studio')
    .action(async function (this: Command) {
      await pnpm(context(this), ['db:studio']);
    });

  program
    .command('console')
    .description(
      'Node.js REPL with the Prisma client and platform packages preloaded (like `bench console`)',
    )
    .addHelpText(
      'after',
      `\nPreloaded: ${['prisma (alias db)', 'schema (@atrium/schema)', 'registry (@atrium/component-registry)', 'providers (@atrium/providers)', 'serverKit (@atrium/server-kit)', 'env'].map((x) => color.cyan(x)).join(', ')}\n` +
        examples([
          ['atrium console'],
          ['> await prisma.website.findMany({ select: { slug: true, status: true } })'],
          ['> registry.registry.list().length'],
        ]),
    )
    .action(async function (this: Command) {
      const ctx = context(this);
      Object.assign(
        process.env,
        Object.fromEntries(Object.entries(ctx.vars).filter(([k]) => !(k in process.env))),
      );
      intro('atrium console');
      const ctxObj: Record<string, unknown> = { env: ctx.vars };
      let prisma: PrismaLike | undefined;
      try {
        prisma = loadDbPackage(ctx.root).createPrismaClient({ url: dbUrl(ctx), max: 2 });
        ctxObj.prisma = prisma;
        ctxObj.db = prisma;
        log.success(`prisma → ${color.dim(maskUrl(dbUrl(ctx)))}`);
      } catch (e) {
        log.warn(`prisma unavailable: ${(e as Error).message}`);
      }
      for (const [name, dir] of [
        ['schema', 'packages/schema'],
        ['registry', 'packages/component-registry'],
        ['providers', 'packages/providers'],
        ['serverKit', 'packages/server-kit'],
        ['builder', 'packages/builder-core'],
      ] as const) {
        if (!existsSync(join(ctx.root, dir, 'dist'))) continue;
        try {
          ctxObj[name] = requireFrom(ctx.root, dir, './dist/index.cjs');
          log.success(`${name} → ${dir}`);
        } catch {
          try {
            ctxObj[name] = requireFrom(ctx.root, dir, '.');
            log.success(`${name} → ${dir}`);
          } catch (e) {
            log.debug(`${name}: ${(e as Error).message}`);
          }
        }
      }
      outro('Top-level await is supported. .exit to quit.');
      const r = repl.start({
        prompt: color.cyan('atrium> '),
        useGlobal: false,
        breakEvalOnSigint: true,
      });
      Object.assign(r.context, ctxObj);
      mkdirSync(ctx.p.atriumDir, { recursive: true });
      r.setupHistory(join(ctx.p.atriumDir, 'console_history'), () => undefined);
      await new Promise<void>((resolve) => r.on('exit', () => resolve()));
      await prisma?.$disconnect().catch(() => undefined);
    });
}
