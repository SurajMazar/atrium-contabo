/**
 * Converts the Leela Garden and Vilasa by Leela Next.js sites into Atrium site bundles.
 *
 *   npx tsx tools/importers/leela/build.ts            # both sites → tools/importers/leela/out/*.zip
 *   npx tsx tools/importers/leela/build.ts --json     # also write the unzipped bundle folders
 *   npx tsx tools/importers/leela/build.ts vilasa     # one site
 *
 * The source folders are read-only inputs. Content is extracted from each site's own data
 * modules (src/extract.ts, run inside that site's TypeScript project), validated with
 * WebsiteInputSchema + normalizeWebsite (zero error-severity issues required) and written as
 * site.json / theme.json / pages/*.json / forms/*.json / assets/* with `asset:<path>` refs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { WebsiteInputSchema } from '../../../packages/schema/src/index.ts';
import { normalizeWebsite } from '../../../packages/builder-core/src/index.ts';
import { createRegistry } from '../../../packages/component-registry/src/index.ts';
import { zipFiles } from '../../../packages/exporter/src/zip.ts';
import { SITES, type SiteConfig } from './src/config.ts';
import { Ctx, PAGE_IDS, type Data } from './src/context.ts';
import { resetIds, type N } from './src/nodes.ts';
import { iconVariablesCss, loadIcons } from './src/icons.ts';
import { siteCss } from './src/css.ts';
import { aboutPage, contactPage, eventsPage, galleryPage, homePage, notFoundPage, packagesPage, venuePage, weddingsPage } from './src/pages.ts';
import { floatingSection, footerSection, header, menus, siteFooter } from './src/chrome.ts';
import { inquiryForm, pageSeo, pageStructuredData, settings, theme } from './src/site.ts';
import { verifyCopy } from './src/verify.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'out');
const TSX = path.resolve(HERE, '../../tutorial/node_modules/.bin/tsx');
const args = process.argv.slice(2);
const writeJson = args.includes('--json');
const only = args.find((a) => !a.startsWith('--'));

function extract(cfg: SiteConfig): Data {
  const bin = existsSync(TSX) ? TSX : 'tsx';
  const out = execFileSync(bin, ['--tsconfig', path.join(cfg.root, 'tsconfig.json'), path.join(HERE, 'src/extract.ts'), cfg.root], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out) as Data;
}

const GLOBAL_FOOTER = 'gs-footer';
const GLOBAL_FLOAT = 'gs-floating';
const globalRefs = (): N[] => [
  { type: 'global-section', ref: GLOBAL_FOOTER, props: { label: 'Site footer' } },
  { type: 'global-section', ref: GLOBAL_FLOAT, props: { label: 'Floating contact & app bar' } },
];

function buildSite(cfg: SiteConfig) {
  const data = extract(cfg);
  cfg.navCaptions = data.NAV.map((n: { caption: string }) => n.caption);
  cfg.shortName = data.SITE.shortName;
  resetIds();
  const c = new Ctx(cfg, data);
  const icons = loadIcons(path.join(cfg.root, 'src/components/ui/Icon.tsx'));
  const form = inquiryForm(c);

  const layout = { header: 'transparent', footer: 'hidden' } as const;
  const page = (key: string, title: string, slug: string, sections: N[], extra: Record<string, unknown> = {}) => ({
    id: PAGE_IDS[key],
    title,
    slug,
    kind: 'page',
    status: 'published',
    isHomepage: key === 'home',
    seo: { ...pageSeo(c, key), ...(pageStructuredData(c, key) ? { structuredData: pageStructuredData(c, key) } : {}) },
    layout,
    sections: [...sections, ...globalRefs()],
    ...extra,
  });

  const pages = [
    page('home', 'Home', '', homePage(c)),
    page('about', 'About', 'about', aboutPage(c)),
    page('venue', 'Venue', 'venue', venuePage(c)),
    page('weddings', 'Weddings', 'weddings', weddingsPage(c)),
    page('events', 'Events', 'events', eventsPage(c)),
    page('packages', 'Packages', 'packages', packagesPage(c)),
    page('gallery', 'Gallery', 'gallery', galleryPage(c)),
    page('contact', 'Contact', 'contact', contactPage(c, form.id)),
    {
      id: PAGE_IDS['not-found'],
      title: 'Page Not Found',
      slug: 'page-not-found',
      kind: 'not-found',
      status: 'published',
      isHomepage: false,
      seo: { title: `Page Not Found — ${data.SITE.name}`, robots: { index: false, follow: true }, excludeFromSitemap: true },
      layout,
      sections: [...notFoundPage(c), ...globalRefs()],
    },
  ];

  const site = {
    schemaVersion: 1,
    settings: settings(c),
    theme: theme(c),
    navigation: { menus: menus(c) },
    header: header(c),
    footer: siteFooter(c),
    globalSections: [
      { id: GLOBAL_FOOTER, name: 'Site footer', node: footerSection(c) },
      { id: GLOBAL_FLOAT, name: 'Floating contact & app bar', node: floatingSection(c) },
    ],
    pages,
    forms: [form],
    collections: [],
    redirects: [],
    customCss: siteCss(cfg, iconVariablesCss(icons)),
  };
  return { site, ctx: c, data };
}

/** Replace `asset:` refs with relative placeholders so URL sanitizers keep them during validation. */
function withPlaceholders<T>(v: T): T {
  return JSON.parse(JSON.stringify(v).replace(/"asset:([^"]+)"/g, '"/__asset__/$1"')) as T;
}

function validate(site: ReturnType<typeof buildSite>['site']) {
  const problems: string[] = [];
  const raw = JSON.stringify(site);
  const assetRefs = raw.match(/"asset:[^"]+"/g)?.length ?? 0;
  const input = withPlaceholders(site);
  const parsed = WebsiteInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`WebsiteInputSchema rejected the definition:\n${parsed.error.issues.slice(0, 20).map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  const kept = JSON.stringify(parsed.data).match(/"\/__asset__\/[^"]+"/g)?.length ?? 0;
  if (kept !== assetRefs) problems.push(`asset refs: ${assetRefs} written, ${kept} survived schema parsing`);
  const res = normalizeWebsite(parsed.data as never, createRegistry());
  const errors = res.issues.filter((i) => i.severity === 'error');
  const warnings = res.issues.filter((i) => i.severity === 'warning');
  for (const w of warnings) problems.push(`warning ${w.path} (${w.type}): ${w.message.slice(0, 300)}`);
  if (errors.length) throw new Error(`normalizeWebsite reported ${errors.length} errors:\n${errors.map((e) => `  ${e.path} ${e.type}: ${e.message}`).join('\n')}`);
  // Hard limits the schema enforces on the stored definition.
  const walk = (n: N, p: string) => {
    if ((n.customCss?.length ?? 0) > 20_000) problems.push(`${p}: customCss ${n.customCss!.length} > 20000`);
    n.children?.forEach((ch, i) => walk(ch, `${p}.${i}`));
  };
  site.pages.forEach((pg) => pg.sections.forEach((s, i) => walk(s as N, `${pg.slug || 'home'}[${i}]`)));
  if ((site.customCss?.length ?? 0) > 100_000) problems.push(`site customCss ${site.customCss.length} > 100000`);
  for (const s of site.settings.scripts) if ((s.code?.length ?? 0) > 50_000) problems.push(`script ${s.id} ${s.code!.length} > 50000`);
  // The normalized definition must also satisfy the strict stored schema (what the API saves).
  return { problems, normalized: res.value, nodeCount: res.value.pages.reduce((n, pg) => n + countNodes(pg.sections as never), 0) };
}

function countNodes(nodes: Array<{ children?: unknown[] }>): number {
  return nodes.reduce((n, x) => n + 1 + countNodes((x.children ?? []) as never), 0);
}

async function writeBundle(cfg: SiteConfig, built: ReturnType<typeof buildSite>) {
  const { site, ctx } = built;
  const files: Record<string, string | Buffer> = {};
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  const pageFiles = site.pages.map((p) => (p.slug ? `pages/${p.slug}.json` : 'pages/_home.json'));
  site.pages.forEach((p, i) => (files[pageFiles[i]!] = json(p)));
  const formFiles = site.forms.map((f) => `forms/${f.slug}.json`);
  site.forms.forEach((f, i) => (files[formFiles[i]!] = json(f)));
  const { pages: _p, forms: _f, collections: _c, theme: th, ...rest } = site;
  files['site.json'] = json({
    bundle: { format: 'atrium-site-bundle', version: 1, schemaVersion: 1, exportedAt: '2026-10-05T00:00:00.000Z', generator: 'tools/importers/leela', website: { name: cfg.websiteName, slug: cfg.key }, pages: pageFiles, collections: [], forms: formFiles },
    ...rest,
  });
  files['theme.json'] = json(th);
  let bytes = 0;
  for (const a of [...ctx.assets].sort()) {
    const src = a.startsWith('app/') ? path.join(cfg.root, 'src', a) : path.join(cfg.root, 'public', a);
    if (!existsSync(src)) throw new Error(`Missing asset ${src}`);
    files[`assets/${a}`] = readFileSync(src);
    bytes += statSync(src).size;
  }
  mkdirSync(OUT, { recursive: true });
  const zip = await zipFiles(files, { compressionLevel: 6 });
  const zipPath = path.join(OUT, `${cfg.key}.zip`);
  writeFileSync(zipPath, zip);
  if (writeJson) {
    const dir = path.join(OUT, cfg.key);
    rmSync(dir, { recursive: true, force: true });
    for (const [name, content] of Object.entries(files)) {
      if (name.startsWith('assets/')) continue;
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      writeFileSync(path.join(dir, name), content);
    }
  }
  return { zipPath, zipBytes: zip.length, assets: ctx.assets.size, assetBytes: bytes };
}

for (const cfg of SITES) {
  if (only && !cfg.key.includes(only)) continue;
  const built = buildSite(cfg);
  const { problems, nodeCount } = validate(built.site);
  const copy = verifyCopy(cfg, built.site);
  const out = await writeBundle(cfg, built);
  console.log(`\n${cfg.websiteName}: ${built.site.pages.length} pages, ${nodeCount} nodes, ${out.assets} assets (${(out.assetBytes / 1e6).toFixed(1)} MB) → ${path.relative(process.cwd(), out.zipPath)} (${(out.zipBytes / 1e6).toFixed(1)} MB)`);
  console.log(`  site CSS ${built.site.customCss.length} chars; scripts ${built.site.settings.scripts.map((s) => `${s.id} ${s.code?.length}`).join(', ')}`);
  for (const p of problems) console.log(`  ! ${p}`);
  if (copy.missing.length) {
    console.log(`  copy check: ${copy.missing.length} strings not found verbatim in the source:`);
    for (const m of copy.missing) console.log(`    - ${m}`);
  } else console.log(`  copy check: ${copy.checked} visible strings — ${copy.checked - copy.composed} found verbatim in the source, ${copy.composed} composed exactly as the source composes them`);
}
