#!/usr/bin/env node
// Run a command with the monorepo root .env loaded (existing env vars win).
// Usage: node ../../scripts/with-env.mjs next dev --port 3000
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../.env', import.meta.url));
const env = { ...process.env };
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    // Next manages NODE_ENV itself (`next start` is always "production"); pass the deployment's
    // own environment separately so production-only safety checks know a local run is local.
    if (m[1] === 'NODE_ENV') {
      env.ATRIUM_DEPLOY_ENV ??= value;
      continue;
    }
    if (env[m[1]] === undefined) env[m[1]] = value;
  }
}
// Resolve local binaries (next, tsx, …) even when not launched through pnpm.
env.PATH = [path.join(process.cwd(), 'node_modules', '.bin'), env.PATH].filter(Boolean).join(path.delimiter);
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
