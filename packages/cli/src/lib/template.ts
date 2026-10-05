import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Tiny template language used for deployment artifacts and scaffolds:
 *   {{ name }}                 → value (unknown names are an error)
 *   {{#if name}}…{{/if}}       → kept when the value is truthy ("false"/"" are falsy)
 *   {{#unless name}}…{{/unless}}
 * It deliberately does not collide with `${VAR}` (shell/compose), `{$VAR}`
 * (Caddy) or `${{ }}` (GitHub Actions — note the leading `$`).
 */
export type TemplateVars = Record<string, string | number | boolean | undefined>;

export class TemplateError extends Error {}

const truthy = (v: TemplateVars[string]) =>
  v !== undefined && v !== false && v !== '' && v !== 'false' && v !== 0;

export function renderTemplate(src: string, vars: TemplateVars, name = 'template'): string {
  let out = src;
  // Block helpers (innermost first, so nesting works).
  const block =
    /\{\{#(if|unless)\s+([A-Za-z_][\w.]*)\s*\}\}((?:(?!\{\{#(?:if|unless)\s)[\s\S])*?)\{\{\/\1\}\}/;
  for (let guard = 0; guard < 1000; guard++) {
    const m = block.exec(out);
    if (!m) break;
    const [whole, kind, key, body] = m;
    if (!(key! in vars))
      throw new TemplateError(`${name}: unknown variable "${key}" in {{#${kind}}}`);
    const keep = kind === 'if' ? truthy(vars[key!]) : !truthy(vars[key!]);
    out = out.slice(0, m.index) + (keep ? body! : '') + out.slice(m.index + whole.length);
  }
  return out.replace(/(?<!\$)\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars) || vars[key] === undefined)
      throw new TemplateError(`${name}: unknown variable "${key}"`);
    return String(vars[key]);
  });
}

export interface RenderedFile {
  path: string;
  /** Path relative to the output directory. */
  rel: string;
  skipped?: boolean;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

/**
 * Render every file in `srcDir` into `outDir`. Files ending in `.tpl` are
 * rendered and lose the suffix; `__name__` in paths is replaced by vars.name.
 */
export function renderDir(
  srcDir: string,
  outDir: string,
  vars: TemplateVars,
  opts: { overwrite?: boolean; dryRun?: boolean } = {},
): RenderedFile[] {
  const results: RenderedFile[] = [];
  for (const file of walk(srcDir)) {
    let rel = relative(srcDir, file).replace(/__([A-Za-z_]\w*)__/g, (_, k: string) => {
      if (vars[k] === undefined) throw new TemplateError(`path ${file}: unknown variable "${k}"`);
      return String(vars[k]);
    });
    const isTpl = rel.endsWith('.tpl');
    if (isTpl) rel = rel.slice(0, -4);
    const dest = join(outDir, rel);
    if (existsSync(dest) && !opts.overwrite) {
      results.push({ path: dest, rel, skipped: true });
      continue;
    }
    const raw = readFileSync(file);
    const content = isTpl
      ? renderTemplate(raw.toString('utf8'), vars, relative(srcDir, file))
      : raw;
    if (!opts.dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
      if (/\.(sh|bash)$/.test(rel) || (statSync(file).mode & 0o111) !== 0) chmodSync(dest, 0o755);
    }
    results.push({ path: dest, rel });
  }
  return results;
}

/** Name casing helpers for scaffolds. */
export function toKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function toPascal(s: string): string {
  return toKebab(s)
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');
}

export function toCamel(s: string): string {
  const p = toPascal(s);
  return p ? p[0]!.toLowerCase() + p.slice(1) : p;
}

export function toTitle(s: string): string {
  return toKebab(s)
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}
