import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { formatCommand } from './exec';
import type { AppService, ServiceCommand } from './services';

export interface PidRecord {
  service: string;
  pid: number;
  mode: 'dev' | 'prod';
  command: string;
  startedAt: string;
  log: string;
}

const COLORS = [pc.cyan, pc.magenta, pc.yellow, pc.green, pc.blue, pc.red];

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readPids(runDir: string): PidRecord[] {
  if (!existsSync(runDir)) return [];
  return readdirSync(runDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(runDir, f), 'utf8')) as PidRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is PidRecord => !!r);
}

export function alivePids(runDir: string): PidRecord[] {
  return readPids(runDir).filter((r) => isAlive(r.pid));
}

/** Signal a whole process group (pnpm → next → workers), falling back to the pid. */
export function killTree(pid: number, signal: NodeJS.Signals = 'SIGTERM') {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

export async function stopPid(rec: PidRecord, runDir: string, timeoutMs = 10_000): Promise<boolean> {
  if (isAlive(rec.pid)) {
    killTree(rec.pid, 'SIGTERM');
    const deadline = Date.now() + timeoutMs;
    while (isAlive(rec.pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    if (isAlive(rec.pid)) killTree(rec.pid, 'SIGKILL');
  }
  rmSync(join(runDir, `${rec.service}.json`), { force: true });
  return true;
}

interface Proc {
  name: string;
  child: ChildProcess;
}

export interface LaunchSpec {
  name: AppService;
  command: ServiceCommand;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

/** Start services detached, logging to .atrium/logs/<svc>.log. */
export function launchDetached(specs: LaunchSpec[], mode: 'dev' | 'prod', logsDir: string, runDir: string): PidRecord[] {
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  return specs.map((s) => {
    const logFile = join(logsDir, `${s.name}.log`);
    const fd = openSync(logFile, 'a');
    writeFileSync(fd, `\n── ${new Date().toISOString()} starting ${s.name} (${mode}): ${formatCommand(s.command.cmd, s.command.args)}\n`);
    const child = spawn(s.command.cmd, s.command.args, { cwd: s.cwd, env: s.env, detached: true, stdio: ['ignore', fd, fd] });
    child.unref();
    closeSync(fd);
    const rec: PidRecord = { service: s.name, pid: child.pid!, mode, command: formatCommand(s.command.cmd, s.command.args), startedAt: new Date().toISOString(), log: logFile };
    writeFileSync(join(runDir, `${s.name}.json`), JSON.stringify(rec, null, 2));
    return rec;
  });
}

/**
 * Foreground process manager (honcho-style): prefixes each line with the
 * service name, stops everything on Ctrl+C, and — unless keepGoing — stops
 * the rest when one process exits.
 */
export function runForeground(specs: LaunchSpec[], opts: { keepGoing?: boolean } = {}): Promise<number> {
  const width = Math.max(...specs.map((s) => s.name.length));
  const procs: Proc[] = [];
  let stopping = false;
  let exitCode = 0;

  return new Promise((resolve) => {
    const stopAll = (signal: NodeJS.Signals = 'SIGTERM') => {
      if (stopping) return;
      stopping = true;
      process.stdout.write(pc.dim(`\n${'atrium'.padEnd(width)} | stopping ${procs.map((p) => p.name).join(', ')}…\n`));
      for (const p of procs) if (p.child.pid && p.child.exitCode === null) killTree(p.child.pid, signal);
      setTimeout(() => {
        for (const p of procs) if (p.child.pid && p.child.exitCode === null) killTree(p.child.pid, 'SIGKILL');
      }, 8000).unref();
    };
    process.on('SIGINT', () => stopAll('SIGINT'));
    process.on('SIGTERM', () => stopAll('SIGTERM'));

    let remaining = specs.length;
    specs.forEach((s, i) => {
      const paint = COLORS[i % COLORS.length]!;
      const prefix = paint(`${s.name.padEnd(width)} |`);
      process.stdout.write(`${prefix} ${pc.dim(formatCommand(s.command.cmd, s.command.args))}\n`);
      const child = spawn(s.command.cmd, s.command.args, { cwd: s.cwd, env: { FORCE_COLOR: '1', ...s.env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      procs.push({ name: s.name, child });
      const pipe = (stream: NodeJS.ReadableStream | null, out: NodeJS.WriteStream) => {
        let buf = '';
        stream?.on('data', (d: Buffer) => {
          buf += d.toString();
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? '';
          for (const l of lines) out.write(`${prefix} ${l}\n`);
        });
        stream?.on('end', () => buf && out.write(`${prefix} ${buf}\n`));
      };
      pipe(child.stdout, process.stdout);
      pipe(child.stderr, process.stderr);
      child.on('error', (err) => process.stderr.write(`${prefix} ${pc.red(`failed to start: ${err.message}`)}\n`));
      child.on('exit', (code, signal) => {
        remaining--;
        process.stdout.write(`${prefix} ${code === 0 || stopping ? pc.dim(`exited (${signal ?? code})`) : pc.red(`exited with ${signal ?? code}`)}\n`);
        if (!stopping && code !== 0) exitCode = code ?? 1;
        if (!stopping && !opts.keepGoing) stopAll();
        if (remaining === 0) resolve(exitCode);
      });
    });
  });
}
