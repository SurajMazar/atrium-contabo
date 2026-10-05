import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { CliError } from './ui';

/**
 * Workspace packages (pg, @atrium/db, @atrium/schema, the AWS SDK…) are resolved
 * at runtime from the checkout instead of being bundled into the CLI. This keeps
 * the CLI small and lets it run before the rest of the monorepo is built.
 */
export function requireFrom<T = unknown>(root: string, pkgDir: string, request: string): T {
  const req = createRequire(join(root, pkgDir, 'package.json'));
  return req(request) as T;
}

export function canResolveFrom(root: string, pkgDir: string, request: string): boolean {
  try {
    createRequire(join(root, pkgDir, 'package.json')).resolve(request);
    return true;
  } catch {
    return false;
  }
}

export interface PgClient {
  connect(): Promise<void>;
  query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
  end(): Promise<void>;
}

export function loadPg(root: string): {
  Client: new (cfg: {
    connectionString: string;
    connectionTimeoutMillis?: number;
    statement_timeout?: number;
  }) => PgClient;
} {
  try {
    return requireFrom(root, 'packages/db', 'pg');
  } catch {
    throw new CliError(
      'Cannot load the `pg` driver from packages/db',
      'Run `pnpm install` at the repository root.',
    );
  }
}

export async function withPg<T>(
  root: string,
  url: string,
  fn: (c: PgClient) => Promise<T>,
  timeoutMs = 4000,
): Promise<T> {
  const { Client } = loadPg(root);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: timeoutMs });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Load the built @atrium/db package (PrismaClient factory). */
export function loadDbPackage(root: string): {
  createPrismaClient: (opts?: { url?: string; max?: number }) => PrismaLike;
} {
  const dist = join(root, 'packages', 'db', 'dist', 'index.js');
  if (!existsSync(dist))
    throw new CliError(
      '@atrium/db is not built',
      'Run `pnpm --filter @atrium/db build` (or `atrium build`).',
    );
  return createRequire(join(root, 'package.json'))(join(root, 'packages', 'db')) as never;
}

/** Load a built workspace library by package directory (e.g. packages/schema). */
export function loadWorkspacePackage<T = Record<string, unknown>>(root: string, dir: string): T {
  const pkgDir = join(root, dir);
  if (!existsSync(join(pkgDir, 'dist')))
    throw new CliError(`${dir} is not built`, `Run \`pnpm --filter ./${dir} build\`.`);
  return createRequire(join(root, 'package.json'))(pkgDir) as T;
}

/** Minimal structural type for the Prisma client methods the CLI uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaLike = Record<string, any> & {
  $disconnect(): Promise<void>;
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

export interface MigrationStatus {
  local: string[];
  applied: string[];
  pending: string[];
  failed: string[];
  /** Applied in the DB but missing locally (newer code deployed elsewhere?). */
  unknown: string[];
}

export function localMigrations(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .filter(
      (d) =>
        statSync(join(migrationsDir, d)).isDirectory() &&
        existsSync(join(migrationsDir, d, 'migration.sql')),
    )
    .sort();
}

export async function migrationStatus(
  root: string,
  url: string,
  migrationsDir: string,
): Promise<MigrationStatus> {
  const local = localMigrations(migrationsDir);
  return withPg(root, url, async (c) => {
    const exists = await c.query<{ t: string | null }>(
      `select to_regclass('public._prisma_migrations')::text as t`,
    );
    if (!exists.rows[0]?.t) return { local, applied: [], pending: local, failed: [], unknown: [] };
    const { rows } = await c.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      'select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at',
    );
    const applied = rows
      .filter((r) => r.finished_at && !r.rolled_back_at)
      .map((r) => r.migration_name);
    const failed = rows
      .filter((r) => !r.finished_at && !r.rolled_back_at)
      .map((r) => r.migration_name);
    const appliedSet = new Set(applied);
    return {
      local,
      applied,
      failed,
      pending: local.filter((m) => !appliedSet.has(m)),
      unknown: applied.filter((m) => !local.includes(m)),
    };
  });
}
