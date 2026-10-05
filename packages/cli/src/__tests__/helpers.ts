import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProgram } from '../index';

export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** A minimal fake Atrium checkout in a temp dir (enough for root detection + .env work). */
export function fakeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atrium-cli-test-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'atrium', version: '0.0.0-test' }));
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - tests/*\nonlyBuiltDependencies:\n  - prisma\n');
  mkdirSync(join(dir, 'packages', 'cli'), { recursive: true });
  writeFileSync(join(dir, 'packages', 'cli', 'package.json'), JSON.stringify({ name: '@atrium/cli' }));
  copyFileSync(join(REPO_ROOT, '.env.example'), join(dir, '.env.example'));
  return dir;
}

/** Run the CLI in-process, capturing stdout/stderr. */
export async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const ow = process.stdout.write.bind(process.stdout);
  const ew = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((c: string | Uint8Array) => (out.push(String(c)), true)) as typeof process.stdout.write;
  process.stderr.write = ((c: string | Uint8Array) => (err.push(String(c)), true)) as typeof process.stderr.write;
  const prevCode = process.exitCode;
  process.exitCode = 0;
  let code = 0;
  try {
    const program = createProgram();
    await program.parseAsync(['node', 'atrium', ...args]);
    code = Number(process.exitCode ?? 0);
  } catch (e) {
    const ex = e as { exitCode?: number; message?: string };
    err.push(String(ex.message ?? e));
    code = ex.exitCode ?? 1;
  } finally {
    process.stdout.write = ow;
    process.stderr.write = ew;
    process.exitCode = prevCode;
  }
  return { stdout: out.join(''), stderr: err.join(''), code };
}
