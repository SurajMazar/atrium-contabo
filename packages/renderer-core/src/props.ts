import type { ComponentDefinition } from '@atrium/component-registry';
import {
  escapeHtml, evaluateConditionGroup, getByPath, hasTemplate, interpolate, type CollectionItem, type ConditionGroup, type Node, type TemplateScope,
} from '@atrium/schema';
import type { RenderContext } from './types';

const SINGLE_TOKEN = /^\{\{\s*([a-zA-Z_][\w.]*)\s*(?:\|\s*([^}]*))?\}\}$/;
const HTML_KEYS = new Set(['html']);
const MEDIA_KEYS = new Set(['src', 'mediaId', 'width', 'height', 'focalPoint', 'blurDataUrl', 'mimeType', 'poster']);
const IMAGE_PROP = /^(image|photo|avatar|logo|poster|cover|thumbnail|secondaryImage|facadeImage|before|after)$/;

type Dict = Record<string, unknown>;
const isObj = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Resolve one string. A string that is exactly one `{{token}}` keeps object/array values intact
 * (so `{{item.image}}` yields a MediaRef); scalars are stringified; missing values use the fallback.
 */
export function resolveTemplateString(value: string, scope: TemplateScope, key?: string): unknown {
  if (!value.includes('{{')) return value;
  const m = SINGLE_TOKEN.exec(value.trim());
  if (m) {
    const raw = getByPath(scope, m[1]!);
    if (raw && typeof raw === 'object') return raw;
    if (raw === undefined || raw === null || raw === '') return m[2]?.trim() ?? '';
    return String(raw);
  }
  if (!hasTemplate(value)) return value;
  return interpolate(value, scope, key && HTML_KEYS.has(key) ? escapeHtml : undefined);
}

/** Deep interpolation of component props with media-aware merging. */
export function interpolateProps<T>(value: T, scope: TemplateScope, key?: string): T {
  if (typeof value === 'string') return resolveTemplateString(value, scope, key) as T;
  if (Array.isArray(value)) return value.map((v) => interpolateProps(v, scope, key)) as T;
  if (isObj(value)) {
    const out: Dict = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateProps(v, scope, k);
    // `{ src: '{{item.image}}', alt: '{{item.name}}' }` where item.image is a MediaRef → merge it in.
    const src = out.src;
    if (isObj(src) && typeof src.src === 'string') {
      const media = src;
      for (const mk of MEDIA_KEYS) if (media[mk] !== undefined) out[mk] = media[mk];
      if (!out.alt && typeof media.alt === 'string') out.alt = media.alt;
    }
    return out as T;
  }
  return value;
}

function mergeDeep(base: unknown, over: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(over)) {
    const len = Math.max(base.length, over.length);
    return Array.from({ length: len }, (_, i) => (i < over.length ? (isObj(base[i]) && isObj(over[i]) ? mergeDeep(base[i], over[i]) : over[i]) : base[i]));
  }
  if (isObj(base) && isObj(over)) {
    const out: Dict = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? mergeDeep(base[k], v) : v;
    return out;
  }
  return over === undefined ? base : over;
}

/** Locale overrides (`node.translations[locale]`) merged over props; arrays merge index-wise. */
export function applyTranslations(props: Dict, node: Pick<Node, 'translations'>, ctx: Pick<RenderContext, 'locale' | 'defaultLocale'>): Dict {
  if (ctx.locale === ctx.defaultLocale) return props;
  const tr = node.translations?.[ctx.locale];
  return tr ? (mergeDeep(props, tr) as Dict) : props;
}

export type VisibilityState = 'visible' | 'hidden';

/** Node-level visibility: hidden flag, locale restriction and publish schedule. (Responsive hiding is CSS.) */
export function visibilityOf(node: Pick<Node, 'hidden' | 'visibility'>, ctx: Pick<RenderContext, 'locale' | 'now'>): VisibilityState {
  if (node.hidden) return 'hidden';
  const v = node.visibility;
  if (!v) return 'visible';
  if (v.locales?.length && !v.locales.includes(ctx.locale)) return 'hidden';
  const now = ctx.now.getTime();
  if (v.from && now < Date.parse(v.from)) return 'hidden';
  if (v.until && now > Date.parse(v.until)) return 'hidden';
  return 'visible';
}

export type ItemRow = Dict & { slug: string; id: string; position: number };

/** Collection items as flat rows (data + slug/id/position), localized, filtered by status for the mode. */
export function collectionRows(ctx: RenderContext, collection: string): ItemRow[] {
  const col = ctx.collections.get(collection);
  if (!col) return [];
  const allowDraft = ctx.mode === 'editor';
  return col.items
    .filter((i: CollectionItem) => i.status === 'published' || (allowDraft && i.status === 'draft'))
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      ...i.data,
      ...(ctx.locale !== ctx.defaultLocale ? i.translations?.[ctx.locale] ?? {} : {}),
      slug: i.slug,
      id: i.id,
      position: i.position,
    }));
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'boolean') return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
}

function setPath(target: Dict, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = target;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else {
      if (!isObj(cur[k])) cur[k] = {};
      cur = cur[k] as Dict;
    }
  });
}

function coerceMapped(key: string, value: unknown, row: ItemRow): unknown {
  const leaf = key.split('.').pop()!;
  if (IMAGE_PROP.test(leaf) && typeof value === 'string') {
    if (!value) return undefined;
    return { src: value, alt: String(row.name ?? row.title ?? '') };
  }
  if (value === '') return undefined;
  return value;
}

/** Filter/sort/limit rows per a binding-like spec. Filter values may contain `{{…}}` (resolved against scope). */
export function selectRows(rows: ItemRow[], spec: { filter?: ConditionGroup; sort?: { field: string; direction: 'asc' | 'desc' }; offset?: number; limit?: number }, scope: TemplateScope): ItemRow[] {
  let out = rows;
  if (spec.filter?.conditions?.length) {
    const filter = interpolateProps(spec.filter, scope);
    out = out.filter((r) => evaluateConditionGroup(filter, r));
  }
  if (spec.sort) {
    const { field, direction } = spec.sort;
    out = [...out].sort((a, b) => compare(a[field], b[field]) * (direction === 'desc' ? -1 : 1));
  }
  const start = spec.offset ?? 0;
  return out.slice(start, spec.limit ? start + spec.limit : undefined);
}

/**
 * Map a node's collection binding into its bindable list prop. Each map entry is a template
 * resolved with `item` = the row (single-token templates keep raw values).
 */
export function applyBinding(props: Dict, node: Pick<Node, 'binding'>, def: ComponentDefinition | undefined, ctx: RenderContext): Dict {
  const b = node.binding;
  if (!b || !def?.bindable || !ctx.collections.has(b.collection)) return props;
  const rows = selectRows(collectionRows(ctx, b.collection), b, ctx.scope);
  const mapped = rows.map((row) => {
    const scope = { ...ctx.scope, item: row };
    const out: Dict = {};
    for (const [key, tpl] of Object.entries(b.map)) {
      const value = coerceMapped(key, typeof tpl === 'string' ? resolveTemplateString(tpl, scope, key) : tpl, row);
      if (value !== undefined) setPath(out, key, value);
    }
    if (out.slug === undefined) out.slug = row.slug;
    return out;
  });
  return { ...props, [def.bindable.listProp]: mapped, __boundCollection: b.collection };
}

/** Parse with the component schema (schema defaults only, never `defaultProps`); fall back to raw props. */
export function parseWithSchema(def: ComponentDefinition | undefined, props: Dict): Dict {
  if (!def) return props;
  const res = def.props.safeParse(props);
  if (res.success) {
    const data = res.data as Dict;
    if (props.__boundCollection) data.__boundCollection = props.__boundCollection;
    return data;
  }
  return props;
}
