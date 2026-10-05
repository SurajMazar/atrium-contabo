#!/usr/bin/env node
// Atrium CLI launcher. Runs the built CLI (dist/index.js) when present, otherwise
// falls back to the TypeScript sources through tsx so `pnpm atrium` works on a
// fresh checkout before anything is built. Set ATRIUM_CLI_FROM_SOURCE=1 to force
// the source path while developing the CLI itself.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist', 'index.js');
const src = join(here, '..', 'src', 'cli.ts');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`atrium requires Node.js >= 22.12 (found ${process.versions.node}).`);
  process.exit(1);
}

if (existsSync(dist) && !process.env.ATRIUM_CLI_FROM_SOURCE) {
  const mod = await import(pathToFileURL(dist).href);
  await mod.run(process.argv);
} else {
  let loader;
  try {
    loader = import.meta.resolve('tsx');
  } catch {
    console.error('atrium: dist/ is missing and tsx is not installed. Run `pnpm install` then `pnpm --filter @atrium/cli build`.');
    process.exit(1);
  }
  const child = spawn(process.execPath, ['--import', loader, src, ...process.argv.slice(2)], { stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
