import type { Command } from 'commander';
import { context } from '../lib/context';
import { EnvFile, KEY_PATTERN, displayValue } from '../lib/env';
import { examples } from '../lib/help';
import { assessSecret, APP_SECRETS, generateSecret, isSecretKey } from '../lib/secrets';
import { CliError, color, isJson, log, printJson, readStdin, table } from '../lib/ui';

/** Values that must parse to a specific shape before we write them. */
const VALIDATORS: Record<string, (v: string) => string | undefined> = {
  ENCRYPTION_KEY: (v) => (assessSecret('ENCRYPTION_KEY', v).reason === 'wrong-length' ? 'must be 32 random bytes, base64-encoded' : undefined),
  NODE_ENV: (v) => (['development', 'production', 'test'].includes(v) ? undefined : 'must be development | production | test'),
  STORAGE_DRIVER: (v) => (['local', 's3', 'r2', 'minio', 'seaweedfs', 'oracle', 'azure-blob'].includes(v) ? undefined : 'unknown storage driver'),
};
for (const k of ['API_PORT', 'ADMIN_PORT', 'RENDERER_PORT', 'SMTP_PORT', 'ATRIUM_PG_PORT', 'ATRIUM_REDIS_PORT', 'ATRIUM_S3_PORT']) {
  VALIDATORS[k] = (v) => (/^\d+$/.test(v) && Number(v) > 0 && Number(v) < 65536 ? undefined : 'must be a port number');
}
for (const k of ['DATABASE_URL', 'REDIS_URL', 'API_URL', 'ADMIN_URL', 'RENDERER_URL']) {
  VALIDATORS[k] = (v) => {
    try {
      new URL(v);
      return undefined;
    } catch {
      return 'must be a valid URL';
    }
  };
}

export function validateEnvValue(key: string, value: string): string | undefined {
  if (!KEY_PATTERN.test(key)) return 'keys must match [A-Za-z_][A-Za-z0-9_]*';
  return VALIDATORS[key]?.(value);
}

function loadEnv(file: string): EnvFile {
  const env = EnvFile.read(file);
  if (!env) throw new CliError(`${file} does not exist`, 'Create it with `atrium setup env` (or `atrium init`).');
  return env;
}

export function registerConfig(program: Command) {
  const config = program
    .command('config')
    .description('Read and edit settings in .env (like `bench set-config`) — secrets are masked')
    .addHelpText(
      'after',
      examples([
        ['atrium config list', 'all settings, secrets masked'],
        ['atrium config get API_URL'],
        ['atrium config set ANTHROPIC_API_KEY --stdin < key.txt', 'set a secret without it touching shell history'],
        ['atrium config set SMTP_HOST smtp.postmarkapp.com'],
        ['atrium config set JWT_ACCESS_SECRET --generate', 'generate a strong random value'],
        ['atrium config unset OLD_SETTING'],
      ]),
    );

  config
    .command('list')
    .alias('ls')
    .description('List all settings (secrets masked unless --reveal)')
    .option('--reveal', 'show secret values in clear text')
    .option('--filter <text>', 'only keys containing text (case-insensitive)')
    .action(function (this: Command, opts: { reveal?: boolean; filter?: string }) {
      const ctx = context(this);
      const env = loadEnv(ctx.p.env);
      const keys = env.keys().filter((k) => !opts.filter || k.toLowerCase().includes(opts.filter.toLowerCase()));
      if (isJson()) {
        printJson(Object.fromEntries(keys.map((k) => [k, displayValue(k, env.get(k) ?? '', opts.reveal)])));
        return;
      }
      const rows = keys.map((k) => {
        const v = env.get(k) ?? '';
        let note = '';
        if (k in APP_SECRETS) {
          const a = assessSecret(k, v);
          note = a.ok ? color.green('strong') : color.yellow(a.message ?? 'weak');
        } else if (isSecretKey(k) && !v) note = color.dim('empty');
        return [color.cyan(k), displayValue(k, v, opts.reveal) || color.dim('(empty)'), note];
      });
      log.raw(table(['KEY', 'VALUE', ''], rows));
      log.raw(color.dim(`\n${keys.length} settings in ${ctx.p.env}`));
    });

  config
    .command('get <key>')
    .description('Print one value (secrets masked unless --reveal)')
    .option('--reveal', 'print secrets in clear text (for scripts)')
    .action(function (this: Command, key: string, opts: { reveal?: boolean }) {
      const env = loadEnv(context(this).p.env);
      const v = env.get(key);
      if (v === undefined) throw new CliError(`${key} is not set`, undefined, 2);
      log.raw(displayValue(key, v, opts.reveal));
    });

  config
    .command('set <key> [value]')
    .description('Set a value (creates the key if missing; keeps comments and order)')
    .option('--stdin', 'read the value from stdin')
    .option('--generate', 'generate a strong random value (for secrets)')
    .option('--force', 'skip validation')
    .action(async function (this: Command, key: string, value: string | undefined, opts: { stdin?: boolean; generate?: boolean; force?: boolean }) {
      const ctx = context(this);
      const env = loadEnv(ctx.p.env);
      let v = value;
      if (opts.generate) v = generateSecret(key);
      else if (opts.stdin) v = await readStdin();
      if (v === undefined) throw new CliError('Missing value', 'Pass a value, --stdin or --generate.');
      const problem = validateEnvValue(key, v);
      if (problem && !opts.force) throw new CliError(`Invalid value for ${key}: ${problem}`, 'Use --force to write it anyway.');
      if (key === 'ENCRYPTION_KEY' && env.get(key) && env.get(key) !== v) {
        log.warn('Changing ENCRYPTION_KEY makes provider secrets encrypted with the old key unreadable. Re-enter them in Integrations afterwards.');
      }
      const prev = env.set(key, v);
      env.write(ctx.p.env);
      log.success(`${prev === undefined ? 'Added' : 'Updated'} ${color.cyan(key)} = ${displayValue(key, v)}`);
      if (/(_PORT|_URL)$/.test(key)) log.info('Restart running services (`atrium start`) to pick up the change.');
    });

  config
    .command('unset <key>')
    .description('Remove a key from .env')
    .action(function (this: Command, key: string) {
      const ctx = context(this);
      const env = loadEnv(ctx.p.env);
      if (!env.unset(key)) throw new CliError(`${key} is not set`, undefined, 2);
      env.write(ctx.p.env);
      log.success(`Removed ${key}`);
    });
}
