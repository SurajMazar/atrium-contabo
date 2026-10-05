import {
  BREAKPOINTS, DEFAULT_BREAKPOINT_WIDTHS, escapeCssForHtml, isResponsiveObject, isSafeCssColor, isSafeCssValue, sanitizeUrl, toSafeNodeId, walkNodes,
  type Breakpoint, type Node, type Responsive, type StyleProps,
} from '@atrium/schema';
import { resolveTokenRefs } from './tokens';

/** Class name for a node. Ids are validated by the schema; this re-maps any legacy unsafe id. */
export const nodeClass = (id: string) => `a-n-${toSafeNodeId(String(id))}`;

/** Quote a value as a CSS string (escapes quotes, backslashes, newlines and `<`). */
export function cssString(value: string): string {
  return `"${value.replace(/[\\"\n\r\f<>]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

const ALIGN: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };

type Decl = [prop: string, value: string];

function declsFor(key: keyof StyleProps, value: unknown): Decl[] {
  if (value === undefined || value === null || value === '') return [];
  // Defence in depth: values are validated by StyleSchema, but compile only safe values regardless
  // of where the node came from (unvalidated editor state, legacy data).
  if ((typeof value !== 'string' && typeof value !== 'number') || !isSafeCssValue(value)) return [];
  const v = typeof value === 'string' ? resolveTokenRefs(value) : String(value);
  switch (key) {
    case 'padding': return [['padding', v]];
    case 'margin': return [['margin', v]];
    case 'gap': return [['gap', v]];
    case 'width': return [['width', v]];
    case 'maxWidth': return [['max-width', v], ['margin-inline', 'auto']];
    case 'minHeight': return [['min-height', v]];
    case 'height': return [['height', v]];
    case 'aspectRatio': return [['aspect-ratio', v]];
    case 'display': return [['display', v]];
    case 'flexDirection': return [['flex-direction', v]];
    case 'flexWrap': return [['flex-wrap', v]];
    case 'alignItems': return [['align-items', ALIGN[v] ?? v]];
    case 'justifyContent': return [['justify-content', JUSTIFY[v] ?? v]];
    case 'gridColumns': return [['display', 'grid'], ['grid-template-columns', `repeat(${v}, minmax(0, 1fr))`]];
    case 'textAlign': return [['text-align', v]];
    case 'order': return [['order', v]];
    case 'background': return [['background', v]];
    case 'color': return [['color', v]];
    case 'borderRadius': return [['border-radius', v]];
    case 'border': return [['border', v]];
    case 'boxShadow': return [['box-shadow', v]];
    case 'opacity': return [['opacity', v]];
    case 'fontFamily': return [['font-family', v === 'heading' || v === 'body' || v === 'accent' ? `var(--a-font-${v})` : v]];
    case 'fontSize': return [['font-size', v]];
    case 'fontWeight': return [['font-weight', v]];
    case 'lineHeight': return [['line-height', v]];
    case 'letterSpacing': return [['letter-spacing', v]];
    case 'textTransform': return [['text-transform', v]];
    case 'position': return [['position', v]];
    case 'inset': return [['inset', v]];
    case 'zIndex': return [['z-index', v]];
    case 'overflow': return [['overflow', v]];
    default: return [];
  }
}

export interface StyleCompileOptions {
  breakpoints?: Partial<Record<Exclude<Breakpoint, 'base'>, number>>;
  /** Wrap selectors, e.g. `.atrium-site` for scoping inside the editor canvas. */
  scope?: string;
}

const CSS_ESCAPE = /\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([^0-9a-fA-F\n\r\f])/g;

/** Decode CSS escapes that encode ASCII letters (`u\72l(`, `@\69mport`) so filters see real keywords. */
function decodeLetterEscapes(css: string): string {
  return css.replace(CSS_ESCAPE, (m, hex: string | undefined, ch: string | undefined) => {
    let c = ch ?? '';
    if (hex) {
      const cp = parseInt(hex, 16);
      c = cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return /^[A-Za-z]$/.test(c) ? c : m;
  });
}

const URL_FN = /\burl\(\s*(?:"((?:[^"\\\n]|\\[\s\S])*)"|'((?:[^'\\\n]|\\[\s\S])*)'|([^)"'\s]*))\s*\)/gi;

function unescapeCssString(s: string): string {
  return s.replace(CSS_ESCAPE, (_m, hex: string | undefined, ch: string | undefined) => {
    if (hex) {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ch ?? '';
  });
}

function sanitizePass(css: string): string {
  return decodeLetterEscapes(css.replace(/\0/g, '').replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ''))
    .replace(/@import[^;{}]*(?:;|$)/gi, '')
    .replace(URL_FN, (_m, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
      const raw = unescapeCssString(dq ?? sq ?? bare ?? '');
      const safe = sanitizeUrl(raw, 'css');
      return safe === undefined || safe === '' ? 'none' : `url(${cssString(safe)})`;
    })
    // Anything url-like the strict matcher did not accept (unterminated, odd spacing) is neutralized.
    .replace(/\burl\s*\((?!"(?:[^"\\\n]|\\[0-9a-f]{1,6} )*"\))/gi, 'x-blocked(')
    .replace(/(?:-webkit-)?\bimage-set\s*\(|\bsrc\s*\(|\bexpression\s*\(|(?:-moz-)?\belement\s*\(/gi, 'x-blocked-fn(')
    .replace(/\b(?:java|vb|live)script\s*:/gi, 'blocked:')
    .replace(/\bbehaviou?r\s*:/gi, 'x-blocked-prop:')
    .replace(/-moz-binding/gi, 'x-blocked-binding');
}

/**
 * Sanitize author CSS (site/page/node custom CSS) for embedding in a `<style>` element:
 * removes `@import`, `expression()`, `behavior`, `-moz-binding`, script URLs and image-set/src();
 * restricts `url()` to https:, relative or `data:image/(png|jpeg|webp|gif|svg+xml)`; runs to a
 * fixed point (nested payloads cannot reassemble) and finally escapes `<` as `\3c ` so no
 * `</style>` breakout is possible.
 */
export function sanitizeCss(css: string): string {
  let out = css;
  for (let i = 0; i < 10; i++) {
    const next = sanitizePass(out);
    if (next === out) break;
    out = next;
  }
  return escapeCssForHtml(out);
}

/**
 * Compile a node's responsive style props + custom CSS into scoped CSS.
 * Desktop-first: base rules, then max-width media queries per breakpoint.
 */
export function compileNodeCss(node: Pick<Node, 'id' | 'style' | 'customCss' | 'visibility'>, opts: StyleCompileOptions = {}): string {
  const widths = { ...DEFAULT_BREAKPOINT_WIDTHS, ...opts.breakpoints };
  const sel = `${opts.scope ? `${opts.scope} ` : ''}.${nodeClass(node.id)}`;
  const byBp: Record<Breakpoint, Decl[]> = { base: [], laptop: [], tablet: [], mobile: [] };
  const style = node.style ?? {};
  for (const [key, raw] of Object.entries(style) as Array<[keyof StyleProps, Responsive<unknown>]>) {
    if (key === 'backgroundImage') continue;
    if (isResponsiveObject(raw)) {
      for (const bp of BREAKPOINTS) if (raw[bp] !== undefined) byBp[bp].push(...declsFor(key, raw[bp]));
    } else byBp.base.push(...declsFor(key, raw));
  }
  const bgSrc = style.backgroundImage?.src ? sanitizeUrl(style.backgroundImage.src, 'media') : undefined;
  if (style.backgroundImage && bgSrc) {
    const bg = style.backgroundImage;
    const layers = [`url(${cssString(bgSrc)})`];
    if (bg.overlay && isSafeCssColor(bg.overlay)) {
      const opacity = typeof bg.overlayOpacity === 'number' && Number.isFinite(bg.overlayOpacity) ? Math.min(1, Math.max(0, bg.overlayOpacity)) : 0.4;
      const pct = Math.round(opacity * 100);
      const c = resolveTokenRefs(bg.overlay);
      layers.unshift(`linear-gradient(color-mix(in srgb, ${c} ${pct}%, transparent), color-mix(in srgb, ${c} ${pct}%, transparent))`);
    }
    const size = bg.size === 'contain' || bg.size === 'auto' ? bg.size : 'cover';
    const position = bg.position && isSafeCssValue(bg.position, 60) ? bg.position : 'center';
    byBp.base.push(['background-image', layers.join(', ')], ['background-size', size], ['background-position', position], ['background-repeat', 'no-repeat']);
    if (bg.attachment === 'fixed') byBp.base.push(['background-attachment', 'fixed']);
  }
  const hidden = node.visibility?.hidden;
  if (hidden !== undefined) {
    if (isResponsiveObject(hidden)) {
      for (const bp of BREAKPOINTS) if (hidden[bp] !== undefined) byBp[bp].push(['display', hidden[bp] ? 'none' : 'revert-layer']);
    } else if (hidden) byBp.base.push(['display', 'none']);
  }

  const rule = (decls: Decl[]) => `${sel}{${decls.map(([p, v]) => `${p}:${v}`).join(';')}}`;
  let css = byBp.base.length ? rule(byBp.base) : '';
  for (const bp of ['laptop', 'tablet', 'mobile'] as const) {
    if (byBp[bp].length) css += `@media (max-width:${widths[bp]}px){${rule(byBp[bp])}}`;
  }
  if (node.customCss?.trim()) {
    const custom = sanitizeCss(node.customCss);
    css += custom.includes('&') ? custom.replace(/&/g, sel) : `${sel}{${custom}}`;
  }
  return css;
}

/** Compile CSS for an entire tree of nodes. */
export function compileTreeCss(nodes: Node[], opts: StyleCompileOptions = {}): string {
  let css = '';
  walkNodes(nodes, (n) => {
    css += compileNodeCss(n, opts);
  });
  return css;
}
