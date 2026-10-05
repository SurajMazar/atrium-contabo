import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Context } from './context';
import { run, type RunOptions } from './exec';

type Ctx = Pick<Context, 'root' | 'childEnv'>;

/** Run pnpm at the repository root with the project env loaded. */
export function pnpm(ctx: Ctx, args: string[], opts: RunOptions = {}) {
  return run('pnpm', args, { cwd: ctx.root, ...opts, env: { ...ctx.childEnv(), ...opts.env } });
}

/** Library packages with a build script whose dist/ is missing. */
export function unbuiltPackages(root: string): string[] {
  const dir = join(root, 'packages');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, name, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; main?: string };
      return !!pkg.scripts?.build && !!pkg.main?.includes('dist') && !existsSync(join(dir, name, 'dist'));
    } catch {
      return false;
    }
  });
}

/** Build every library under packages/ (turbo caches unchanged ones). */
export async function buildPackages(ctx: Ctx, opts: RunOptions = {}) {
  await pnpm(ctx, ['exec', 'turbo', 'run', 'build', '--filter=./packages/*', '--output-logs=errors-only'], opts);
}

/** `prisma migrate deploy` — applies pending migrations, never generates new ones. */
export async function migrateDeploy(ctx: Ctx, opts: RunOptions = {}) {
  await pnpm(ctx, ['--filter', '@atrium/db', 'db:deploy'], opts);
}

/** Run the seed script. `demo` additionally sets SEED_DEMO=1 (demo organization + websites). */
export async function seed(ctx: Ctx, demo: boolean, opts: RunOptions = {}) {
  await pnpm(ctx, ['--filter', '@atrium/db', 'db:seed'], { ...opts, env: { ...opts.env, ...(demo ? { SEED_DEMO: '1' } : {}) } });
}
