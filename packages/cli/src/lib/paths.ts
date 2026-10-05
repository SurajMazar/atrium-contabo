import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './ui';

function readJson<T = Record<string, unknown>>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Directory of the @atrium/cli package (works from src/ and dist/). */
export const cliRoot: string = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkg = readJson<{ name?: string }>(join(dir, 'package.json'));
    if (pkg?.name === '@atrium/cli') return dir;
    dir = dirname(dir);
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
})();

export const templatesDir = join(cliRoot, 'templates');

export function cliVersion(): string {
  return readJson<{ version?: string }>(join(cliRoot, 'package.json'))?.version ?? '0.0.0';
}

/** True if `dir` looks like the root of an Atrium checkout. */
export function isAtriumRoot(dir: string): boolean {
  if (!existsSync(join(dir, 'pnpm-workspace.yaml'))) return false;
  const pkg = readJson<{ name?: string }>(join(dir, 'package.json'));
  return pkg?.name === 'atrium' || existsSync(join(dir, 'packages', 'cli', 'package.json'));
}

/** Walk up from `start` to find the monorepo root. */
export function findRoot(start = process.cwd()): string | null {
  let dir = resolve(start);
  for (;;) {
    if (isAtriumRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let rootOverride: string | undefined;
export function setRootOverride(dir: string | undefined) {
  rootOverride = dir ? resolve(dir) : undefined;
}

/**
 * Resolve the project root: --root / ATRIUM_ROOT, else walk up from cwd, else
 * the checkout the CLI itself lives in.
 */
export function projectRoot(): string {
  const explicit = rootOverride ?? process.env.ATRIUM_ROOT;
  if (explicit) {
    if (!isAtriumRoot(explicit)) throw new CliError(`${explicit} is not an Atrium checkout`, 'Expected pnpm-workspace.yaml and packages/cli.');
    return resolve(explicit);
  }
  const found = findRoot() ?? findRoot(cliRoot);
  if (!found) throw new CliError('Not inside an Atrium checkout', 'cd into the repository or pass --root <dir>. To create one run `atrium init <dir> --repo <git-url>`.');
  return found;
}

export interface ProjectPaths {
  root: string;
  env: string;
  envExample: string;
  compose: string;
  composeProd: string;
  atriumDir: string;
  config: string;
  logsDir: string;
  runDir: string;
  procfile: string;
  backupsDir: string;
  migrationsDir: string;
}

export function paths(root = projectRoot()): ProjectPaths {
  const atriumDir = join(root, '.atrium');
  return {
    root,
    env: join(root, '.env'),
    envExample: join(root, '.env.example'),
    compose: join(root, 'infra', 'compose.yaml'),
    composeProd: join(root, 'infra', 'compose.prod.yaml'),
    atriumDir,
    config: join(atriumDir, 'config.json'),
    logsDir: join(atriumDir, 'logs'),
    runDir: join(atriumDir, 'run'),
    procfile: join(root, 'Procfile'),
    backupsDir: join(root, 'backups'),
    migrationsDir: join(root, 'packages', 'db', 'prisma', 'migrations'),
  };
}

export function rootPackageJson(root: string): { version?: string; packageManager?: string; engines?: { node?: string } } {
  return readJson(join(root, 'package.json')) ?? {};
}
