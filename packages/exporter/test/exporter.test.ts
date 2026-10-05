import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildNextProject,
  buildSiteBundle,
  buildSiteBundleZip,
  collectMediaReferences,
  exportPaths,
  isExcludedPath,
  parseJsonc,
  parseSiteBundle,
  parseSiteImport,
  safeArchivePath,
  slugifyPackageName,
  unzip,
  zipFiles,
} from '../src';
import { sampleDefinition, sampleSnapshot } from './fixtures';

describe('site bundle', () => {
  const def = sampleDefinition();

  it('splits a definition into files', () => {
    const files = buildSiteBundle(def, { exportedAt: '2026-10-01T00:00:00Z', website: { slug: 'aranya' } });
    expect(Object.keys(files).sort()).toEqual(
      ['collections/rooms.json', 'forms/contact.json', 'media-manifest.json', 'pages/_home.json', 'pages/rooms.json', 'pages/rooms/deluxe.json', 'site.json', 'theme.json'].sort(),
    );
    const site = JSON.parse(files['site.json']!);
    expect(site.bundle).toMatchObject({ format: 'atrium-site-bundle', version: 1, pages: ['pages/_home.json', 'pages/rooms.json', 'pages/rooms/deluxe.json'] });
    expect(site).not.toHaveProperty('pages');
    expect(site).not.toHaveProperty('theme');
    const media = JSON.parse(files['media-manifest.json']!);
    const urls = media.media.map((m: { url: string }) => m.url);
    expect(urls).toEqual(expect.arrayContaining(['https://cdn.example.com/media/hero.webp', 'https://cdn.example.com/media/suite.jpg', 'https://cdn.example.com/logo.svg', '/media/bg.png']));
    expect(media.media.find((m: { url: string }) => m.url.endsWith('hero.webp'))).toMatchObject({ mediaId: 'm1', kind: 'image' });
  });

  it('round-trips through files and zip', async () => {
    const files = buildSiteBundle(def);
    const parsed = parseSiteBundle(files);
    expect(parsed.definition).toEqual(def);
    expect(parsed.warnings).toEqual([]);
    const zip = await buildSiteBundleZip(def);
    const back = await parseSiteImport(zip);
    expect(back.source).toBe('bundle');
    expect(back.definition).toEqual(def);
  });

  it('imports raw definitions and snapshots, rejects garbage', async () => {
    expect((await parseSiteImport(JSON.stringify(def))).source).toBe('definition');
    const snap = await parseSiteImport(sampleSnapshot(def) as unknown as Record<string, unknown>);
    expect(snap.source).toBe('snapshot');
    expect(snap.definition.pages).toHaveLength(3);
    await expect(parseSiteImport('{"nope": true}')).rejects.toThrow(/invalid/i);
    await expect(parseSiteImport('not json')).rejects.toThrow(/not valid JSON/);
    expect(() => parseSiteBundle({ 'theme.json': '{}' })).toThrow(/missing site.json/);
  });

  it('detects manifest/file mismatches', () => {
    const files = buildSiteBundle(def);
    delete files['pages/rooms.json'];
    expect(() => parseSiteBundle(files)).toThrow(/missing files/);
  });

  it('schema-only export drops collection items', () => {
    const files = buildSiteBundle(def, { includeCollectionItems: false });
    expect(JSON.parse(files['collections/rooms.json']!).items).toEqual([]);
  });
});

describe('zip', () => {
  it('zips and unzips with path safety and root stripping', async () => {
    const buf = await zipFiles({ 'a.txt': 'A', 'dir/b.bin': Buffer.from([1, 2, 3]) }, { rootDir: 'my-site' });
    const files = await unzip(buf);
    expect([...files.keys()].sort()).toEqual(['a.txt', 'dir/b.bin']);
    expect(files.get('dir/b.bin')).toEqual(Buffer.from([1, 2, 3]));
    await expect(zipFiles({ '../evil': 'x' })).rejects.toThrow(/unsafe/);
    expect(safeArchivePath('../x')).toBeUndefined();
    expect(safeArchivePath('/abs')).toBeUndefined();
    expect(safeArchivePath('./a/./b')).toBe('a/b');
    await expect(unzip(await zipFiles({ a: '1', b: '2' }), { maxFiles: 1 })).rejects.toThrow(/too many/);
  });
});

describe('media references', () => {
  it('finds MediaRefs, media-key URLs and css url()', () => {
    const refs = collectMediaReferences({
      props: { image: { src: 'https://x/a', mediaId: 'm', mimeType: 'image/png' }, href: 'https://x/page', poster: '/p.jpg', video: 'https://v/clip.mp4' },
      customCss: '.a{background:url(/bg.webp)}',
    });
    expect(refs.map((r) => [r.url, r.kind])).toEqual([
      ['/bg.webp', 'image'],
      ['/p.jpg', 'image'],
      ['https://v/clip.mp4', 'video'],
      ['https://x/a', 'image'],
    ]);
  });
});

describe('next project builder', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'atrium-repo-'));
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const put = async (rel: string, content: string) => {
      await mkdir(join(root, rel, '..'), { recursive: true });
      await writeFile(join(root, rel), content);
    };
    await put('apps/renderer/package.json', JSON.stringify({ name: '@atrium/renderer', dependencies: { '@atrium/renderer-core': 'workspace:*', next: '^16.3.8', react: '^19.3.0', 'react-dom': '^19.3.0', gsap: '^3.15.0' }, devDependencies: { '@atrium/typescript-config': 'workspace:*', typescript: '5.9.3', '@types/react': '^19.3.0' } }));
    await put('apps/renderer/tsconfig.json', '{ // comment\n "extends": "@atrium/typescript-config/nextjs.json", "compilerOptions": { "paths": { "@/*": ["./src/*"] }, }, "include": ["src", "../../packages/x"] }');
    await put('apps/renderer/next.config.ts', 'export default {}');
    await put('apps/renderer/src/app/page.tsx', 'export default function P() { return null }');
    await put('apps/renderer/src/app/page.test.tsx', 'test');
    await put('apps/renderer/.env.local', 'SECRET=1');
    await put('apps/renderer/node_modules/x/index.js', 'x');
    await put('apps/renderer/.next/build.txt', 'x');
    await put('apps/renderer/tsconfig.tsbuildinfo', 'x');
    await put('packages/renderer-core/package.json', JSON.stringify({ name: '@atrium/renderer-core', version: '0.1.0', exports: { '.': './src/index.ts', './client': './src/client.ts', './styles.css': './src/styles/renderer.css' }, dependencies: { '@atrium/schema': 'workspace:*', 'lucide-react': '^1.52.0' }, peerDependencies: { react: '^19.3.0' } }));
    await put('packages/renderer-core/src/index.ts', 'export const x = 1;');
    await put('packages/renderer-core/src/client.ts', 'export const y = 1;');
    await put('packages/renderer-core/src/styles/renderer.css', '.a{}');
    await put('packages/renderer-core/src/x.test.ts', 'test');
    await put('packages/renderer-core/dist/index.js', 'built');
    await put('packages/schema/package.json', JSON.stringify({ name: '@atrium/schema', version: '0.1.0', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }, dependencies: { zod: '^4.6.5' } }));
    await put('packages/schema/src/index.ts', 'export const s = 1;');
    await put('packages/unrelated/package.json', JSON.stringify({ name: '@atrium/unrelated' }));
    await put('packages/unrelated/src/index.ts', 'x');
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('vendors renderer + transitive workspace sources and writes manifests', async () => {
    const files = await buildNextProject({ snapshot: sampleSnapshot(), repoRoot: root, env: { NEXT_PUBLIC_GA: 'G-1' } });
    const keys = [...files.keys()].sort();
    expect(keys).toEqual(
      [
        '.env.production', '.gitignore', 'README.md', 'next-env.d.ts', 'next.config.ts', 'package.json',
        'packages/renderer-core/package.json', 'packages/renderer-core/src/client.ts', 'packages/renderer-core/src/index.ts', 'packages/renderer-core/src/styles/renderer.css',
        'packages/schema/package.json', 'packages/schema/src/index.ts', 'site.json', 'src/app/page.tsx', 'tsconfig.json', 'vercel.json',
      ].sort(),
    );
    const pkg = JSON.parse(files.get('package.json') as string);
    expect(pkg.name).toBe('aranya-lake-retreat');
    expect(pkg.dependencies).toEqual({ gsap: '^3.15.0', 'lucide-react': '^1.52.0', next: '^16.3.8', react: '^19.3.0', 'react-dom': '^19.3.0', zod: '^4.6.5' });
    expect(pkg.devDependencies).toMatchObject({ typescript: '5.9.3', '@types/react': '^19.3.0' });
    expect(pkg.scripts).toMatchObject({ dev: 'next dev', build: 'next build', start: 'next start' });
    const ts = JSON.parse(files.get('tsconfig.json') as string);
    expect(ts.compilerOptions.paths).toMatchObject({
      '@atrium/renderer-core': ['./packages/renderer-core/src/index.ts'],
      '@atrium/renderer-core/client': ['./packages/renderer-core/src/client.ts'],
      '@atrium/renderer-core/styles.css': ['./packages/renderer-core/src/styles/renderer.css'],
      '@atrium/schema': ['./packages/schema/src/index.ts'],
      '@atrium/*': ['./packages/*/src/index.ts'],
      '@/*': ['./src/*'],
    });
    expect(ts).not.toHaveProperty('extends');
    expect(ts.include).not.toContain('../../packages/x');
    const env = files.get('.env.production') as string;
    expect(env).toContain('ATRIUM_SNAPSHOT_SOURCE=file');
    expect(env).toContain('ATRIUM_SNAPSHOT_FILE=./site.json');
    expect(env).toContain('NEXT_PUBLIC_ATRIUM_API_URL=https://api.atrium.example');
    expect(env).toContain('NEXT_PUBLIC_GA=G-1');
    expect(JSON.parse(files.get('site.json') as string).versionId).toBe('v_1');
    expect(files.get('next.config.ts')).toContain("output: 'export'");
  });

  it('file selection rules', () => {
    expect(isExcludedPath('node_modules/a.js')).toBe(true);
    expect(isExcludedPath('src/.next/x')).toBe(true);
    expect(isExcludedPath('.env')).toBe(true);
    expect(isExcludedPath('.env.local')).toBe(true);
    expect(isExcludedPath('tsconfig.tsbuildinfo')).toBe(true);
    expect(isExcludedPath('src/a.test.tsx')).toBe(true);
    expect(isExcludedPath('.turbo/log')).toBe(true);
    expect(isExcludedPath('src/app/page.tsx')).toBe(false);
    expect(isExcludedPath('src/environment.ts')).toBe(false);
  });

  it('helpers', () => {
    expect(slugifyPackageName('Café Ñandú & Co.')).toBe('cafe-nandu-co');
    expect(slugifyPackageName('***')).toBe('atrium-site');
    expect(exportPaths('@atrium/x', 'x', undefined)).toEqual({ '@atrium/x': ['./packages/x/src/index.ts'] });
    expect(parseJsonc<{ a: string }>('{ "a": "http://x//y", /* c */ }')).toEqual({ a: 'http://x//y' });
  });
});
