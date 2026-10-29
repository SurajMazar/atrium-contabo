/**
 * Wire format between the builder canvas and the site-script sandbox (see ./mirror.ts and ./agent.ts).
 *
 * The canvas shares the admin origin, so site scripts never run in it. Instead the canvas DOM is
 * serialized into an opaque-origin sandbox iframe, the site's necessary scripts run there, and the
 * DOM changes they make come back as plain data that the canvas replays as inert markup.
 */

/** Attribute list, in document order. */
export type Attrs = Array<[string, string]>;

/**
 * A node of the canvas DOM sent to the sandbox. Strings are text nodes. Every element carries its
 * key `k` (its index in the snapshot), and `r` when React owns it on the published page.
 */
export type SnapNode = string | { m: string } | { n: string; ns?: 's' | 'm'; a: Attrs; c: SnapNode[]; k: number; r?: 1 };

/**
 * A node in a sandbox result:
 * - `{ e: k }` an element of the snapshot (kept, or moved here),
 * - `{ t: [k, i] }` the i-th child node (text or comment) of snapshot element k, with new text `d`,
 * - a string: a new text node, `{ n, a, c }`: a new element (sanitized before it is created).
 */
export type MirrorNode = string | { e: number } | { t: [number, number]; d?: string } | { n: string; ns?: 's' | 'm'; a?: Attrs; c?: MirrorNode[] };

/** Changes to one snapshot element: attributes set (string) or removed (null), and its new child list. */
export interface MirrorOp {
  k: number;
  a?: Record<string, string | null>;
  c?: MirrorNode[];
}

export interface SandboxScript {
  code: string;
  placement: 'head' | 'body-start' | 'body-end';
}

export interface SandboxPayload {
  nonce: string;
  /** Page path scripts see on `<html data-atrium-path>` and `window.atrium.path`. */
  path: string;
  /** Report `prefers-reduced-motion: reduce` to scripts, so they show their resting state. */
  reducedMotion: boolean;
  /** Key 0 is <html>, key 1 is <body>. */
  html: Attrs;
  body: { a: Attrs; c: SnapNode[] };
  styles: Array<{ css?: string; href?: string }>;
  scripts: SandboxScript[];
  /** Settle: no DOM change for `quietMs`; give up waiting after `maxMs`. */
  quietMs: number;
  maxMs: number;
}

export interface SandboxResult {
  type: 'atrium:site-scripts';
  nonce: string;
  ops: MirrorOp[];
  /** Elements the scripts added to <head> (styles). */
  head: MirrorNode[];
  /** Uncaught script errors, for diagnostics. */
  errors: string[];
}

export const HTML_KEY = 0;
export const BODY_KEY = 1;
/** Expando that makes snapshot elements look React-owned (hydrated) to site scripts, as on the published page. */
export const FIBER_KEY = '__reactFiber$atrium';
