// @vitest-environment jsdom
// @ts-expect-error -- jsdom ships no type declarations
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { sandboxDocument } from './agent';
import { applyMirror, safeAttribute, snapshotCanvas, undoMirror } from './mirror';
import type { SandboxPayload, SandboxResult, SandboxScript } from './protocol';

/** A canvas like the builder's: React-owned page inside #atrium-canvas-root. */
function canvas(): Document {
  const doc = document.implementation.createHTMLDocument('canvas');
  doc.head.innerHTML = '<style id="atrium-site-css">.a-hero{color:red}</style>';
  doc.body.className = 'atrium-site';
  doc.body.innerHTML =
    '<div id="atrium-canvas-root"><div class="atrium-site">' +
    '<header class="a-header" data-node-id="hdr">Site</header>' +
    '<main id="main" class="a-main">' +
    '<section class="a-hero" data-node-id="hero"><div class="a-hero__copy"><h1 data-edit-prop="heading">Welcome <em>home</em></h1><span class="a-tag">01 · Seed</span></div></section>' +
    '<section class="a-faq" data-node-id="faq"><div class="a-container"><div class="a-tabs-block" data-node-id="tabs"><details><summary>Q1</summary><p>A1</p></details></div></div></section>' +
    '<section class="a-split" data-node-id="split"><figure class="a-image" data-node-id="img"><img src="https://cdn.example/a.jpg" alt=""></figure></section>' +
    '</main></div></div>';
  // Mark everything React-owned, as React does with its fiber expando.
  doc.querySelectorAll('#atrium-canvas-root *').forEach((el) => ((el as unknown as Record<string, unknown>).__reactFiber$test = {}));
  return doc;
}

const SITE_SCRIPT = `
(function () {
  function hydrated(el) { for (var k in el) if (k.indexOf('__reactFiber') === 0) return true; return false; }
  function run() {
    var copy = document.querySelector('main .a-hero__copy');
    if (copy && hydrated(copy) && !copy.querySelector('.crumbs')) {
      var nav = document.createElement('nav'); nav.className = 'crumbs';
      nav.innerHTML = '<a href="/">Home</a> <span onclick="alert(1)">' + document.documentElement.getAttribute('data-atrium-path') + '</span><a href="javascript:alert(2)">x</a><iframe src="https://evil.example"></iframe>';
      copy.insertBefore(nav, copy.firstChild);
    }
    var tag = document.querySelector('.a-tag');
    if (tag && /·/.test(tag.textContent)) tag.textContent = tag.textContent.split(' · ')[1];
    var tabs = document.querySelector('.a-tabs-block');
    if (tabs && !tabs.hidden) {
      tabs.hidden = true;
      var wrap = document.createElement('div'); wrap.className = 'faq-list';
      wrap.setAttribute('data-atrium-for', tabs.getAttribute('data-node-id'));
      wrap.innerHTML = '<p>' + tabs.querySelector('summary').textContent + '</p>';
      tabs.parentNode.insertBefore(wrap, tabs);
    }
    var fig = document.querySelector('figure.a-image');
    if (fig && !fig.parentNode.classList.contains('frame')) {
      var f = document.createElement('div'); f.className = 'frame';
      fig.parentNode.insertBefore(f, fig); f.appendChild(fig);
    }
    if (hydrated(document.body) && !document.getElementById('wa')) {
      var a = document.createElement('a'); a.id = 'wa'; a.href = 'https://wa.me/1'; a.textContent = 'WhatsApp';
      document.body.appendChild(a);
    }
    document.documentElement.classList.add('has-js');
    document.querySelector('main').classList.add(window.atrium && window.atrium.editor ? 'in-editor' : 'live');
  }
  setTimeout(run, 30);
})();`;

const HEAD_SCRIPT = `var s = document.createElement('style'); s.textContent = '.crumbs{display:flex}'; document.head.appendChild(s);`;

function runInSandbox(payload: SandboxPayload): Promise<SandboxResult> {
  const dom = new JSDOM(sandboxDocument(payload), { runScripts: 'dangerously' });
  return new Promise((resolve) => {
    dom.window.addEventListener('message', (e: MessageEvent) => {
      resolve(e.data as SandboxResult);
      dom.window.close();
    });
  });
}

function payloadFor(doc: Document, log: Parameters<typeof snapshotCanvas>[1], scripts: SandboxScript[]) {
  const c = snapshotCanvas(doc, log);
  const payload: SandboxPayload = { nonce: 'n', path: '/stay', reducedMotion: true, html: c.html, body: c.body, styles: c.styles, scripts, quietMs: 60, maxMs: 2000 };
  return { c, payload };
}

const SCRIPTS: SandboxScript[] = [
  { code: HEAD_SCRIPT, placement: 'head' },
  { code: SITE_SCRIPT, placement: 'body-end' },
];

describe('site-script mirror', () => {
  let doc: Document;
  let clean: string;
  beforeEach(() => {
    doc = canvas();
    clean = doc.documentElement.outerHTML;
  });

  it('replays what site scripts build as sanitized markup, and undoes it exactly', async () => {
    const { c, payload } = payloadFor(doc, null, SCRIPTS);
    const result = await runInSandbox(payload);
    expect(result.errors).toEqual([]);
    const tabs = doc.querySelector('.a-tabs-block')!;
    const hero = doc.querySelector('h1')!;
    const tagText = doc.querySelector('.a-tag')!.firstChild!;
    const log = applyMirror(c.snap, result);

    // Script output is in the canvas …
    const crumbs = doc.querySelector('.a-hero__copy > nav.crumbs')!;
    expect(crumbs).toBeTruthy();
    expect(crumbs.textContent).toContain('/stay'); // scripts see the page path
    expect(doc.querySelector('.a-faq .faq-list')?.getAttribute('data-atrium-for')).toBe('tabs');
    expect(doc.querySelector('.faq-list')?.textContent).toBe('Q1');
    expect(tabs.hasAttribute('hidden')).toBe(true);
    expect(doc.querySelector('.frame > figure.a-image')).toBeTruthy();
    expect(doc.body.lastElementChild?.id).toBe('wa'); // <body> looked React-owned (hydrated)
    expect(doc.documentElement.classList.contains('has-js')).toBe(true);
    expect(doc.querySelector('main')?.classList.contains('in-editor')).toBe(true);
    expect([...doc.head.querySelectorAll('style')].some((s) => s.textContent === '.crumbs{display:flex}')).toBe(true);
    // … React's own nodes are kept (same objects), text is changed in place …
    expect(doc.querySelector('h1')).toBe(hero);
    expect(doc.querySelector('.a-tag')!.firstChild).toBe(tagText);
    expect(tagText.textContent).toBe('Seed');
    // … and nothing active survives.
    expect(crumbs.querySelector('[onclick]')).toBeNull();
    expect(crumbs.querySelector('iframe')).toBeNull();
    expect(crumbs.querySelectorAll('a')[1]!.hasAttribute('href')).toBe(false);

    const undo = undoMirror(log);
    expect(undo.uncertain).toBe(false);
    expect(doc.documentElement.outerHTML).toBe(clean);
    expect(doc.querySelector('.a-tag')!.firstChild).toBe(tagText);
  });

  it('snapshots the clean page while a mirror is applied, so the next run starts from React’s DOM', async () => {
    const first = payloadFor(doc, null, SCRIPTS);
    const log = applyMirror(first.c.snap, await runInSandbox(first.payload));
    const again = payloadFor(doc, log, SCRIPTS);
    expect(again.payload.body).toEqual(first.payload.body);
    expect(again.payload.html).toEqual(first.payload.html);
    expect(again.payload.styles).toEqual(first.payload.styles);
    // A second run replaces the first one cleanly.
    const result = await runInSandbox(again.payload);
    undoMirror(log);
    const log2 = applyMirror(again.c.snap, result);
    expect(doc.querySelectorAll('nav.crumbs')).toHaveLength(1);
    expect(doc.querySelectorAll('#wa')).toHaveLength(1);
    undoMirror(log2);
    expect(doc.documentElement.outerHTML).toBe(clean);
  });

  it('leaves alone what React changed after the mirror was applied', async () => {
    const { c, payload } = payloadFor(doc, null, SCRIPTS);
    const log = applyMirror(c.snap, await runInSandbox(payload));
    // React re-renders: the hero heading text changes, and the split section is removed.
    doc.querySelector('h1')!.firstChild!.nodeValue = 'Hello ';
    doc.querySelector('.a-split')!.remove();
    const undo = undoMirror(log);
    expect(undo.uncertain).toBe(false);
    expect(doc.querySelector('h1')!.textContent).toBe('Hello home');
    expect(doc.querySelector('.a-split')).toBeNull();
    expect(doc.querySelector('nav.crumbs, #wa, .faq-list')).toBeNull();
  });

  it('ignores forged results that point outside the snapshot or carry active content', () => {
    const { c } = payloadFor(doc, null, []);
    const log = applyMirror(c.snap, {
      ops: [
        { k: 9999, a: { class: 'x' } },
        { k: 2, a: { 'data-node-id': 'evil', onclick: 'x()', id: 'nope', class: 'ok' } },
        { k: 1, c: [{ e: 2 }, { n: 'script', a: [], c: ['alert(1)'] }, { n: 'img', a: [['src', 'javascript:alert(1)'], ['onerror', 'x()'], ['alt', 'a']] }, { n: 'svg', ns: 's', c: [{ n: 'use', ns: 's', a: [['href', 'https://evil.example/x.svg#a']] }] }] },
      ],
      head: [{ n: 'link', a: [['rel', 'stylesheet'], ['href', 'http://insecure.example/a.css']] }, { n: 'meta', a: [['http-equiv', 'refresh']] }],
    });
    const root = doc.getElementById('atrium-canvas-root')!;
    expect(root.getAttribute('data-node-id')).toBeNull();
    expect(root.getAttribute('onclick')).toBeNull();
    expect(root.id).toBe('atrium-canvas-root');
    expect(root.className).toBe('ok');
    expect(doc.body.querySelector('script')).toBeNull();
    const img = doc.body.querySelector('img:not([src^="https"])')!;
    expect(img.hasAttribute('src')).toBe(false);
    expect(img.hasAttribute('onerror')).toBe(false);
    expect(doc.body.querySelector('use')!.hasAttribute('href')).toBe(false);
    expect(doc.head.querySelector('link, meta')).toBeNull();
    undoMirror(log);
    expect(doc.documentElement.outerHTML).toBe(clean);
  });

  it('allows ordinary URLs and image data, rejects script URLs', () => {
    expect(safeAttribute('a', 'href', '/booking', false)).toBe(true);
    expect(safeAttribute('a', 'href', 'https://wa.me/1', false)).toBe(true);
    expect(safeAttribute('a', 'href', ' jav\tascript:alert(1)', false)).toBe(false);
    expect(safeAttribute('a', 'href', 'data:text/html,<script>', false)).toBe(false);
    expect(safeAttribute('img', 'src', 'data:image/png;base64,AAAA', false)).toBe(true);
    expect(safeAttribute('img', 'srcset', 'https://a/1.jpg 1x, javascript:x 2x', false)).toBe(false);
    expect(safeAttribute('div', 'style', 'background:url(javascript:alert(1))', false)).toBe(false);
    expect(safeAttribute('div', 'data-atrium-for', 'n1', false)).toBe(true);
    expect(safeAttribute('div', 'data-atrium-editing', '', false)).toBe(false);
    // Copies made by scripts are never inline-editable (the edit would land on the wrong node).
    expect(safeAttribute('span', 'data-edit-prop', 'heading', false)).toBe(false);
    expect(safeAttribute('div', 'data-node-id', 'n1', false)).toBe(true);
    expect(safeAttribute('div', 'data-node-id', 'n1', true)).toBe(false);
  });
});
