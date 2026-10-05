/**
 * Copy check: every visible string in the generated definition must appear verbatim somewhere in
 * the source site's src/ tree (JSX text, data modules, metadata). Strings the converter composes
 * from several source values (e.g. "Enquire — Silver") are checked piece by piece.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { SiteConfig } from './config.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}

const norm = (s: string) =>
  s
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, ' ')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ');

const TEXT_KEYS = new Set(['text', 'label', 'heading', 'eyebrow', 'subheading', 'caption', 'alt', 'title', 'description', 'successMessage', 'submitLabel', 'helpText', 'placeholder', 'patternMessage']);

/**
 * Strings the source itself composes at render time from data values (template literals / JSX
 * interpolation), with the source expression they come from.
 */
const COMPOSED: Array<[RegExp, string]> = [
  [/^— .+$/, 'Quote.tsx: — {attribution}'],
  [/^Showing \d+ of \d+ photographs$/, 'GalleryGrid.tsx: Showing {visible.length} of {GALLERY_ITEMS.length} photographs'],
  [/^(Silver|Platinum) NPR [\d,]+$/, 'InquiryForm.tsx: {choice} {formatNpr(pack.price)}'],
  [/^Map showing the location of .+ in .+$/, 'LocationBlock.tsx: iframe title'],
  [/^Each package is quoted as a total number of food items — \d+ on Silver, \d+ on Platinum — /, 'packages/page.tsx: ${silver.total} / ${platinum.total}'],
  [/\n.*(Province|Kathmandu)/, 'LocationBlock.tsx: address lines from CONTACT.address'],
];

export function verifyCopy(cfg: SiteConfig, site: unknown): { checked: number; composed: number; missing: string[] } {
  const corpus = norm(walk(path.join(cfg.root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n'));
  const seen = new Set<string>();
  const collect = (v: unknown, key?: string) => {
    if (typeof v === 'string') {
      if (key && TEXT_KEYS.has(key) && v.trim() && !v.startsWith('asset:') && !/^https?:/.test(v)) seen.add(v);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => collect(x, key === 'items' ? 'text' : key));
    else if (v && typeof v === 'object') {
      if ((v as { type?: string }).type === 'global-section') return;
      for (const [k, x] of Object.entries(v)) if (k !== 'customCss' && k !== 'seo' && k !== 'settings') collect(x, k);
    }
  };
  collect((site as { pages: unknown }).pages);
  collect((site as { globalSections: unknown }).globalSections);
  collect((site as { forms: unknown }).forms);
  const missing: string[] = [];
  let composed = 0;
  for (const s of seen) {
    if (COMPOSED.some(([re]) => re.test(s))) {
      composed++;
      continue;
    }
    const n = norm(s.replace(/\{\{year\}\}/g, '').replace(/\n/g, ' '));
    if (corpus.includes(n.trim())) continue;
    // Composed strings: every fragment between separators must exist on its own.
    const parts = n.split(/ — | · |, | \/ |\n|(?<=\.) /).map((x) => x.replace(/^[©\s—]+|[\s.]+$/g, '').trim()).filter((x) => x.length > 1);
    if (parts.length > 1 && parts.every((x) => corpus.includes(x))) continue;
    missing.push(s);
  }
  return { checked: seen.size, composed, missing };
}
