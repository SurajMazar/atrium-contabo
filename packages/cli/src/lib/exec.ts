import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { CliError, color, isVerbose } from './ui';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** `inherit` streams to the terminal (default); `pipe` captures output. */
  stdio?: 'inherit' | 'pipe';
  /** Text written to stdin (pipe mode). */
  input?: string;
  /** Resolve instead of throwing on a non-zero exit. */
  allowFail?: boolean;
  /** Kill after N ms. */
  timeoutMs?: number;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function quoteArg(a: string): string {
  return /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(cmd: string, args: string[]): string {
  return [cmd, ...args].map(quoteArg).join(' ');
}

/** Find an executable on PATH (no shell). */
export function which(cmd: string): string | null {
  const exts =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      try {
        accessSync(full, constants.X_OK);
        return full;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/**
 * Spawn a command without a shell. Inherits stdio by default so long-running
 * tools (pnpm, podman, prisma) show their own progress.
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const stdio = opts.stdio ?? 'inherit';
  if (isVerbose())
    process.stderr.write(
      color.dim(`$ ${formatCommand(cmd, args)}${opts.cwd ? `  (in ${opts.cwd})` : ''}\n`),
    );
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio:
          stdio === 'inherit'
            ? opts.input !== undefined
              ? ['pipe', 'inherit', 'inherit']
              : 'inherit'
            : ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    if (child.stdin) {
      if (opts.input !== undefined) child.stdin.end(opts.input);
      else child.stdin.end();
    }
    const timer = opts.timeoutMs
      ? setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs)
      : undefined;
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      if (err.code === 'ENOENT')
        reject(
          new CliError(
            `Command not found: ${cmd}`,
            `Install ${cmd} or make sure it is on your PATH.`,
          ),
        );
      else reject(err);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      const res = { code: code ?? (signal ? 128 : 1), stdout, stderr };
      if (res.code !== 0 && !opts.allowFail) {
        const tail = (stderr || stdout).trim().split('\n').slice(-8).join('\n');
        reject(
          new CliError(
            `\`${formatCommand(cmd, args)}\` exited with code ${res.code}`,
            stdio === 'pipe' && tail ? tail : undefined,
            res.code,
          ),
        );
      } else resolve(res);
    });
  });
}

/** Run and return trimmed stdout (throws on failure). */
export async function capture(
  cmd: string,
  args: string[],
  opts: Omit<RunOptions, 'stdio'> = {},
): Promise<string> {
  const res = await run(cmd, args, { ...opts, stdio: 'pipe' });
  return res.stdout.trim();
}

/** Like capture() but returns null instead of throwing (missing binary, non-zero exit). */
export async function tryCapture(
  cmd: string,
  args: string[],
  opts: Omit<RunOptions, 'stdio' | 'allowFail'> = {},
): Promise<string | null> {
  try {
    const res = await run(cmd, args, { ...opts, stdio: 'pipe', allowFail: true });
    return res.code === 0 ? res.stdout.trim() : null;
  } catch {
    return null;
  }
}

/** Low-level spawn for pipelines (e.g. pg_dump → gzip). */
export function spawnRaw(cmd: string, args: string[], opts: SpawnOptions = {}): ChildProcess {
  if (isVerbose()) process.stderr.write(color.dim(`$ ${formatCommand(cmd, args)}\n`));
  return spawn(cmd, args, opts);
}

/** Wait for a child process to exit; rejects on non-zero. */
export function waitFor(child: ChildProcess, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new CliError(
            `${label} failed (exit ${code})`,
            stderr.trim().split('\n').slice(-6).join('\n') || undefined,
          ),
        );
    });
  });
}
