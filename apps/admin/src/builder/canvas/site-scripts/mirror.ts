import { BODY_KEY, HTML_KEY, type Attrs, type MirrorNode, type MirrorOp, type SnapNode } from './protocol';

/**
 * Canvas side of the site-script mirror: serialize the canvas DOM for the sandbox, then replay the
 * sandbox's result onto the canvas as inert markup (sanitized, no event handlers) that can be undone
 * precisely before the next run. Undo only touches what React has not changed since: a node the
 * mirror moved is put back only if it is still where the mirror left it, an attribute or text only if
 * it still holds the mirrored value.
 */

const SVG = 'http://www.w3.org/2000/svg';
const MATH = 'http://www.w3.org/1998/Math/MathML';
const XLINK = 'http://www.w3.org/1999/xlink';
const XML = 'http://www.w3.org/XML/1998/namespace';

/** Clean (un-mirrored) canvas DOM, by snapshot key. */
export interface Snapshot {
  doc: Document;
  /** key → element (0 = <html>, 1 = <body>). */
  els: Element[];
  /** key → its clean child nodes. */
  kids: Node[][];
  /** Clean position of every child node of a keyed element. */
  pos: Map<Node, { parent: Node; next: Node | null }>;
}

export interface MirrorLog {
  doc: Document;
  /** Mirror-made nodes placed into original parents (their subtrees go with them). */
  inserted: Node[];
  /** Originals the mirror moved or detached, and where it left them (null = detached). */
  moved: Array<{ node: Node; from: { parent: Node; next: Node | null }; to: Node | null }>;
  texts: Array<{ node: CharacterData; before: string; after: string }>;
  attrs: Array<{ el: Element; name: string; before: string | null; after: string | null }>;
}

export interface SerializedCanvas {
  snap: Snapshot;
  html: Attrs;
  body: { a: Attrs; c: SnapNode[] };
  styles: Array<{ css?: string; href?: string }>;
}

const isReactOwned = (el: Element) => Object.keys(el).some((k) => k.startsWith('__reactFiber$'));
const isScript = (n: Node) => n.nodeType === 1 && (n as Element).localName === 'script';

/**
 * Serialize the canvas as it is without the mirror (`log`), without touching the live DOM: mirror-made
 * nodes are skipped, moved originals are read at their clean positions, mirrored attributes and text
 * read as they were before.
 */
export function snapshotCanvas(doc: Document, log: MirrorLog | null): SerializedCanvas {
  const live = log && log.doc === doc ? log : null;
  const skip = new Set<Node>(live?.inserted ?? []);
  const away = new Set<Node>();
  const homeOf = new Map<Node, Array<{ node: Node; next: Node | null }>>();
  for (const m of live?.moved ?? []) {
    if (m.to === null ? m.node.parentNode !== null : m.node.parentNode !== m.to) continue; // React moved it since
    away.add(m.node);
    const list = homeOf.get(m.from.parent) ?? [];
    list.push({ node: m.node, next: m.from.next });
    homeOf.set(m.from.parent, list);
  }
  const attrUndo = new Map<Element, Map<string, { before: string | null; after: string | null }>>();
  for (const a of live?.attrs ?? []) {
    const m = attrUndo.get(a.el) ?? new Map();
    if (!m.has(a.name)) m.set(a.name, { before: a.before, after: a.after });
    else m.get(a.name)!.after = a.after;
    attrUndo.set(a.el, m);
  }
  const textUndo = new Map<Node, { before: string; after: string }>();
  for (const t of live?.texts ?? []) if (!textUndo.has(t.node)) textUndo.set(t.node, { before: t.before, after: t.after });

  const snap: Snapshot = { doc, els: [], kids: [], pos: new Map() };

  const attrsOf = (el: Element): Attrs => {
    const out: Attrs = [];
    const undo = attrUndo.get(el);
    for (const a of Array.from(el.attributes)) {
      const u = undo?.get(a.name);
      if (u && a.value === u.after) {
        if (u.before !== null) out.push([a.name, u.before]);
        continue;
      }
      if (/^on/i.test(a.name) || a.name === 'srcdoc') continue;
      out.push([a.name, a.value]);
    }
    if (undo) for (const [name, u] of undo) if (u.after === null && u.before !== null && !el.hasAttribute(name)) out.push([name, u.before]);
    return out;
  };

  /** Clean child list of `parent`: mirror-made nodes and moved-in originals out, moved-out originals back. */
  const cleanChildren = (parent: Node): Node[] => {
    const out: Node[] = [];
    for (let c = parent.firstChild; c; c = c.nextSibling) if (!skip.has(c) && !away.has(c) && !isScript(c)) out.push(c);
    const home = homeOf.get(parent);
    if (home) {
      // Re-insert in an order that resolves chains (A before B before null).
      let pending = home.slice();
      for (let guard = 0; pending.length && guard < 1000; guard++) {
        const rest: typeof pending = [];
        for (const h of pending) {
          const i = h.next === null ? out.length : out.indexOf(h.next);
          if (i < 0) rest.push(h);
          else out.splice(i, 0, h.node);
        }
        if (rest.length === pending.length) {
          out.push(...rest.map((h) => h.node));
          break;
        }
        pending = rest;
      }
    }
    return out;
  };

  const ser = (node: Node): SnapNode | null => {
    if (node.nodeType === 3) {
      const u = textUndo.get(node);
      const data = (node as Text).data;
      return u && data === u.after ? u.before : data;
    }
    if (node.nodeType === 8) return { m: (node as Comment).data };
    if (node.nodeType !== 1) return null;
    const el = node as Element;
    return serEl(el);
  };
  const serEl = (el: Element): SnapNode => {
    const k = snap.els.length;
    snap.els.push(el);
    const list = cleanChildren(el);
    snap.kids[k] = list;
    const c: SnapNode[] = [];
    list.forEach((child, i) => {
      snap.pos.set(child, { parent: el, next: list[i + 1] ?? null });
      const s = ser(child);
      c.push(s ?? '');
    });
    const ns = el.namespaceURI === SVG ? 's' : el.namespaceURI === MATH ? 'm' : undefined;
    return { n: el.localName, ...(ns ? { ns } : {}), a: attrsOf(el), c, k, ...(isReactOwned(el) ? { r: 1 as const } : {}) };
  };

  // Keys 0 and 1 are <html> and <body>; <head> content travels as `styles`.
  snap.els[HTML_KEY] = doc.documentElement;
  snap.kids[HTML_KEY] = [];
  snap.els[BODY_KEY] = doc.body;
  const bodyKids = cleanChildren(doc.body);
  snap.kids[BODY_KEY] = bodyKids;
  const bodyC: SnapNode[] = [];
  bodyKids.forEach((child, i) => {
    snap.pos.set(child, { parent: doc.body, next: bodyKids[i + 1] ?? null });
    bodyC.push(ser(child) ?? '');
  });

  const styles: SerializedCanvas['styles'] = [];
  for (const el of Array.from(doc.head.children)) {
    if (skip.has(el)) continue;
    if (el.localName === 'style') styles.push({ css: el.textContent ?? '' });
    else if (el.localName === 'link' && (el as HTMLLinkElement).rel === 'stylesheet' && (el as HTMLLinkElement).href) styles.push({ href: (el as HTMLLinkElement).href });
  }
  return { snap, html: attrsOf(doc.documentElement), body: { a: attrsOf(doc.body), c: bodyC }, styles };
}

// ───────────────────────── sanitizing ─────────────────────────

/** Never created from script output: active content, frames, document-level metadata, SVG animation. */
const DENY_TAGS = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'meta', 'title', 'noscript', 'template', 'portal', 'fencedframe',
  'animate', 'animatemotion', 'animatetransform', 'set', 'discard', 'handler', 'listener',
]);
const DENY_ATTRS = new Set(['srcdoc', 'formaction', 'action', 'ping', 'is', 'contenteditable', 'autofocus', 'http-equiv', 'nonce']);
/** Attributes the editor reads to map DOM to nodes: never changed on existing elements. */
const PROTECTED_ATTRS = new Set(['data-node-id', 'data-node-type', 'data-edit-prop', 'data-parent-id', 'data-drop-zone', 'data-page-id', 'data-global-ref', 'data-node-hidden', 'id']);
/** Editing hooks never travel with script-made copies: inline editing and drops would target the wrong node. */
const EDITING_ATTRS = new Set(['data-edit-prop', 'data-parent-id', 'data-drop-zone']);
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'imagesrcset', 'poster', 'xlink:href', 'data', 'background', 'cite', 'longdesc', 'lowsrc', 'dynsrc', 'codebase', 'manifest']);
const IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/;

function safeUrl(raw: string, attr: string, tag: string): boolean {
  const s = raw.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  const m = /^([a-z][a-z0-9+.-]*):/.exec(s);
  if (!m) return true; // relative, fragment
  const scheme = m[1];
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') return true;
  const imageAttr = attr === 'src' || attr === 'srcset' || attr === 'imagesrcset' || attr === 'poster' || (tag === 'image' && (attr === 'href' || attr === 'xlink:href'));
  return scheme === 'data' && imageAttr && IMAGE_DATA.test(s);
}

export function safeAttribute(tag: string, name: string, value: string, existing: boolean): boolean {
  const n = name.toLowerCase();
  if (!/^[a-z_][a-z0-9_.:-]*$/.test(n) || n.startsWith('on') || DENY_ATTRS.has(n)) return false;
  if (n.startsWith('data-atrium-') && n !== 'data-atrium-for') return false;
  if (existing ? PROTECTED_ATTRS.has(n) : EDITING_ATTRS.has(n)) return false;
  if (n === 'id' && /^atrium-/i.test(value)) return false;
  if (tag === 'use' && (n === 'href' || n === 'xlink:href')) return value.trim().startsWith('#');
  if (URL_ATTRS.has(n)) {
    if (n === 'srcset' || n === 'imagesrcset') return value.split(',').every((part) => safeUrl(part.trim().split(/\s+/)[0] ?? '', n, tag));
    return safeUrl(value, n, tag);
  }
  if (n === 'style' && /expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(value)) return false;
  return true;
}

function setAttr(el: Element, name: string, value: string) {
  const n = name.toLowerCase();
  if (n.startsWith('xlink:')) el.setAttributeNS(XLINK, name, value);
  else if (n.startsWith('xml:')) el.setAttributeNS(XML, name, value);
  else el.setAttribute(name, value);
}

// ───────────────────────── apply / undo ─────────────────────────

const MAX_NODES = 20_000;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Replay a sandbox result onto the (clean) canvas. Result data is untrusted: every ref is checked, every new node sanitized. */
export function applyMirror(snap: Snapshot, result: { ops: unknown; head: unknown }): MirrorLog {
  const { doc } = snap;
  const log: MirrorLog = { doc, inserted: [], moved: [], texts: [], attrs: [] };
  const used = new Set<Node>();
  const touched: Node[] = [];
  // Originals still attached now; ones React removed must not come back.
  const attachedAtStart = (n: Node) => n.isConnected || detachedByUs.has(n);
  const detachedByUs = new Set<Node>();
  let budget = MAX_NODES;

  const original = (node: Node | undefined): Node | null => {
    if (!node || used.has(node) || !attachedAtStart(node)) return null;
    used.add(node);
    touched.push(node);
    return node;
  };

  const create = (item: Record<string, unknown>, depth: number, top: boolean): Node | null => {
    if (depth > 64 || --budget < 0) return null;
    const tag = String(item.n ?? '');
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tag)) return null;
    const lower = tag.toLowerCase();
    if (DENY_TAGS.has(lower)) return null;
    const ns = item.ns === 's' ? SVG : item.ns === 'm' ? MATH : null;
    let el: Element;
    try {
      el = ns ? doc.createElementNS(ns, tag) : doc.createElement(lower);
    } catch {
      return null;
    }
    const attrs = Array.isArray(item.a) ? (item.a as unknown[]) : [];
    for (const pair of attrs) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') continue;
      if (!safeAttribute(el.localName.toLowerCase(), pair[0], pair[1], false)) continue;
      try {
        setAttr(el, pair[0], pair[1].slice(0, 200_000));
      } catch {
        /* invalid name */
      }
    }
    // Head additions: stylesheets only. <link> only as an https stylesheet.
    if (top && lower !== 'style' && lower !== 'link') return null;
    if (lower === 'link' && !ns) {
      const l = el as HTMLLinkElement;
      if (l.rel !== 'stylesheet' || !/^https:\/\//i.test(l.getAttribute('href') ?? '')) return null;
    }
    const children = Array.isArray(item.c) ? (item.c as unknown[]) : [];
    for (const c of children) {
      const child = materialize(c, depth + 1);
      if (child) el.appendChild(child);
    }
    return el;
  };

  function materialize(item: unknown, depth = 0): Node | null {
    if (typeof item === 'string') return --budget < 0 ? null : doc.createTextNode(item.slice(0, 200_000));
    if (!isObj(item)) return null;
    if (typeof item.e === 'number') {
      if (item.e === HTML_KEY || item.e === BODY_KEY) return null;
      return original(snap.els[item.e]);
    }
    if (Array.isArray(item.t)) {
      const [k, i] = item.t as unknown[];
      if (typeof k !== 'number' || typeof i !== 'number') return null;
      const node = snap.kids[k]?.[i];
      if (!node || node.nodeType === 1) return null;
      const n = original(node);
      if (n && typeof item.d === 'string' && n.nodeType === 3 && (n as Text).data !== item.d) {
        log.texts.push({ node: n as Text, before: (n as Text).data, after: item.d });
        (n as Text).data = item.d;
      }
      return n;
    }
    if (typeof item.n === 'string') return create(item, depth, false);
    return null;
  }

  const ops = Array.isArray(result.ops) ? (result.ops as unknown[]) : [];
  for (const raw of ops) {
    if (!isObj(raw) || typeof raw.k !== 'number') continue;
    const op = raw as unknown as MirrorOp;
    const el = snap.els[op.k];
    if (!el || !attachedAtStart(el)) continue;
    if (isObj(op.a)) {
      for (const [name, value] of Object.entries(op.a)) {
        if (value !== null && typeof value !== 'string') continue;
        const before = el.getAttribute(name);
        if (before === value) continue;
        if (value === null ? !safeAttribute(el.localName.toLowerCase(), name, '', true) : !safeAttribute(el.localName.toLowerCase(), name, value, true)) continue;
        try {
          if (value === null) el.removeAttribute(name);
          else setAttr(el, name, value.slice(0, 200_000));
        } catch {
          continue;
        }
        log.attrs.push({ el, name, before, after: value });
      }
    }
    if (Array.isArray(op.c) && op.k !== HTML_KEY) {
      const clean = snap.kids[op.k] ?? [];
      const want: Node[] = [];
      for (const item of op.c) {
        const node = materialize(item);
        if (node) want.push(node);
      }
      const keep = new Set(want);
      for (const child of clean) {
        if (keep.has(child) || child.parentNode !== el) continue;
        if (!used.has(child)) {
          used.add(child);
          touched.push(child);
        }
        el.removeChild(child);
        detachedByUs.add(child);
      }
      let ref: Node | null = el.firstChild;
      for (const node of want) {
        if (node === ref) {
          ref = ref.nextSibling;
          continue;
        }
        el.insertBefore(node, ref);
        detachedByUs.delete(node);
        if (!snap.pos.has(node)) log.inserted.push(node);
      }
    }
  }

  const head = Array.isArray(result.head) ? (result.head as unknown[]) : [];
  for (const item of head) {
    if (!isObj(item)) continue;
    const node = create(item, 0, true);
    if (node) {
      doc.head.appendChild(node);
      log.inserted.push(node);
    }
  }

  // Remember every original that no longer sits at its clean position.
  for (const node of touched) {
    const from = snap.pos.get(node);
    if (!from) continue;
    const to = node.parentNode;
    if (to === from.parent) continue;
    log.moved.push({ node, from, to });
  }
  return log;
}

/** Undo a mirror. Returns `uncertain` when an original could not be put back where it belongs. */
export function undoMirror(log: MirrorLog): { uncertain: boolean } {
  let uncertain = false;
  for (let i = log.inserted.length - 1; i >= 0; i--) log.inserted[i]!.parentNode?.removeChild(log.inserted[i]!);
  // Only nodes still where the mirror left them; React may have moved or removed others since.
  let pending = log.moved.filter((m) => m.node.parentNode === m.to);
  for (let guard = 0; pending.length && guard < 1000; guard++) {
    const rest: typeof pending = [];
    for (const m of pending) {
      const { parent, next } = m.from;
      if (next === null || next.parentNode === parent) parent.insertBefore(m.node, next);
      else rest.push(m);
    }
    if (rest.length === pending.length) {
      for (const m of rest) {
        if (m.from.parent.isConnected) uncertain = true;
        m.from.parent.appendChild(m.node);
      }
      break;
    }
    pending = rest;
  }
  for (let i = log.texts.length - 1; i >= 0; i--) {
    const t = log.texts[i]!;
    if (t.node.data === t.after) t.node.data = t.before;
  }
  for (let i = log.attrs.length - 1; i >= 0; i--) {
    const a = log.attrs[i]!;
    if (a.el.getAttribute(a.name) !== a.after) continue;
    if (a.before === null) a.el.removeAttribute(a.name);
    else setAttr(a.el, a.name, a.before);
  }
  log.inserted = [];
  log.moved = [];
  log.texts = [];
  log.attrs = [];
  return { uncertain };
}
