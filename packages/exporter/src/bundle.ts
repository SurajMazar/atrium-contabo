import { SiteSnapshotSchema, WebsiteDefinitionSchema, WebsiteInputSchema, type SiteSnapshot, type WebsiteDefinition } from '@atrium/schema';
import { collectMediaReferences, type MediaReference } from './media';
import { entriesOf, isZip, unzip, zipFiles, type FileMap } from './zip';

/**
 * Portable site bundle (export / import / clone):
 *
 *   site.json               settings, navigation, header/footer, global sections, redirects, custom CSS + bundle manifest
 *   theme.json              theme tokens
 *   pages/<slug>.json       one file per page (`_home.json` for the homepage, nested slugs become folders)
 *   collections/<slug>.json collection schema + items
 *   forms/<slug>.json       form definition (fields, settings, rules)
 *   media-manifest.json     every media URL referenced (for asset copying on import)
 */
export const BUNDLE_FORMAT = 'atrium-site-bundle';
export const BUNDLE_VERSION = 1;

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  generator: string;
  website?: { id?: string; name?: string; slug?: string };
  /** File names in definition order. */
  pages: string[];
  collections: string[];
  forms: string[];
}

export interface BuildBundleOptions {
  website?: { id?: string; name?: string; slug?: string };
  exportedAt?: string;
  /** Omit collection items (schema-only template export). */
  includeCollectionItems?: boolean;
  /** Pretty-print JSON (default true). */
  pretty?: boolean;
}

export function pageFileName(slug: string): string {
  return slug ? `pages/${slug}.json` : 'pages/_home.json';
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base;
  for (let i = 2; used.has(name); i++) name = base.replace(/\.json$/, `-${i}.json`);
  used.add(name);
  return name;
}

export function buildSiteBundle(definition: WebsiteDefinition, opts: BuildBundleOptions = {}): Record<string, string> {
  const json = (v: unknown) => (opts.pretty === false ? JSON.stringify(v) : `${JSON.stringify(v, null, 2)}\n`);
  const files: Record<string, string> = {};
  const used = new Set<string>();

  const pages = definition.pages.map((p) => {
    const name = uniqueName(pageFileName(p.slug), used);
    files[name] = json(p);
    return name;
  });
  const collections = definition.collections.map((c) => {
    const name = uniqueName(`collections/${c.slug}.json`, used);
    files[name] = json(opts.includeCollectionItems === false ? { ...c, items: [] } : c);
    return name;
  });
  const forms = definition.forms.map((f) => {
    const name = uniqueName(`forms/${f.slug}.json`, used);
    files[name] = json(f);
    return name;
  });

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    schemaVersion: definition.schemaVersion,
    exportedAt: opts.exportedAt ?? new Date().toISOString(),
    generator: '@atrium/exporter',
    website: opts.website,
    pages,
    collections,
    forms,
  };
  const { pages: _p, collections: _c, forms: _f, theme, ...rest } = definition;
  files['site.json'] = json({ bundle: manifest, ...rest });
  files['theme.json'] = json(theme);
  const media = collectMediaReferences(opts.includeCollectionItems === false ? { ...definition, collections: definition.collections.map((c) => ({ ...c, items: [] })) } : definition);
  files['media-manifest.json'] = json({ generatedAt: manifest.exportedAt, count: media.length, media });
  return files;
}

export async function buildSiteBundleZip(definition: WebsiteDefinition, opts: BuildBundleOptions = {}): Promise<Buffer> {
  return zipFiles(buildSiteBundle(definition, opts));
}

export interface ParsedBundle {
  definition: WebsiteDefinition;
  manifest?: BundleManifest;
  media: MediaReference[];
  /** How the input was recognized. */
  source: 'bundle' | 'definition' | 'snapshot';
  warnings: string[];
}

export class BundleError extends Error {
  constructor(message: string, public readonly issues: string[] = []) {
    super(issues.length ? `${message}:\n${issues.map((i) => `  - ${i}`).join('\n')}` : message);
    this.name = 'BundleError';
  }
}

function text(content: string | Buffer | Uint8Array): string {
  return typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
}

function parseJsonFile(name: string, content: string | Buffer | Uint8Array): unknown {
  try {
    return JSON.parse(text(content).replace(/^﻿/, ''));
  } catch (err) {
    throw new BundleError(`${name} is not valid JSON (${(err as Error).message})`);
  }
}

function validateDefinition(raw: unknown, warnings: string[]): WebsiteDefinition {
  const strict = WebsiteDefinitionSchema.safeParse(raw);
  if (strict.success) return strict.data;
  // Accept looser inputs (missing ids/defaults) — normalization fills them on import.
  const loose = WebsiteInputSchema.safeParse(raw);
  if (loose.success) {
    warnings.push('Bundle did not match the strict schema; imported with defaults — run normalization before saving.');
    return loose.data as unknown as WebsiteDefinition;
  }
  throw new BundleError('Site definition is invalid', strict.error.issues.slice(0, 25).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
}

/** Parse a bundle file map (from `unzip` or a multipart upload) back into a definition. */
export function parseSiteBundle(files: FileMap): ParsedBundle {
  const map = new Map(entriesOf(files).map(([k, v]) => [k.replace(/^\.?\//, ''), v]));
  const warnings: string[] = [];
  const siteRaw = map.get('site.json');
  if (!siteRaw) throw new BundleError('Bundle is missing site.json');
  const site = parseJsonFile('site.json', siteRaw) as Record<string, unknown> & { bundle?: BundleManifest };
  const manifest = site.bundle;
  if (manifest && manifest.format !== BUNDLE_FORMAT) throw new BundleError(`Unsupported bundle format "${String(manifest.format)}"`);
  if (manifest && manifest.version > BUNDLE_VERSION) warnings.push(`Bundle version ${manifest.version} is newer than this importer (${BUNDLE_VERSION}).`);

  const listed = (prefix: string, names: string[] | undefined) => {
    const all = [...map.keys()].filter((k) => k.startsWith(prefix) && k.endsWith('.json')).sort();
    if (!names?.length) return all;
    const missing = names.filter((n) => !map.has(n));
    if (missing.length) throw new BundleError('Bundle manifest references missing files', missing);
    const extra = all.filter((n) => !names.includes(n));
    if (extra.length) warnings.push(`Ignored unlisted files: ${extra.join(', ')}`);
    return names;
  };
  const pageFiles = listed('pages/', manifest?.pages);
  const collectionFiles = listed('collections/', manifest?.collections);
  const formFiles = listed('forms/', manifest?.forms);
  const themeRaw = map.get('theme.json');

  const { bundle: _bundle, ...rest } = site;
  const raw = {
    ...rest,
    theme: themeRaw ? parseJsonFile('theme.json', themeRaw) : rest.theme,
    pages: pageFiles.map((n) => parseJsonFile(n, map.get(n)!)),
    collections: collectionFiles.map((n) => parseJsonFile(n, map.get(n)!)),
    forms: formFiles.map((n) => parseJsonFile(n, map.get(n)!)),
  };
  const definition = validateDefinition(raw, warnings);
  return { definition, manifest, media: collectMediaReferences(definition), source: 'bundle', warnings };
}

/**
 * Import any supported input: a zip bundle, a bundle file map, a raw WebsiteDefinition JSON,
 * or a published SiteSnapshot JSON.
 */
export async function parseSiteImport(input: Buffer | Uint8Array | string | Record<string, unknown> | FileMap): Promise<ParsedBundle> {
  if (input instanceof Map) return parseSiteBundle(input);
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (isZip(input)) return parseSiteBundle(await unzip(input));
    return parseSiteImport(Buffer.from(input).toString('utf8'));
  }
  const obj = typeof input === 'string' ? parseJsonFile('import', input) : input;
  if (!obj || typeof obj !== 'object') throw new BundleError('Unrecognized import format');
  const o = obj as Record<string, unknown>;
  if ('site.json' in o) return parseSiteBundle(o as Record<string, string>);
  const warnings: string[] = [];
  if ('definition' in o && 'versionId' in o) {
    const snap = SiteSnapshotSchema.safeParse(o);
    if (!snap.success) throw new BundleError('Snapshot is invalid', snap.error.issues.slice(0, 25).map((i) => `${i.path.join('.')}: ${i.message}`));
    return { definition: snap.data.definition, media: collectMediaReferences(snap.data.definition), source: 'snapshot', warnings };
  }
  const definition = validateDefinition(o, warnings);
  return { definition, media: collectMediaReferences(definition), source: 'definition', warnings };
}

/** Convenience for exports from a published snapshot. */
export function buildSnapshotBundle(snapshot: SiteSnapshot, opts: Omit<BuildBundleOptions, 'website'> = {}): Record<string, string> {
  return buildSiteBundle(snapshot.definition, { ...opts, website: { id: snapshot.websiteId, name: snapshot.definition.settings.name } });
}
