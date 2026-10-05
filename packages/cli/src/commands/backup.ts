import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import type { Command } from 'commander';
import { BACKUP_FORMAT, humanSize, listBackups, resolveBackup, rotate, sha256File, timestampName, type BackupManifest } from '../lib/backup';
import { context, type Context } from '../lib/context';
import { localMigrations, migrationStatus, requireFrom, withPg } from '../lib/db';
import { run, spawnRaw, tryCapture, waitFor, which } from '../lib/exec';
import { examples } from '../lib/help';
import { cliVersion, rootPackageJson } from '../lib/paths';
import { alivePids } from '../lib/procs';
import { requireEngine, serviceContainer } from '../lib/runtime';
import { CliError, ask, color, intro, isJson, log, outro, printJson, table, task } from '../lib/ui';

interface PgTool {
  cmd: string;
  args: (tool: 'pg_dump' | 'psql', extra: string[]) => string[];
  env: NodeJS.ProcessEnv;
  method: string;
}

/** Choose how to run pg_dump/psql: compose container → local binaries → ephemeral container. */
async function pgTool(ctx: Context): Promise<PgTool> {
  const raw = ctx.vars.DATABASE_URL;
  if (!raw) throw new CliError('DATABASE_URL is not set');
  const url = new URL(raw);
  const user = decodeURIComponent(url.username) || 'postgres';
  const db = url.pathname.slice(1).split('?')[0] || 'postgres';
  const password = decodeURIComponent(url.password);
  const local = /^(localhost|127\.0\.0\.1|::1)$/.test(url.hostname);
  if (local) {
    const c = await serviceContainer('postgres');
    if (c?.state === 'running') {
      const e = await requireEngine(false);
      // `-e PGPASSWORD` (no value) forwards it from our env, keeping it out of the process list.
      return { cmd: e.bin, args: (tool, extra) => ['exec', '-i', '-e', 'PGPASSWORD', c.name, tool, '-U', user, '-d', db, ...extra], env: { ...process.env, PGPASSWORD: password }, method: `container:${c.name}` };
    }
  }
  if (which('pg_dump') && which('psql')) {
    const clean = new URL(raw);
    clean.password = '';
    return { cmd: '', args: (tool, extra) => [tool, clean.toString(), ...extra], env: { ...process.env, PGPASSWORD: password }, method: 'local' };
  }
  const e = await requireEngine(false);
  const host = local ? (e.engine === 'podman' ? 'host.containers.internal' : 'host.docker.internal') : url.hostname;
  const target = new URL(raw);
  target.hostname = host;
  target.password = '';
  return {
    cmd: e.bin,
    args: (tool, extra) => ['run', '--rm', '-i', '-e', 'PGPASSWORD', 'docker.io/library/postgres:17-alpine', tool, target.toString(), ...extra],
    env: { ...process.env, PGPASSWORD: password },
    method: 'ephemeral-container',
  };
}

function toolCmd(t: PgTool, tool: 'pg_dump' | 'psql', extra: string[]) {
  const args = t.args(tool, extra);
  return t.cmd ? { cmd: t.cmd, args } : { cmd: args[0]!, args: args.slice(1) };
}

interface S3Like {
  send(cmd: unknown): Promise<Record<string, unknown>>;
}
interface S3Sdk {
  S3Client: new (cfg: Record<string, unknown>) => S3Like;
  ListObjectsV2Command: new (i: Record<string, unknown>) => unknown;
  GetObjectCommand: new (i: Record<string, unknown>) => unknown;
  PutObjectCommand: new (i: Record<string, unknown>) => unknown;
}

function s3Client(ctx: Context): { sdk: S3Sdk; client: S3Like; bucket: string } {
  let sdk: S3Sdk;
  try {
    sdk = requireFrom<S3Sdk>(ctx.root, 'packages/providers', '@aws-sdk/client-s3');
  } catch {
    throw new CliError('@aws-sdk/client-s3 not found in packages/providers', 'Run `pnpm install`.');
  }
  const v = ctx.vars;
  const bucket = v.S3_BUCKET;
  if (!bucket) throw new CliError('S3_BUCKET is not set');
  const client = new sdk.S3Client({
    region: v.S3_REGION ?? 'us-east-1',
    endpoint: v.S3_ENDPOINT || undefined,
    forcePathStyle: v.S3_FORCE_PATH_STYLE === 'true',
    credentials: v.S3_ACCESS_KEY_ID ? { accessKeyId: v.S3_ACCESS_KEY_ID, secretAccessKey: v.S3_SECRET_ACCESS_KEY ?? '' } : undefined,
  });
  return { sdk, client, bucket };
}

async function dumpObjects(ctx: Context, dest: string, update: (m: string) => void): Promise<{ count: number; driver: string; bucket?: string }> {
  const driver = ctx.vars.STORAGE_DRIVER ?? 'local';
  mkdirSync(dest, { recursive: true });
  if (driver === 'local') {
    const src = resolve(ctx.root, ctx.vars.LOCAL_STORAGE_DIR ?? './storage');
    if (!existsSync(src)) return { count: 0, driver };
    await run('tar', ['-cf', join(dest, 'local.tar'), '-C', src, '.'], { stdio: 'pipe' });
    return { count: readdirSync(src, { recursive: true }).length, driver };
  }
  const { sdk, client, bucket } = s3Client(ctx);
  const index: Array<{ key: string; size: number; contentType?: string }> = [];
  let token: string | undefined;
  do {
    const page = (await client.send(new sdk.ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))) as { Contents?: Array<{ Key: string; Size: number }>; NextContinuationToken?: string; IsTruncated?: boolean };
    for (const obj of page.Contents ?? []) {
      const res = (await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: obj.Key }))) as { Body: NodeJS.ReadableStream; ContentType?: string };
      const file = join(dest, 'objects', obj.Key);
      if (!file.startsWith(join(dest, 'objects'))) continue; // never escape the folder
      mkdirSync(dirname(file), { recursive: true });
      await pipeline(res.Body, createWriteStream(file));
      index.push({ key: obj.Key, size: obj.Size, contentType: res.ContentType });
      if (index.length % 25 === 0) update(`${index.length} objects`);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  writeFileSync(join(dest, 'objects.json'), JSON.stringify(index, null, 2));
  return { count: index.length, driver, bucket };
}

async function restoreObjects(ctx: Context, src: string, update: (m: string) => void): Promise<number> {
  const driver = ctx.vars.STORAGE_DRIVER ?? 'local';
  if (existsSync(join(src, 'local.tar'))) {
    const target = resolve(ctx.root, ctx.vars.LOCAL_STORAGE_DIR ?? './storage');
    mkdirSync(target, { recursive: true });
    await run('tar', ['-xf', join(src, 'local.tar'), '-C', target], { stdio: 'pipe' });
    return readdirSync(target, { recursive: true }).length;
  }
  if (driver === 'local') throw new CliError('Backup contains S3 objects but STORAGE_DRIVER=local');
  const { sdk, client, bucket } = s3Client(ctx);
  const index = JSON.parse(readFileSync(join(src, 'objects.json'), 'utf8')) as Array<{ key: string; contentType?: string }>;
  let n = 0;
  for (const o of index) {
    const file = join(src, 'objects', o.key);
    await client.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: o.key, Body: createReadStream(file), ContentLength: statSync(file).size, ContentType: o.contentType }));
    if (++n % 25 === 0) update(`${n}/${index.length} objects`);
  }
  return n;
}

export function registerBackup(program: Command) {
  program
    .command('backup')
    .description('Back up the database (pg_dump → gzip) and optionally uploaded files, with a checksummed manifest — like `bench backup`')
    .option('--with-files', 'include object storage / local uploads')
    .option('-o, --out <dir>', 'backups directory', 'backups')
    .option('--keep <n>', 'keep only the newest N backups in the directory (rotation)')
    .option('--label <label>', 'free-form label stored in the manifest')
    .option('--list', 'list existing backups')
    .addHelpText('after', examples([['atrium backup'], ['atrium backup --with-files --keep 7', 'nightly with rotation (cron/systemd timer)'], ['atrium backup --list']]))
    .action(async function (this: Command, opts: { withFiles?: boolean; out: string; keep?: string; label?: string; list?: boolean }) {
      const ctx = context(this);
      const outRoot = resolve(ctx.root, opts.out);
      if (opts.list) {
        const all = listBackups(outRoot);
        if (isJson()) return printJson(all);
        if (!all.length) return log.info(`No backups in ${outRoot}`);
        log.raw(table(['NAME', 'CREATED', 'DATABASE', 'FILES', 'LABEL'], all.map((b) => [b.name, b.manifest.createdAt, humanSize(b.manifest.database.size), b.manifest.files ? `${b.manifest.files.objects} objects · ${humanSize(b.manifest.files.size)}` : '—', b.manifest.label ?? ''])));
        return;
      }
      intro('atrium backup');
      const name = timestampName();
      const dir = join(outRoot, name);
      mkdirSync(dir, { recursive: true });
      const tool = await pgTool(ctx);
      const dbFile = join(dir, 'database.sql.gz');
      const serverVersion = await withPg(ctx.root, ctx.vars.DATABASE_URL!, async (c) => (await c.query<{ v: string }>('show server_version')).rows[0]?.v).catch(() => undefined);
      const migrations = await migrationStatus(ctx.root, ctx.vars.DATABASE_URL!, ctx.p.migrationsDir).then((m) => m.applied).catch(() => [] as string[]);

      await task(`Dumping database (${tool.method})`, async () => {
        const { cmd, args } = toolCmd(tool, 'pg_dump', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--quote-all-identifiers']);
        const child = spawnRaw(cmd, args, { env: tool.env, stdio: ['ignore', 'pipe', 'pipe'] });
        const done = waitFor(child, 'pg_dump');
        await Promise.all([pipeline(child.stdout!, createGzip({ level: 6 }), createWriteStream(dbFile, { mode: 0o600 })), done]);
      }, () => `Database dumped (${humanSize(statSync(dbFile).size)})`);

      const manifest: BackupManifest = {
        format: BACKUP_FORMAT,
        createdAt: new Date().toISOString(),
        label: opts.label,
        host: hostname(),
        atrium: { version: rootPackageJson(ctx.root).version, cli: cliVersion(), gitCommit: await tryCapture('git', ['rev-parse', '--short', 'HEAD'], { cwd: ctx.root }) },
        database: { file: 'database.sql.gz', sha256: await sha256File(dbFile), size: statSync(dbFile).size, serverVersion, migrations, method: tool.method },
      };

      if (opts.withFiles) {
        const tmp = mkdtempSync(join(dir, '.files-'));
        try {
          const res = await task(`Copying files (${ctx.vars.STORAGE_DRIVER ?? 'local'})`, (u) => dumpObjects(ctx, tmp, u), (r) => `Copied ${r.count} objects`);
          const tarFile = join(dir, 'files.tar.gz');
          await task('Packing files.tar.gz', () => run('tar', ['-czf', tarFile, '-C', tmp, '.'], { stdio: 'pipe' }));
          manifest.files = { file: 'files.tar.gz', sha256: await sha256File(tarFile), size: statSync(tarFile).size, driver: res.driver, bucket: res.bucket, objects: res.count };
        } finally {
          rmSync(tmp, { recursive: true, force: true });
        }
      }
      writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      log.success(`Backup ${color.cyan(name)} → ${relative(process.cwd(), dir)}`);
      if (opts.keep) {
        const removed = rotate(outRoot, Number(opts.keep));
        if (removed.length) log.info(`Rotation: removed ${removed.join(', ')}`);
      }
      log.warn('Backups contain personal data and password hashes — store them encrypted (e.g. object storage with SSE, restic, age).');
      outro(`Restore with: atrium restore ${name}${opts.withFiles ? ' --with-files' : ''} --force`);
    });

  program
    .command('restore <backup>')
    .description('Restore a backup made by `atrium backup` (name, path, or "latest") — overwrites the database')
    .option('--with-files', 'also restore uploaded files / objects')
    .option('-d, --dir <dir>', 'backups directory', 'backups')
    .option('--force', 'required — confirms the current database will be replaced')
    .option('--skip-verify', 'do not verify checksums')
    .action(async function (this: Command, arg: string, opts: { withFiles?: boolean; dir: string; force?: boolean; skipVerify?: boolean }) {
      const ctx = context(this);
      let b: ReturnType<typeof resolveBackup>;
      try {
        b = resolveBackup(arg, resolve(ctx.root, opts.dir));
      } catch (e) {
        throw new CliError((e as Error).message, 'List backups with `atrium backup --list`.');
      }
      const m = b.manifest;
      intro(`atrium restore ${relative(process.cwd(), b.path)}`);
      log.info(`Created ${m.createdAt} on ${m.host} · ${m.database.migrations.length} migrations · ${humanSize(m.database.size)}${m.files ? ` · files ${humanSize(m.files.size)}` : ''}`);
      if (!opts.force) throw new CliError('Restore replaces the current database', 'Re-run with --force.');
      if (ctx.vars.NODE_ENV === 'production' && !(await ask.confirm('NODE_ENV=production — really overwrite this database?', false))) throw new CliError('Aborted');
      const local = new Set(localMigrations(ctx.p.migrationsDir));
      const ahead = m.database.migrations.filter((x) => !local.has(x));
      if (ahead.length) throw new CliError(`Backup has migrations this checkout does not know: ${ahead.join(', ')}`, 'Update the code (`atrium update`) before restoring.');
      const running = alivePids(ctx.p.runDir);
      if (running.length) log.warn(`App processes are running (${running.map((r) => r.service).join(', ')}) — stop them (\`atrium stop\`) to avoid writes during restore.`);

      const dbFile = join(b.path, m.database.file);
      if (!opts.skipVerify) {
        await task('Verifying checksums', async () => {
          if ((await sha256File(dbFile)) !== m.database.sha256) throw new CliError(`Checksum mismatch for ${m.database.file}`);
          if (opts.withFiles && m.files && (await sha256File(join(b.path, m.files.file))) !== m.files.sha256) throw new CliError(`Checksum mismatch for ${m.files.file}`);
        });
      }
      const tool = await pgTool(ctx);
      await task(`Restoring database (${tool.method})`, async () => {
        const { cmd, args } = toolCmd(tool, 'psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '--single-transaction']);
        const child = spawnRaw(cmd, args, { env: tool.env, stdio: ['pipe', 'ignore', 'pipe'] });
        const done = waitFor(child, 'psql');
        await Promise.all([pipeline(createReadStream(dbFile), createGunzip(), child.stdin!), done]);
      });
      if (opts.withFiles) {
        if (!m.files) log.warn('This backup has no files');
        else {
          const tmp = mkdtempSync(join(b.path, '.restore-'));
          try {
            await run('tar', ['-xzf', join(b.path, m.files.file), '-C', tmp], { stdio: 'pipe' });
            const n = await task('Restoring files', (u) => restoreObjects(ctx, tmp, u), (count) => `Restored ${count} objects`);
            log.debug(`restored ${n}`);
          } finally {
            rmSync(tmp, { recursive: true, force: true });
          }
        }
      }
      const status = await migrationStatus(ctx.root, ctx.vars.DATABASE_URL!, ctx.p.migrationsDir).catch(() => null);
      if (status?.pending.length) log.info(`Newer migrations exist (${status.pending.length}) — run \`atrium migrate\`.`);
      outro('Restore complete. Restart services and republish sites if the renderer cache is stale.');
    });
}
