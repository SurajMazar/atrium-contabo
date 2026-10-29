import type { SandboxPayload } from './protocol';

/**
 * Runs INSIDE the opaque-origin sandbox iframe (serialized with Function#toString, so it must stay
 * self-contained: no imports, no outer references, no syntax that needs compiler helpers).
 *
 * It recreates the canvas DOM from the payload, runs the site's scripts against it the way the
 * published page would (head scripts first, then the body, `DOMContentLoaded` and `load` fire as
 * usual), waits until the DOM is quiet, and posts back what the scripts changed relative to the
 * original nodes. Scripts see `window.atrium.editor === true`, `<html data-atrium-editor
 * data-atrium-path>`, and `prefers-reduced-motion: reduce` (resting state, no scroll-hidden content).
 */
export function sandboxAgent(P: SandboxPayload, win: Window) {
  var doc = win.document;
  var FIBER = '__reactFiber$atrium';
  var SVG = 'http://www.w3.org/2000/svg';
  var MATH = 'http://www.w3.org/1998/Math/MathML';
  var byKey: Element[] = [];
  var keyOf = new Map<Node, number>();
  var kids: Node[][] = [];
  var origAttrs: Array<Record<string, string>> = [];
  var origData = new Map<Node, string>();
  var refOf = new Map<Node, [number, number]>();
  var headStart: Node[] = [];
  var errors: string[] = [];

  win.addEventListener('error', function (e) {
    if (errors.length < 20) errors.push(String((e as ErrorEvent).message || 'Script error'));
  });

  // ---- what scripts see
  try {
    Object.defineProperty(win, 'atrium', { value: Object.freeze({ editor: true, mode: 'editor', path: P.path, version: 1 }), configurable: false, writable: false });
  } catch (e) {
    /* already defined */
  }
  var html = doc.documentElement;
  for (var h = 0; h < P.html.length; h++) setAttr(html, P.html[h]![0], P.html[h]![1]);
  html.setAttribute('data-atrium-editor', '');
  html.setAttribute('data-atrium-path', P.path);
  if (P.reducedMotion && typeof win.matchMedia === 'function') {
    var nativeMatch = win.matchMedia.bind(win);
    var RM = /\(\s*prefers-reduced-motion\s*(?::\s*(reduce|no-preference)\s*)?\)/gi;
    win.matchMedia = function (q: string) {
      return nativeMatch(
        String(q).replace(RM, function (_m: string, v?: string) {
          return v && v.toLowerCase() === 'no-preference' ? '(max-width: 0px)' : '(min-width: 0px)';
        }),
      );
    };
  }
  // An opaque origin has no storage or cookies; scripts that use them unguarded would throw.
  function memoryStorage() {
    var m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      key: function (i: number) {
        var keys = Array.from(m.keys());
        return i < keys.length ? keys[i]! : null;
      },
      getItem: function (k: string) {
        return m.has(String(k)) ? m.get(String(k))! : null;
      },
      setItem: function (k: string, v: string) {
        m.set(String(k), String(v));
      },
      removeItem: function (k: string) {
        m.delete(String(k));
      },
      clear: function () {
        m.clear();
      },
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try {
      void (win as unknown as Record<string, Storage>)[name]!.length;
    } catch (e) {
      try {
        Object.defineProperty(win, name, { value: memoryStorage(), configurable: true });
      } catch (e2) {
        /* leave it */
      }
    }
  });
  try {
    void doc.cookie;
  } catch (e) {
    var jar: Record<string, string> = {};
    try {
      Object.defineProperty(doc, 'cookie', {
        configurable: true,
        get: function () {
          return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; ');
        },
        set: function (v: string) {
          var pair = String(v).split(';')[0]!;
          var i = pair.indexOf('=');
          if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
        },
      });
    } catch (e2) {
      /* leave it */
    }
  }

  // ---- styles, then head scripts
  var head = doc.head;
  for (var s = 0; s < P.styles.length; s++) {
    var st = P.styles[s]!;
    if (typeof st.css === 'string') {
      var style = doc.createElement('style');
      style.textContent = st.css;
      head.appendChild(style);
    } else if (st.href) {
      var link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = st.href;
      head.appendChild(link);
    }
  }
  headStart = Array.from(head.childNodes);
  runScripts('head', head, null);

  function setAttr(el: Element, name: string, value: string) {
    try {
      if (name.indexOf('xlink:') === 0) el.setAttributeNS('http://www.w3.org/1999/xlink', name, value);
      else if (name.indexOf('xml:') === 0) el.setAttributeNS('http://www.w3.org/XML/1998/namespace', name, value);
      else el.setAttribute(name, value);
    } catch (e) {
      /* invalid name */
    }
  }

  function runScripts(placement: string, parent: Node, before: Node | null) {
    for (var i = 0; i < P.scripts.length; i++) {
      var sc = P.scripts[i]!;
      if (sc.placement !== placement) continue;
      var el = doc.createElement('script');
      el.setAttribute('data-atrium-script', '');
      el.text = sc.code;
      parent.insertBefore(el, before);
    }
  }

  function key(el: Element, k: number) {
    byKey[k] = el;
    keyOf.set(el, k);
  }

  type Snap = string | { m: string } | { n: string; ns?: string; a: Array<[string, string]>; c: Snap[]; k: number; r?: number };
  function build(n: Snap, parent: Node) {
    var node: Node;
    if (typeof n === 'string') node = doc.createTextNode(n);
    else if ('m' in n) node = doc.createComment(n.m);
    else {
      var el = n.ns === 's' ? doc.createElementNS(SVG, n.n) : n.ns === 'm' ? doc.createElementNS(MATH, n.n) : doc.createElement(n.n);
      for (var i = 0; i < n.a.length; i++) setAttr(el, n.a[i]![0], n.a[i]![1]);
      if (n.r) (el as unknown as Record<string, unknown>)[FIBER] = true;
      key(el, n.k);
      for (var j = 0; j < n.c.length; j++) build(n.c[j]!, el);
      node = el;
    }
    parent.appendChild(node);
  }

  function childList(el: Node): Node[] {
    var out: Node[] = [];
    for (var c = el.firstChild; c; c = c.nextSibling) if (!(c.nodeType === 1 && (c as Element).localName === 'script')) out.push(c);
    return out;
  }
  function attrMap(el: Element): Record<string, string> {
    var o: Record<string, string> = {};
    for (var i = 0; i < el.attributes.length; i++) o[el.attributes[i]!.name] = el.attributes[i]!.value;
    return o;
  }
  function record() {
    for (var k = 0; k < byKey.length; k++) {
      var el = byKey[k];
      if (!el) continue;
      origAttrs[k] = attrMap(el);
      var list = k === 0 ? [] : childList(el);
      kids[k] = list;
      for (var i = 0; i < list.length; i++) {
        refOf.set(list[i]!, [k, i]);
        if (list[i]!.nodeType !== 1) origData.set(list[i]!, (list[i] as CharacterData).data);
      }
    }
  }

  function ser(node: Node): unknown {
    if (node.nodeType === 1) {
      var k = keyOf.get(node);
      if (k !== undefined) return { e: k };
      var el = node as Element;
      if (el.localName === 'script') return null;
      var a: Array<[string, string]> = [];
      for (var i = 0; i < el.attributes.length; i++) a.push([el.attributes[i]!.name, el.attributes[i]!.value]);
      var c: unknown[] = [];
      for (var ch = el.firstChild; ch; ch = ch.nextSibling) {
        var sc = ser(ch);
        if (sc !== null) c.push(sc);
      }
      var out: { n: string; a: Array<[string, string]>; c: unknown[]; ns?: string } = { n: el.localName, a: a, c: c };
      if (el.namespaceURI === SVG) out.ns = 's';
      else if (el.namespaceURI === MATH) out.ns = 'm';
      return out;
    }
    var ref = refOf.get(node);
    if (ref) {
      var r: { t: [number, number]; d?: string } = { t: ref };
      var d = (node as CharacterData).data;
      if (origData.get(node) !== d) r.d = d;
      return r;
    }
    if (node.nodeType === 3) return (node as Text).data;
    return null;
  }

  function skipAttr(name: string) {
    return name.indexOf('data-atrium-') === 0;
  }

  function computeOps() {
    var ops: unknown[] = [];
    for (var k = 0; k < byKey.length; k++) {
      var el = byKey[k];
      if (!el || !el.isConnected) continue;
      var op: { k: number; a?: Record<string, string | null>; c?: unknown[] } | null = null;
      var before = origAttrs[k]!;
      var now = attrMap(el);
      var a: Record<string, string | null> = {};
      var changed = false;
      for (var n in now) if (!skipAttr(n) && before[n] !== now[n]) { a[n] = now[n]!; changed = true; }
      for (var b in before) if (!skipAttr(b) && !Object.prototype.hasOwnProperty.call(now, b)) { a[b] = null; changed = true; }
      if (changed) op = { k: k, a: a };
      if (k !== 0) {
        var cur = childList(el);
        var orig = kids[k]!;
        var differs = cur.length !== orig.length;
        for (var i = 0; !differs && i < cur.length; i++) if (cur[i] !== orig[i]) differs = true;
        for (var j = 0; !differs && j < orig.length; j++) if (orig[j]!.nodeType !== 1 && origData.get(orig[j]!) !== (orig[j] as CharacterData).data) differs = true;
        if (differs) {
          op = op || { k: k };
          // `el.textContent = …` replaces React's text node: report it as new text in that node, so the
          // canvas keeps the node React updates.
          var gone = orig.filter(function (o) { return o.nodeType === 3 && cur.indexOf(o) < 0; });
          op.c = cur
            .map(function (node) {
              if (node.nodeType === 3 && !refOf.has(node) && gone.length) return { t: refOf.get(gone.shift()!)!, d: (node as Text).data };
              return ser(node);
            })
            .filter(function (x) { return x !== null; });
        }
      }
      if (op) ops.push(op);
    }
    var added: unknown[] = [];
    for (var hc = head.firstChild; hc; hc = hc.nextSibling) {
      if (headStart.indexOf(hc) >= 0 || hc.nodeType !== 1 || (hc as Element).localName === 'script') continue;
      var sh = ser(hc);
      if (sh !== null) added.push(sh);
    }
    return { ops: ops, head: added };
  }

  function settle() {
    var start = Date.now();
    var last = start;
    var loaded = doc.readyState === 'complete';
    var done = false;
    win.addEventListener('load', function () {
      loaded = true;
      last = Date.now();
    });
    var mo = new MutationObserver(function () {
      last = Date.now();
    });
    mo.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
    var timer = setInterval(function () {
      if (done) return;
      var now = Date.now();
      var quiet = now - last >= P.quietMs && (loaded || now - start > 1500);
      if (!quiet && now - start < P.maxMs) return;
      done = true;
      clearInterval(timer);
      mo.disconnect();
      var result = computeOps();
      win.parent.postMessage({ type: 'atrium:site-scripts', nonce: P.nonce, ops: result.ops, head: result.head, errors: errors }, '*');
    }, 40);
  }

  return {
    /** Called from the first script in <body>: builds the page, then runs body scripts like the published page. */
    body: function () {
      var body = doc.body;
      for (var i = 0; i < P.body.a.length; i++) setAttr(body, P.body.a[i]![0], P.body.a[i]![1]);
      // On the published page React owns <html> and <body> too.
      (html as unknown as Record<string, unknown>)[FIBER] = true;
      (body as unknown as Record<string, unknown>)[FIBER] = true;
      key(html, 0);
      key(body, 1);
      runScripts('body-start', body, body.firstChild);
      for (var j = 0; j < P.body.c.length; j++) build(P.body.c[j] as Snap, body);
      record();
      runScripts('body-end', body, null);
      settle();
    },
  };
}

/** The sandbox document: payload and agent inlined, so scripts run while the document is still loading. */
export function sandboxDocument(payload: SandboxPayload): string {
  // JSON is valid JS (ES2019+ allows U+2028/2029 in strings); only `<` must not end the inline script.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const agent = sandboxAgent.toString().replace(/<\/(script)/gi, '<\\/$1');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<script>window.__atriumSandbox=(${agent})(${json},window);</script>` +
    '</head><body><script>window.__atriumSandbox.body();</script></body></html>'
  );
}
