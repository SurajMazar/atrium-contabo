/**
 * Tiny node-building DSL over Atrium's NodeInput.
 *
 * Every node gets a deterministic, site-unique id (`<scope>-<n>`), so re-running the converter
 * produces a stable bundle and ids stay valid CSS class fragments (`a-n-<id>`). Script hooks use a
 * few semantic ids (`lg-hero`, `lg-pagehero-…`); everything else is styled by its own `customCss`
 * (scoped with `&`) or by the site stylesheet keyed on Atrium's own component classes, so styles
 * travel with a node when it is duplicated in the builder.
 */
import type { NodeInput, StyleProps } from '../../../../packages/schema/src/index.ts';

export type N = NodeInput;
type Anim = NonNullable<NodeInput['animation']>;

let scope = 'x';
let counter = 0;
const used = new Set<string>();

export function setScope(s: string): void {
  scope = s;
  counter = 0;
}

export function resetIds(): void {
  used.clear();
  counter = 0;
}

export function nextId(hint?: string): string {
  let id = hint ?? `${scope}-${++counter}`;
  if (used.has(id)) id = `${id}-${++counter}`;
  used.add(id);
  return id.slice(0, 64);
}

export interface Opts {
  id?: string;
  name?: string;
  style?: StyleProps;
  css?: string;
  anim?: Anim;
  anchor?: string;
  variant?: string;
  hidden?: NodeInput['visibility'];
}

/**
 * Atrium emits node CSS *before* the site stylesheet, both scoped `.atrium-site .a-…` (0,2,0), so
 * a node rule would lose to a site rule for the same property. Prefixing each `&` selector with
 * `html` (0,2,1) keeps a node's own CSS authoritative over the shared design system.
 */
export function boost(css: string): string {
  return css.replace(/(^|[{}])(\s*)&/g, '$1$2html &');
}

export function node(type: string, props: Record<string, unknown>, children: N[] | undefined, o: Opts = {}): N {
  const n: N = { id: nextId(o.id), type, props };
  if (o.variant) n.variant = o.variant;
  if (o.name) n.name = o.name.slice(0, 120);
  if (children?.length) n.children = children;
  if (o.style) n.style = o.style;
  if (o.css) n.customCss = boost(o.css.trim());
  if (o.anim) n.animation = o.anim;
  if (o.anchor) n.anchor = o.anchor;
  if (o.hidden) n.visibility = o.hidden;
  return n;
}

// ── structure ────────────────────────────────────────────────────────────────

export type Tone = 'default' | 'surface' | 'surface-alt' | 'inverse' | 'transparent';
export type Space = 'none' | 'sm' | 'md' | 'lg' | 'xl';

/** A page band. `lg` = the design's `full` rhythm, `md` = `half`, `xl` = `wide`. */
export function section(children: N[], o: Opts & { tone?: Tone; top?: Space; bottom?: Space; width?: 'default' | 'full' } = {}): N {
  return node(
    'section',
    { tone: o.tone ?? 'default', containerWidth: o.width ?? 'default', spacingTop: o.top ?? 'lg', spacingBottom: o.bottom ?? o.top ?? 'lg', minHeight: 'auto', verticalAlign: 'start' },
    children,
    o,
  );
}

export function box(children: N[], o: Opts & { tag?: 'div' | 'article' | 'aside' | 'header' | 'footer' | 'nav' } = {}): N {
  return node('container', { width: 'auto', tag: o.tag ?? 'div' }, children, o);
}

// ── content ──────────────────────────────────────────────────────────────────

export type HSize = 'display' | 'lg' | 'md' | 'sm';
export function heading(text: string, level: 'h1' | 'h2' | 'h3' | 'h4', size: HSize, o: Opts = {}): N {
  return node('heading', { text, level, size, font: 'heading' }, undefined, o);
}

export function text(t: string, size: 'sm' | 'base' | 'lg' = 'base', o: Opts & { eyebrow?: boolean; muted?: boolean } = {}): N {
  return node('text', { text: t, size, muted: !!o.muted, eyebrow: !!o.eyebrow }, undefined, o);
}

export function eyebrow(t: string, o: Opts = {}): N {
  return text(t, 'sm', { ...o, eyebrow: true });
}

export function rich(html: string, o: Opts = {}): N {
  return node('rich-text', { html, measure: 'full', dropCap: false }, undefined, o);
}

export type BtnStyle = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
export function button(label: string, link: unknown, style: BtnStyle, o: Opts & { size?: 'sm' | 'md' | 'lg'; icon?: string; iconPosition?: 'start' | 'end'; full?: boolean } = {}): N {
  const props: Record<string, unknown> = { label, link, style, size: o.size ?? 'md', fullWidth: !!o.full, iconPosition: o.iconPosition ?? 'end' };
  if (o.icon) props.icon = o.icon;
  return node('button', props, undefined, o);
}

export function divider(o: Opts = {}): N {
  return node('divider', { style: 'short' }, undefined, o);
}

export function list(items: string[], o: Opts = {}): N {
  return node('list', { items: items.map((t) => ({ text: t })), style: 'none', columns: 1 }, undefined, o);
}

export function image(media: Record<string, unknown>, o: Opts & { link?: unknown; caption?: string; priority?: boolean; aspect?: string } = {}): N {
  const props: Record<string, unknown> = { image: media, aspect: o.aspect ?? 'auto', fit: 'cover', rounded: 'none', frame: 'none', priority: !!o.priority };
  if (o.link) props.link = o.link;
  if (o.caption) props.caption = o.caption;
  return node('image', props, undefined, o);
}

export function icon(lucide: string, size: number, o: Opts = {}): N {
  return node('icon', { name: lucide, size, strokeWidth: 1.5 }, undefined, o);
}

// ── animation presets mirroring src/lib/animations.ts ────────────────────────

/** `fadeIn`: rise + fade as the block enters (ease `smooth`, start `top 82%`). */
export const fadeUp = (distance = 30, delay = 0, extra: Partial<Anim> = {}): Anim => ({ preset: 'fade-up', distance, duration: 1, delay, ease: 'power2.inOut', trigger: 'scroll', start: 'top 82%', once: true, ...extra });
/** `revealText`: lines rise out of their masks (ease `reveal`). */
export const lineReveal = (delay = 0, extra: Partial<Anim> = {}): Anim => ({ preset: 'text-reveal', target: 'lines', distance: 110, duration: 1.2, stagger: 0.12, delay, ease: 'power3.inOut', trigger: 'scroll', start: 'top 82%', once: true, ...extra });
/** `staggerReveal`: children in sequence. */
export const stagger = (each = 0.12, distance = 40): Anim => ({ preset: 'stagger', target: 'children', stagger: each, distance, duration: 0.9, ease: 'power2.inOut', trigger: 'scroll', start: 'top 82%', once: true });
/** `imageReveal`: the frame wipes up from the bottom. */
export const clipReveal = (start = 'top 85%'): Anim => ({ preset: 'clip-reveal', duration: 1.4, ease: 'power3.inOut', trigger: 'scroll', start, once: true });
/** Scroll-scrubbed drift of the photograph inside its frame. */
export const parallax = (distance = 4): Anim => ({ preset: 'parallax', distance, scrub: true, trigger: 'scroll', start: 'top bottom', end: 'bottom top' });
