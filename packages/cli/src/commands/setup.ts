import { resolve as resolveDns, resolve4 } from 'node:dns/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Command } from 'commander';
import { productionChecks, summarize, type CheckResult } from '../lib/checks';
import { context, type Context } from '../lib/context';
import { EnvFile, mergeEnv } from '../lib/env';
import { examples } from '../lib/help';
import { infraUp } from '../lib/infra';
import { generateProduction, TARGET_IDS, TARGETS, type TargetId } from '../lib/production';
import { MiniRedis } from '../lib/redis';
import { compose, listProjectContainers, requireEngine } from '../lib/runtime';
import { APP_SECRETS, assessSecret } from '../lib/secrets';
import { procfile } from '../lib/services';
import {
  CliError,
  ask,
  color,
  intro,
  isInteractive,
  isJson,
  log,
  note,
  outro,
  printJson,
  statusIcon,
  table,
  task,
} from '../lib/ui';

/** Merge .env.example into .env without losing existing values. */
export async function setupEnv(
  ctx: Pick<Context, 'p'>,
  opts: {
    regenerate?: boolean;
    generate?: boolean;
    dryRun?: boolean;
    overrides?: Record<string, string>;
    quiet?: boolean;
  } = {},
) {
  const example = EnvFile.read(ctx.p.envExample);
  if (!example)
    throw new CliError(
      `${ctx.p.envExample} is missing`,
      'The repository checkout looks incomplete.',
    );
  const existing = EnvFile.read(ctx.p.env);
  const res = mergeEnv(example, existing, {
    generateSecrets: opts.generate ?? true,
    regenerateWeak: opts.regenerate,
    overrides: opts.overrides,
  });
  const changed = !existing || existing.toString() !== res.file.toString();
  if (!opts.quiet) {
    if (!existing) log.info(`Creating ${color.cyan('.env')} from .env.example`);
    if (res.added.length && existing)
      log.info(`New settings from .env.example: ${res.added.map((k) => color.cyan(k)).join(', ')}`);
    if (res.generated.length)
      log.success(
        `Generated strong secrets: ${res.generated.map((k) => color.cyan(k)).join(', ')}`,
      );
    if (res.overridden.length)
      log.info(`Updated: ${res.overridden.map((k) => color.cyan(k)).join(', ')}`);
    if (res.extra.length) log.info(`Kept local-only settings: ${res.extra.join(', ')}`);
  }
  if (existing && res.generated.includes('ENCRYPTION_KEY') && existing.get('ENCRYPTION_KEY')) {
    log.warn(
      'ENCRYPTION_KEY was replaced. Provider credentials saved with the old key cannot be decrypted — re-enter them in Integrations.',
    );
  }
  if (existing && res.generated.some((k) => k.startsWith('JWT_')))
    log.info('JWT secrets changed: existing sessions are signed out.');
  if (opts.dryRun) {
    log.info('Dry run — nothing written.');
    return res;
  }
  if (changed) {
    const backup = res.file.write(ctx.p.env, { backup: !!existing });
    if (!opts.quiet)
      log.success(
        `Wrote ${ctx.p.env}${backup ? color.dim(` (previous saved as ${relative(ctx.p.root, backup)})`) : ''}`,
      );
  } else if (!opts.quiet) log.success('.env is up to date');
  return res;
}

function printChecks(results: CheckResult[]) {
  if (isJson()) return printJson(results);
  let group = '';
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      log.raw(`\n${color.bold(group)}`);
    }
    log.raw(`  ${statusIcon(r.status)} ${r.label}${r.detail ? color.dim(` — ${r.detail}`) : ''}`);
    if (r.hint && r.status !== 'ok') log.raw(`      ${color.dim('↳')} ${color.cyan(r.hint)}`);
  }
}

export function registerSetup(program: Command) {
  const setup = program
    .command('setup')
    .description(
      'Configure environment, infrastructure and production deployments (like `bench setup`)',
    );

  setup
    .command('env')
    .description(
      'Create or update .env from .env.example non-destructively (existing values are kept)',
    )
    .option('--regenerate-secrets', 'also replace weak/placeholder secrets that are already set')
    .option('--no-generate', 'do not generate missing secrets')
    .option('--dry-run', 'show what would change without writing')
    .addHelpText(
      'after',
      examples([
        ['atrium setup env'],
        [
          'atrium setup env --regenerate-secrets',
          'rotate placeholder secrets (signs everyone out)',
        ],
        ['atrium setup env --dry-run'],
      ]),
    )
    .action(async function (
      this: Command,
      opts: { regenerateSecrets?: boolean; generate?: boolean; dryRun?: boolean },
    ) {
      const ctx = context(this);
      intro('atrium setup env');
      await setupEnv(ctx, {
        regenerate: opts.regenerateSecrets,
        generate: opts.generate,
        dryRun: opts.dryRun,
      });
      const env = EnvFile.read(ctx.p.env);
      const weak = Object.keys(APP_SECRETS).filter((k) => !assessSecret(k, env?.get(k)).ok);
      if (weak.length)
        log.warn(`Weak secrets remain: ${weak.join(', ')} — run with --regenerate-secrets`);
      outro('Done');
    });

  setup
    .command('infra [action]')
    .description(
      'Manage backing services with podman/docker compose: up | down | stop | restart | status | pull',
    )
    .option('--app', 'include the api/worker/renderer/admin containers (compose profile "app")')
    .option('--build', 'rebuild app images (with --app)')
    .option('--no-wait', 'do not wait for health checks')
    .option('--volumes', 'with `down`: also delete data volumes (DESTROYS the local database)')
    .addHelpText(
      'after',
      examples([
        [
          'atrium setup infra up',
          'postgres :55432, redis :56379, s3 :59000, mailpit :51025/:58025',
        ],
        ['atrium setup infra status'],
        [
          'atrium setup infra up --app --build',
          'also run the app containers built from infra/containers',
        ],
        ['atrium setup infra down', 'stop and remove containers, keep data'],
      ]),
    )
    .action(async function (
      this: Command,
      action = 'up',
      opts: { app?: boolean; build?: boolean; wait?: boolean; volumes?: boolean },
    ) {
      const ctx = context(this);
      const e = await requireEngine();
      log.debug(`engine: ${e.engine} (${e.composeLabel})`);
      const profiles = opts.app ? ['app'] : [];
      switch (action) {
        case 'up':
        case 'start':
          if (!existsSync(ctx.p.env)) await setupEnv(ctx);
          await infraUp({ app: opts.app, wait: opts.wait, build: opts.build });
          break;
        case 'down': {
          if (opts.volumes) {
            const ok = await ask.confirm(
              color.red('Delete ALL local data volumes (database, redis, object storage)?'),
              false,
            );
            if (!ok) throw new CliError('Aborted');
          }
          await compose(['down', ...(opts.volumes ? ['-v'] : [])], { profiles });
          log.success('Infrastructure stopped');
          break;
        }
        case 'stop':
          await compose(['stop'], { profiles });
          break;
        case 'restart':
          await compose(['restart'], { profiles });
          break;
        case 'pull':
          await compose(['pull'], { profiles });
          break;
        case 'status':
        case 'ps': {
          const list = await listProjectContainers();
          if (isJson()) return printJson(list);
          if (!list.length)
            return log.warn('No atrium containers. Start them with `atrium setup infra up`.');
          log.raw(
            table(
              ['SERVICE', 'STATE', 'HEALTH', 'PORTS', 'CONTAINER'],
              list.map((c) => [
                c.service,
                c.state === 'running' ? color.green(c.state) : color.yellow(c.state),
                c.health === 'healthy' ? color.green(c.health) : c.health,
                c.ports.map((p) => `${p.host}→${p.container}`).join(' '),
                color.dim(c.name),
              ]),
            ),
          );
          break;
        }
        default:
          throw new CliError(
            `Unknown action "${action}"`,
            'Use up | down | stop | restart | status | pull',
          );
      }
    });

  setup
    .command('production')
    .description(
      'Generate deployment artifacts for a target platform (compose+Caddy, systemd+nginx, k8s overlay, cPanel, AWS, Azure, GCP, Vercel, Fly, Railway, Render)',
    )
    .requiredOption('-t, --target <target>', `one of: ${TARGET_IDS.join(', ')}`)
    .option(
      '-d, --domain <domain>',
      'base domain; produces admin.<d>, api.<d>, *.sites.<d>, media.<d>',
    )
    .option('--email <email>', 'ACME / super-admin email (default admin@<domain>)')
    .option('--registry <registry>', 'container registry/namespace for images', 'ghcr.io/your-org')
    .option('--tag <tag>', 'image tag', 'latest')
    .option('--namespace <ns>', 'Kubernetes namespace', 'atrium')
    .option('--app-dir <dir>', 'install directory on the server (systemd/cPanel)', '/opt/atrium')
    .option('-o, --out <dir>', 'output directory (default deploy/<target>)')
    .option('--force', 'overwrite existing files in the output directory')
    .addHelpText(
      'after',
      `\n${color.bold('Targets:')}\n${TARGET_IDS.map((t) => `  ${color.cyan(t.padEnd(8))} ${TARGETS[t].title}`).join('\n')}\n` +
        examples([
          [
            'atrium setup production --target podman --domain example.com',
            'compose.yaml + Caddyfile (on-demand TLS) + Quadlet units + .env with fresh secrets',
          ],
          [
            'atrium setup production --target k8s --domain example.com --registry ghcr.io/acme --tag v1.2.0',
          ],
          ['atrium setup production --target cpanel --domain example.com --out ./cpanel-bundle'],
        ]),
    )
    .action(async function (
      this: Command,
      opts: {
        target: string;
        domain?: string;
        email?: string;
        registry: string;
        tag: string;
        namespace: string;
        appDir: string;
        out?: string;
        force?: boolean;
      },
    ) {
      const ctx = context(this);
      if (!TARGET_IDS.includes(opts.target as TargetId))
        throw new CliError(
          `Unknown target "${opts.target}"`,
          `Choose one of: ${TARGET_IDS.join(', ')}`,
        );
      const target = opts.target as TargetId;
      intro(`atrium setup production · ${target}`);
      let domain = opts.domain;
      if (!domain)
        domain = await ask.text('Base domain (admin.<domain>, api.<domain>, *.sites.<domain>)', {
          placeholder: 'example.com',
          required: true,
        });
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
        throw new CliError(
          `"${domain}" is not a valid domain`,
          'Pass a bare domain like example.com (no scheme).',
        );
      const outDir = resolve(opts.out ?? join(ctx.root, 'deploy', target));
      const example = EnvFile.read(ctx.p.envExample);
      if (!example) throw new CliError('.env.example is missing');
      const res = await task(`Generating ${TARGETS[target].title}`, async () =>
        generateProduction(
          {
            target,
            domain: domain!,
            email: opts.email ?? `admin@${domain}`,
            registry: opts.registry,
            tag: opts.tag,
            namespace: opts.namespace,
            appDir: opts.appDir,
            outDir,
            root: ctx.root,
            overwrite: opts.force,
          },
          example,
        ),
      );
      const rel = (f: string) => relative(process.cwd(), f) || '.';
      const skipped = res.files.filter((f) => f.skipped);
      log.raw(
        res.files
          .filter((f) => !f.skipped)
          .map((f) => `  ${color.green('+')} ${rel(f.path)}`)
          .join('\n'),
      );
      for (const f of res.envFiles)
        log.raw(`  ${color.green('+')} ${rel(f)} ${color.yellow('(secrets, 0600)')}`);
      if (skipped.length)
        log.warn(
          `${skipped.length} existing file(s) kept — use --force to overwrite: ${skipped.map((f) => f.rel).join(', ')}`,
        );
      if (res.nextSteps) note(res.nextSteps.trim(), 'Next steps');
      log.info(
        `Full guide: ${color.cyan(TARGETS[target].doc)} · readiness: ${color.cyan(`atrium setup check --env-file ${rel(join(outDir, target === 'k8s' ? 'config.env' : '.env'))}`)}`,
      );
      log.warn(
        'Generated env files contain secrets — never commit them. `deploy/` is git-ignored.',
      );
      outro(`Artifacts in ${rel(outDir)}`);
    });

  setup
    .command('check')
    .description(
      'Production readiness lint of an env file (https URLs, strong secrets, cookie scope, placeholders)',
    )
    .option(
      '--env-file <file>',
      'env file to check (default .env); for k8s pass config.env and secrets.env comma-separated',
    )
    .action(function (this: Command, opts: { envFile?: string }) {
      const ctx = context(this);
      const files = (opts.envFile ?? ctx.p.env).split(',').map((f) => resolve(f.trim()));
      const env: Record<string, string> = {};
      for (const f of files) {
        const e = EnvFile.read(f);
        if (!e) throw new CliError(`${f} not found`);
        Object.assign(env, e.toObject());
      }
      const results = productionChecks(env);
      printChecks(results);
      const s = summarize(results);
      log.raw(
        `\n${s.fail ? color.red(`${s.fail} blocking`) : color.green('ready')} · ${s.warn} warning(s) · ${s.ok} passed`,
      );
      if (s.fail) process.exitCode = 1;
    });

  setup
    .command('ssl')
    .description(
      'TLS/HTTPS guidance for your topology, and DNS checks for admin/api/wildcard records',
    )
    .option('-d, --domain <domain>', 'base domain to check DNS for')
    .action(async function (this: Command, opts: { domain?: string }) {
      const ctx = context(this);
      const domain = opts.domain ?? ctx.vars.ATRIUM_DOMAIN;
      note(
        [
          `${color.bold('Caddy (compose/Quadlet, recommended):')} automatic HTTPS for admin/api, and on-demand TLS for`,
          '  platform subdomains + customer domains. Caddy asks the API before issuing:',
          `  ${color.cyan('GET /v1/public/domains/check?domain=<host>')} → 200 for platform subdomains and connected custom domains. See infra/caddy/Caddyfile.`,
          `  For many tenant subdomains, prefer one wildcard cert via DNS-01 (caddy-dns plugin) — Let's Encrypt`,
          '  limits certificates per registered domain per week.',
          `${color.bold('nginx (systemd):')} certbot — wildcard needs DNS-01:`,
          `  ${color.cyan('certbot certonly --dns-<provider> -d "sites.example.com" -d "*.sites.example.com"')}`,
          `  ${color.cyan('certbot --nginx -d admin.example.com -d api.example.com')}`,
          `${color.bold('Kubernetes:')} cert-manager ClusterIssuer (HTTP-01 for admin/api, DNS-01 for the wildcard).`,
          `${color.bold('cPanel:')} AutoSSL covers the domains you add in cPanel → Domains.`,
          `${color.bold('Vercel/Cloudflare/managed:')} certificates are issued automatically per domain.`,
        ].join('\n'),
        'HTTPS',
      );
      if (!domain) return log.info('Pass --domain example.com to verify DNS records.');
      const hosts = [
        `admin.${domain}`,
        `api.${domain}`,
        `sites.${domain}`,
        `wildcard-check-${Date.now()}.sites.${domain}`,
      ];
      for (const h of hosts) {
        try {
          const ips = await resolve4(h).catch(
            async () => (await resolveDns(h, 'CNAME')) as string[],
          );
          log.raw(
            `  ${statusIcon('ok')} ${h.startsWith('wildcard-check') ? `*.sites.${domain}` : h} → ${ips.join(', ')}`,
          );
        } catch {
          log.raw(
            `  ${statusIcon('fail')} ${h.startsWith('wildcard-check') ? `*.sites.${domain} (wildcard)` : h} — no A/CNAME record`,
          );
        }
      }
    });

  setup
    .command('redis')
    .description(
      'Check Redis for BullMQ (noeviction, persistence) and optionally fix the running instance or write a redis.conf',
    )
    .option('--apply', 'apply recommended settings to the running Redis (CONFIG SET)')
    .option('-o, --out <file>', 'write a production redis.conf')
    .action(async function (this: Command, opts: { apply?: boolean; out?: string }) {
      const ctx = context(this);
      if (opts.out) {
        writeFileSync(
          resolve(opts.out),
          [
            '# Redis for Atrium (BullMQ queues + cache). Generated by `atrium setup redis`.',
            '# BullMQ requires noeviction: evicting keys silently loses jobs.',
            'maxmemory-policy noeviction',
            '# Persistence: AOF every second + RDB snapshots.',
            'appendonly yes',
            'appendfsync everysec',
            'save 900 1 300 10 60 10000',
            '# Set a password and bind privately in production:',
            '# requirepass <generate with openssl rand -base64 32>',
            '# bind 127.0.0.1 ::1',
            'protected-mode yes',
            'tcp-keepalive 60',
            '',
          ].join('\n'),
        );
        log.success(`Wrote ${opts.out}`);
      }
      const url = ctx.vars.REDIS_URL;
      if (!url) throw new CliError('REDIS_URL is not set');
      const r = await MiniRedis.connect(url).catch((e: Error) => {
        throw new CliError(
          `Cannot connect to Redis at ${url.replace(/:[^:@/]+@/, ':••••@')}: ${e.message}`,
          'Start it with `atrium setup infra up`.',
        );
      });
      try {
        const info = await r.info('server');
        const policy = ((await r.command(['CONFIG', 'GET', 'maxmemory-policy'])) as string[])[1];
        const aof = ((await r.command(['CONFIG', 'GET', 'appendonly'])) as string[])[1];
        log.raw(`  Redis ${info.redis_version} · maxmemory-policy=${policy} · appendonly=${aof}`);
        log.raw(
          `  ${statusIcon(policy === 'noeviction' ? 'ok' : 'fail')} maxmemory-policy noeviction ${policy === 'noeviction' ? '' : color.dim('(BullMQ may lose jobs)')}`,
        );
        log.raw(
          `  ${statusIcon(aof === 'yes' ? 'ok' : 'warn')} appendonly yes ${aof === 'yes' ? '' : color.dim('(queue state lost on restart)')}`,
        );
        if (opts.apply) {
          await r.command(['CONFIG', 'SET', 'maxmemory-policy', 'noeviction']);
          await r.command(['CONFIG', 'SET', 'appendonly', 'yes']);
          log.success(
            'Applied (runtime only — persist it in redis.conf / the managed service settings).',
          );
        }
      } finally {
        r.close();
      }
    });

  setup
    .command('procfile')
    .description(
      'Write a Procfile describing the app processes (honcho/overmind/foreman compatible)',
    )
    .option('--prod', 'production commands (node dist / next start)')
    .action(function (this: Command, opts: { prod?: boolean }) {
      const ctx = context(this);
      writeFileSync(ctx.p.procfile, procfile(opts.prod ? 'prod' : 'dev'));
      log.success(`Wrote ${relative(process.cwd(), ctx.p.procfile)}`);
      if (!isInteractive()) log.raw(readFileSync(ctx.p.procfile, 'utf8'));
    });
}
