/**
 * Minimal, safe `{{path.to.value}}` interpolation. No code execution, no helpers
 * beyond an optional `| default` filter: `{{business.phone | Call us}}`.
 */
const TOKEN = /\{\{\s*([a-zA-Z_][\w.]*)\s*(?:\|\s*([^}]*))?\}\}/g;

export type TemplateScope = Record<string, unknown>;

export function getByPath(scope: unknown, path: string): unknown {
  let cur: unknown = scope;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function hasTemplate(value: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(value);
}

export function interpolate(template: string, scope: TemplateScope, escape?: (s: string) => string): string {
  return template.replace(TOKEN, (_, path: string, fallback?: string) => {
    const v = getByPath(scope, path);
    const out = v === undefined || v === null || v === '' ? (fallback?.trim() ?? '') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return escape ? escape(out) : out;
  });
}

/** If the template is exactly one token, return the raw value (keeps objects like images intact). */
export function resolveBinding(template: string, scope: TemplateScope): unknown {
  const m = /^\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}$/.exec(template.trim());
  if (m) return getByPath(scope, m[1]!);
  return interpolate(template, scope);
}

/** Recursively interpolate all string values in props. */
export function interpolateDeep<T>(value: T, scope: TemplateScope): T {
  if (typeof value === 'string') return (hasTemplate(value) ? interpolate(value, scope) : value) as T;
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, scope)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateDeep(v, scope);
    return out as T;
  }
  return value;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
