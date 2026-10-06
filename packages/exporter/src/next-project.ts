import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { SiteSnapshot } from '@atrium/schema';

export type ProjectFiles = Map<string, Buffer | string>;

export interface BuildNextProjectOptions {
  snapshot: SiteSnapshot;
  /** Monorepo root (contains pnpm-workspace.yaml). Defaults to the nearest ancestor of cwd. */
  repoRoot?: string;
  /** Extra variables written to `.env.production` (public, non-secret values only). */
  env?: Record<string, string>;
  /** Public API base for forms/analytics; defaults to snapshot.apiBaseUrl. */
  apiBaseUrl?: string;
  /** Produce a static export build (`output: 'export'`). Default false. */
  staticExport?: boolean;
  /** Override the generated package name (default: from the site's name). */
  packageName?: string;
  /** Workspace packages to vendor; default = transitive @atrium/* deps of apps/renderer. */
  packages?: string[];
  /** Renderer app location, relative to repoRoot or absolute (default apps/renderer). */
  rendererDir?: string;
}

/** Paths never copied into an exported project. */
const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', '.git', 'coverage', 'dist', 'out', '__tests__', 'test-results', 'playwright-report']);
const EXCLUDED_FILE_PATTERNS = [/\.tsbuildinfo$/, /^\.env(\..*)?$/, /\.(test|spec)\.[cm]?[jt]sx?$/, /^test-fixtures\.[cm]?[jt]s$/, /^\.DS_Store$/, /\.log$/];

export function isExcludedPath(relPath: string): boolean {
  const parts = relPath.split(/[\\/]/);
  if (parts.slice(0, -1).some((p) => EXCLUDED_DIRS.has(p))) return true;
  const file = parts[parts.length - 1] ?? '';
  if (EXCLUDED_DIRS.has(file)) return true;
  return EXCLUDED_FILE_PATTERNS.some((re) => re.test(file));
}

export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate the monorepo root (pnpm-workspace.yaml) from ${start}`);
}

async function walk(root: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  const dir = join(root, rel);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (isExcludedPath(childRel)) continue;
    if (entry.isDirectory()) out.push(...(await walk(root, childRel)));
    else if (entry.isFile()) out.push(childRel);
  }
  return out.sort();
}

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: unknown;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** Strip // and /* *\/ comments + trailing commas so tsconfig files parse as JSON. */
export function parseJsonc<T>(text: string): T {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as T;
}

const isWorkspaceSpec = (v: string) => v.startsWith('workspace:') || v.startsWith('link:') || v.startsWith('file:');

export function slugifyPackageName(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 100);
  return s || 'atrium-site';
}

/** Map a package's `exports` field to tsconfig `paths` entries pointing at vendored sources. */
export function exportPaths(pkgName: string, dirName: string, exportsField: unknown): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  const base = `./packages/${dirName}`;
  const toSrc = (target: string): string | undefined => {
    if (target.startsWith('./src/')) return `${base}/${target.slice(2)}`;
    return undefined;
  };
  if (exportsField && typeof exportsField === 'object') {
    for (const [sub, target] of Object.entries(exportsField as Record<string, unknown>)) {
      const spec = sub === '.' ? pkgName : `${pkgName}/${sub.replace(/^\.\//, '')}`;
      const t = typeof target === 'string' ? target : target && typeof target === 'object' ? ((target as Record<string, unknown>).import ?? (target as Record<string, unknown>).default) : undefined;
      const mapped = typeof t === 'string' ? toSrc(t) : undefined;
      paths[spec] = [mapped ?? (sub === '.' ? `${base}/src/index.ts` : `${base}/src/${sub.replace(/^\.\//, '')}`)];
    }
  }
  paths[pkgName] ??= [`${base}/src/index.ts`];
  return paths;
}

/** Transitive closure of @atrium/* workspace dependencies starting at a package.json. */
async function workspaceClosure(repoRoot: string, start: PackageJson, dirsByName: Map<string, string>): Promise<string[]> {
  const seen = new Set<string>();
  const queue = Object.entries({ ...start.dependencies, ...start.peerDependencies })
    .filter(([n, v]) => n.startsWith('@atrium/') && isWorkspaceSpec(v))
    .map(([n]) => n);
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    const dir = dirsByName.get(name);
    if (!dir) continue;
    seen.add(name);
    const pkg = await readJson<PackageJson>(join(repoRoot, 'packages', dir, 'package.json'));
    for (const [n, v] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })) if (n.startsWith('@atrium/') && isWorkspaceSpec(v) && !seen.has(n)) queue.push(n);
  }
  return [...seen].sort();
}

async function packageDirs(repoRoot: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const root = join(repoRoot, 'packages');
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pj = join(root, entry.name, 'package.json');
    if (!existsSync(pj)) continue;
    const pkg = await readJson<PackageJson>(pj);
    if (pkg.name) map.set(pkg.name, entry.name);
  }
  return map;
}

const NEXT_TSCONFIG_DEFAULTS = {
  target: 'ES2023',
  lib: ['ES2023', 'DOM', 'DOM.Iterable'],
  module: 'ESNext',
  moduleResolution: 'Bundler',
  jsx: 'preserve',
  strict: true,
  noUncheckedIndexedAccess: true,
  esModuleInterop: true,
  skipLibCheck: true,
  resolveJsonModule: true,
  isolatedModules: true,
  allowJs: false,
  noEmit: true,
  incremental: true,
  forceConsistentCasingInFileNames: true,
  plugins: [{ name: 'next' }],
};

function nextConfigSource(staticExportDefault: boolean): string {
  return `import type { NextConfig } from 'next';

// Generated by Atrium. Set ATRIUM_STATIC_EXPORT=1 to produce a fully static \`out/\` directory.
const staticExport = process.env.ATRIUM_STATIC_EXPORT ? process.env.ATRIUM_STATIC_EXPORT === '1' : ${staticExportDefault ? 'true' : 'false'};

const nextConfig: NextConfig = {
  ...(staticExport ? { output: 'export' as const, trailingSlash: true } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  // Exported projects are single-site (file mode): exclude the multi-tenant *.platform.ts(x) routes.
  pageExtensions: ['tsx', 'ts'],
  // app/global-not-found.tsx renders the site's own 404 (also the exported 404.html).
  experimental: { globalNotFound: true },
  // Workspace sources are vendored under ./packages and compiled as part of this app.
  images: {
    unoptimized: staticExport,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  turbopack: { root: __dirname },
};

export default nextConfig;
`;
}

function readme(name: string, snapshot: SiteSnapshot, staticExport: boolean): string {
  return `# ${snapshot.definition.settings.name}

Standalone Next.js project exported from **Atrium** (website \`${snapshot.websiteId}\`, version ${snapshot.version}, published ${snapshot.publishedAt}).

The site renders entirely from \`site.json\` (the published snapshot) — no Atrium servers are required
except the optional public API used by forms and analytics.

## Run locally

\`\`\`bash
npm install
npm run dev        # http://localhost:3000
\`\`\`

## Build & deploy

\`\`\`bash
npm run build && npm start                      # Node server (SSR/ISR)
ATRIUM_STATIC_EXPORT=1 npm run build            # static export → ./out${staticExport ? ' (default for this export)' : ''}
\`\`\`

Deploy to Vercel with \`vercel deploy\` (a \`vercel.json\` is included), or to any Node host / static host.

## Configuration

| Variable | Purpose |
| --- | --- |
| \`ATRIUM_SNAPSHOT_SOURCE=file\` | Render from a local snapshot file (set in \`.env.production\`). |
| \`ATRIUM_SNAPSHOT_FILE=./site.json\` | Path to the snapshot. Replace this file to update content. |
| \`ATRIUM_STATIC_EXPORT=1\` | Build a static export. |
| \`ATRIUM_API_URL\` / \`NEXT_PUBLIC_ATRIUM_API_URL\` | Public Atrium API base for form submissions and analytics. |

## Layout

- \`app/\`, \`src/\`… — the Atrium renderer application
- \`packages/*/src\` — vendored Atrium libraries (schema, design tokens, components, renderer core…), resolved via \`tsconfig.json\` paths
- \`site.json\` — the published site snapshot

Package: \`${name}\`.
`;
}

/**
 * Build a standalone, deployable Next.js project for one site: the renderer app plus vendored
 * sources of its @atrium/* workspace dependencies, rendering from `site.json` in file mode.
 */
export async function buildNextProject(opts: BuildNextProjectOptions): Promise<ProjectFiles> {
  const repoRoot = resolve(opts.repoRoot ?? findRepoRoot());
  const rendererRel = opts.rendererDir ?? 'apps/renderer';
  const rendererDir = resolve(repoRoot, rendererRel);
  if (!existsSync(join(rendererDir, 'package.json'))) throw new Error(`Renderer app not found at ${rendererDir}`);
  const files: ProjectFiles = new Map();
  const rendererPkg = await readJson<PackageJson>(join(rendererDir, 'package.json'));
  const dirsByName = await packageDirs(repoRoot);
  const packages = opts.packages ?? (await workspaceClosure(repoRoot, rendererPkg, dirsByName));

  // 1) Renderer app sources.
  for (const rel of await walk(rendererDir)) files.set(rel, await readFile(join(rendererDir, rel)));

  // 2) Vendored workspace package sources (src/** only).
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const paths: Record<string, string[]> = {};
  const addDeps = (from: Record<string, string> | undefined, into: Record<string, string>) => {
    for (const [n, v] of Object.entries(from ?? {})) if (!n.startsWith('@atrium/') && !isWorkspaceSpec(v)) into[n] ??= v;
  };
  for (const name of packages) {
    const dir = dirsByName.get(name);
    if (!dir) throw new Error(`Workspace package ${name} not found under packages/`);
    const pkgRoot = join(repoRoot, 'packages', dir);
    const pkg = await readJson<PackageJson>(join(pkgRoot, 'package.json'));
    const srcRoot = join(pkgRoot, 'src');
    if (!existsSync(srcRoot)) throw new Error(`Workspace package ${name} has no src/ directory`);
    for (const rel of await walk(srcRoot)) files.set(`packages/${dir}/src/${rel}`, await readFile(join(srcRoot, rel)));
    files.set(`packages/${dir}/package.json`, `${JSON.stringify({ name, version: pkg.version ?? '0.0.0', private: true, type: 'module' }, null, 2)}\n`);
    addDeps(pkg.dependencies, dependencies);
    addDeps(pkg.peerDependencies, dependencies);
    Object.assign(paths, exportPaths(name, dir, pkg.exports));
  }
  addDeps(rendererPkg.dependencies, dependencies);
  addDeps(rendererPkg.devDependencies, devDependencies);
  for (const required of ['next', 'react', 'react-dom']) {
    if (!dependencies[required]) throw new Error(`apps/renderer/package.json must declare ${required}`);
  }
  devDependencies.typescript ??= '5.9.3';
  devDependencies['@types/node'] ??= '^24.0.0';
  devDependencies['@types/react'] ??= dependencies.react ?? '^19.0.0';
  devDependencies['@types/react-dom'] ??= dependencies['react-dom'] ?? '^19.0.0';
  for (const k of Object.keys(devDependencies)) if (dependencies[k]) delete devDependencies[k];

  const name = opts.packageName ?? slugifyPackageName(opts.snapshot.definition.settings.name);
  const staticExport = opts.staticExport ?? false;
  const sortObj = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

  // 3) Project manifests (overwrite the renderer's monorepo-specific ones).
  files.set(
    'package.json',
    `${JSON.stringify(
      {
        name,
        version: `1.0.${opts.snapshot.version}`,
        private: true,
        description: `${opts.snapshot.definition.settings.name} — exported from Atrium`,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', 'build:static': 'ATRIUM_STATIC_EXPORT=1 next build' },
        engines: { node: '>=20.9.0' },
        dependencies: sortObj(dependencies),
        devDependencies: sortObj(devDependencies),
      },
      null,
      2,
    )}\n`,
  );

  let rendererCompiler: Record<string, unknown> = {};
  let rendererInclude: string[] | undefined;
  if (existsSync(join(rendererDir, 'tsconfig.json'))) {
    const ts = parseJsonc<{ compilerOptions?: Record<string, unknown>; include?: string[] }>(await readFile(join(rendererDir, 'tsconfig.json'), 'utf8'));
    rendererCompiler = ts.compilerOptions ?? {};
    rendererInclude = ts.include;
  }
  const rendererPaths = (rendererCompiler.paths as Record<string, string[]> | undefined) ?? {};
  const { paths: _drop, baseUrl: _b, rootDir: _r, outDir: _o, tsBuildInfoFile: _t, ...restCompiler } = rendererCompiler;
  const tsconfig = {
    compilerOptions: {
      ...NEXT_TSCONFIG_DEFAULTS,
      ...restCompiler,
      noEmit: true,
      paths: { ...paths, ...rendererPaths, '@atrium/*': ['./packages/*/src/index.ts'] },
    },
    include: [...new Set([...(rendererInclude ?? []).filter((p) => !p.startsWith('..')), 'next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'])],
    exclude: ['node_modules', 'out', '.next/cache'],
  };
  files.set('tsconfig.json', `${JSON.stringify(tsconfig, null, 2)}\n`);
  files.delete('next.config.js');
  files.delete('next.config.mjs');
  files.set('next.config.ts', nextConfigSource(staticExport));
  if (!files.has('next-env.d.ts')) files.set('next-env.d.ts', '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');

  const apiBase = opts.apiBaseUrl ?? opts.snapshot.apiBaseUrl;
  const envLines = [
    '# Generated by Atrium — public configuration only (no secrets).',
    'ATRIUM_SNAPSHOT_SOURCE=file',
    'ATRIUM_SNAPSHOT_FILE=./site.json',
    ...(staticExport ? ['ATRIUM_STATIC_EXPORT=1'] : []),
    ...(apiBase ? [`ATRIUM_API_URL=${apiBase}`, `NEXT_PUBLIC_ATRIUM_API_URL=${apiBase}`] : []),
    ...Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`),
  ];
  files.set('.env.production', `${envLines.join('\n')}\n`);
  files.set('site.json', `${JSON.stringify(publicSnapshot(opts.snapshot), null, 2)}\n`);
  files.set('vercel.json', `${JSON.stringify({ $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'nextjs', installCommand: 'npm install', buildCommand: 'npm run build' }, null, 2)}\n`);
  files.set('.gitignore', ['node_modules', '.next', 'out', '.vercel', '*.tsbuildinfo', '.env*.local', ''].join('\n'));
  files.set('README.md', readme(name, opts.snapshot, staticExport));
  return files;
}

/**
 * The snapshot shipped in an exported project (pushed to Vercel/Netlify/Git, possibly a public
 * repository). Form rules hold recipient emails, phone numbers and webhook URLs — often secret
 * capability URLs — and the exported site never needs them: submissions go back to the API,
 * which runs the rules from its own copy.
 */
function publicSnapshot<T>(snapshot: T): T {
  const s = snapshot as unknown as { definition?: { forms?: Array<Record<string, unknown>> } };
  if (!s?.definition?.forms) return snapshot;
  return { ...s, definition: { ...s.definition, forms: s.definition.forms.map(({ rules: _rules, ...form }) => ({ ...form, rules: [] })) } } as unknown as T;
}

/** Convert a project file map to DeploymentProvider files. */
export function toDeploymentFiles(files: ProjectFiles): Array<{ path: string; content: Buffer | string }> {
  return [...files.entries()].map(([path, content]) => ({ path, content }));
}

/** Write a project file map to disk (smoke tests, CLI `atrium export`). */
export async function writeProject(files: ProjectFiles, dir: string): Promise<void> {
  const root = resolve(dir);
  for (const [rel, content] of files) {
    const target = resolve(root, rel);
    if (!target.startsWith(root + sep)) throw new Error(`Refusing to write outside the project: ${rel}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/** Total size in bytes of a project file map. */
export function projectSize(files: ProjectFiles): number {
  let n = 0;
  for (const v of files.values()) n += typeof v === 'string' ? Buffer.byteLength(v) : v.byteLength;
  return n;
}

