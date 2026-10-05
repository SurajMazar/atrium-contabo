import {
  BREAKPOINTS, DEFAULT_BREAKPOINT_WIDTHS, isResponsiveObject, walkNodes,
  type Breakpoint, type Node, type Responsive, type StyleProps,
} from '@atrium/schema';
import { resolveTokenRefs } from './tokens';

export const nodeClass = (id: string) => `a-n-${id}`;

const ALIGN: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };

type Decl = [prop: string, value: string];

function declsFor(key: keyof StyleProps, value: unknown): Decl[] {
  if (value === undefined || value === null || value === '') return [];
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

/** Strip constructs that could escape a style block or execute script. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding/gi, '');
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
  if (style.backgroundImage?.src) {
    const bg = style.backgroundImage;
    const layers = [`url("${bg.src.replace(/"/g, '%22')}")`];
    if (bg.overlay) {
      const pct = Math.round((bg.overlayOpacity ?? 0.4) * 100);
      const c = resolveTokenRefs(bg.overlay);
      layers.unshift(`linear-gradient(color-mix(in srgb, ${c} ${pct}%, transparent), color-mix(in srgb, ${c} ${pct}%, transparent))`);
    }
    byBp.base.push(['background-image', layers.join(', ')], ['background-size', bg.size ?? 'cover'], ['background-position', bg.position ?? 'center'], ['background-repeat', 'no-repeat']);
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
