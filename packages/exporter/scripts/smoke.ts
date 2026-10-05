/**
 * End-to-end smoke test for `buildNextProject`: exports a real site into a temp directory, then
 * runs `npm install` + `npm run build` there (needs network; takes a few minutes).
 *
 *   pnpm --filter @atrium/exporter smoke [--keep] [--static] [--out=/path] [--renderer=/abs/renderer-app]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeWebsite } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { THEME_PRESETS } from '@atrium/design-tokens';
import type { SiteSnapshot, WebsiteInput } from '@atrium/schema';
import { buildNextProject, findRepoRoot, projectSize, writeProject } from '../src';

const args = new Set(process.argv.slice(2));
const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const rendererArg = process.argv.find((a) => a.startsWith('--renderer='))?.slice(11);

async function loadInput(): Promise<{ input: WebsiteInput; label: string }> {
  try {
    const templatesModule = '@atrium/templates';
    const templates = (await import(templatesModule)) as { DEMO_SITES?: Array<{ key: string; website: WebsiteInput }> };
    const demo = templates.DEMO_SITES?.[0];
    if (demo) return { input: demo.website, label: `demo site "${demo.key}"` };
  } catch {
    /* templates not built yet — fall back to a minimal site */
  }
  const theme = Object.values(THEME_PRESETS)[0]!;
  return {
    label: 'minimal site',
    input: {
      settings: { name: 'Atrium Smoke Site', business: { name: 'Atrium Smoke Site', address: {} }, seo: { siteTitle: 'Atrium Smoke Site' } },
      theme,
      header: { type: 'site-header', props: {} },
      footer: { type: 'site-footer', props: {} },
      pages: [
        { title: 'Home', slug: '', isHomepage: true, status: 'published', sections: [{ type: 'hero', props: { heading: 'Hello from an exported Atrium site' } }] },
        { title: 'About', slug: 'about', status: 'published', sections: [] },
      ],
    },
  };
}

function run(cmd: string, argv: string[], cwd: string, env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd} ${argv.join(' ')}  (cwd: ${cwd})`);
    const child = spawn(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env, NODE_ENV: 'production' } });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.join(' ')} exited with ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const repoRoot = findRepoRoot();
  const { input, label } = await loadInput();
  const { value: definition, issues } = normalizeWebsite(input, registry);
  if (issues.length) console.warn(`normalization issues (${issues.length}):`, issues.slice(0, 5));
  const snapshot: SiteSnapshot = {
    websiteId: 'smoke-website',
    versionId: 'smoke-version',
    version: 1,
    publishedAt: new Date().toISOString(),
    apiBaseUrl: 'http://localhost:4000',
    definition,
    runtime: { captcha: {} },
  };
  const staticExport = args.has('--static');
  const files = await buildNextProject({ snapshot, repoRoot, staticExport, ...(rendererArg ? { rendererDir: rendererArg } : {}) });
  const dir = outArg ?? (await mkdtemp(join(tmpdir(), 'atrium-export-')));
  await writeProject(files, dir);
  console.log(`Exported ${label}: ${files.size} files, ${(projectSize(files) / 1024).toFixed(0)} KiB → ${dir}`);
  const started = Date.now();
  try {
    await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir);
    await run('npm', ['run', 'build'], dir, staticExport ? { ATRIUM_STATIC_EXPORT: '1' } : {});
    console.log(`\n✅ Exported project built successfully in ${((Date.now() - started) / 1000).toFixed(0)}s (${dir})`);
  } finally {
    if (!args.has('--keep') && !outArg) await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\n❌ Smoke test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
