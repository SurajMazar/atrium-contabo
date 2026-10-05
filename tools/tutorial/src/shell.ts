import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const REPO = path.resolve(import.meta.dirname, '../../..');
const CACHE = path.resolve(import.meta.dirname, '../.cache/terminal');

const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

/**
 * Run a real command in the repo and capture its output for the terminal replay.
 * Cached so re-renders are fast; pass fresh=true to re-run.
 */
export function capture(cmd: string, opts: { fresh?: boolean; maxLines?: number; env?: Record<string, string>; cwd?: string; allowFail?: boolean } = {}): string {
  mkdirSync(CACHE, { recursive: true });
  const key = path.join(CACHE, `${cmd.replace(/[^a-z0-9]+/gi, '_').slice(0, 120)}.txt`);
  if (!opts.fresh && existsSync(key)) return readFileSync(key, 'utf8');
  let out: string;
  try {
    out = execSync(cmd, { cwd: opts.cwd ?? REPO, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1', ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    out = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
    if (!opts.allowFail) console.warn(`    ⚠ command exited non-zero: ${cmd}`);
  }
  const lines = strip(out).replace(/\r/g, '').split('\n').filter((l, i, a) => !(l.trim() === '' && a[i - 1]?.trim() === ''));
  const max = opts.maxLines ?? 40;
  const text = (lines.length > max ? [...lines.slice(0, max - 1), `… (${lines.length - max + 1} more lines)`] : lines).join('\n').trimEnd();
  writeFileSync(key, text);
  return text;
}
