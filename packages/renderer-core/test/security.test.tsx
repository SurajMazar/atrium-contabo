import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Node, PageDocument, WebsiteDefinition } from '@atrium/schema';
import { createRenderContext, getSiteCss, NodeView, sanitizeHtml } from '../src/index';
import { ALink } from '../src/ui/actions';
import { aranya } from './fixtures';

const PAYLOAD = 'red;}</style><script>alert(1)</script>';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const home = (def: WebsiteDefinition) => def.pages.find((p) => p.isHomepage)!;
const html = (def: WebsiteDefinition, node: Node, mode: 'live' | 'editor' = 'live') => {
  const ctx = createRenderContext({ definition: def, mode }, home(def));
  return renderToStaticMarkup(createElement(NodeView, { node, ctx }));
};

describe('site CSS never closes its <style> element', () => {
  it('escapes payloads in style values, theme tokens, node ids and custom CSS (also unvalidated data)', () => {
    const def = clone(aranya);
    (def.theme.colors as Record<string, string>).primary = PAYLOAD;
    def.theme.radius.md = PAYLOAD;
    def.customCss = '</sty</style>le><script>alert(1)</script> a{color:red}';
    const page: PageDocument = clone(home(def));
    page.customCss = '</STYLE><svg onload=alert(1)>';
    page.sections[0] = {
      ...page.sections[0]!,
      id: 'x</style><script>alert(1)</script>',
      style: { padding: PAYLOAD, color: PAYLOAD, backgroundImage: { src: 'https://img.example/a.jpg"</style><script>', overlay: PAYLOAD } },
      customCss: '& h2{color:red} </style><script>alert(1)</script>',
    } as Node;
    def.pages = def.pages.map((p) => (p.id === page.id ? page : p));
    for (const mode of ['live', 'editor'] as const) {
      const ctx = createRenderContext({ definition: def, mode }, page);
      const css = getSiteCss(ctx, page);
      expect(css).not.toMatch(/<\/style/i);
      expect(css).not.toMatch(/<[a-z!/?]/i);
      expect(css).not.toContain('alert(1)</script>');
    }
  });
});

describe('links drop unsafe hrefs at render time', () => {
  const ctx = createRenderContext({ definition: aranya, mode: 'live' }, home(aranya));
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'vbscript:x', 'data:text/html,<script>alert(1)</script>'])('%j', (href) => {
    const out = renderToStaticMarkup(createElement(ALink, { ctx, link: href as never, children: 'x' }));
    expect(out).toBe('<a href="#">x</a>');
    const out2 = renderToStaticMarkup(createElement(ALink, { ctx, link: { type: 'url', href } as never, children: 'x' }));
    expect(out2).toContain('href="#"');
  });
  it('keeps safe links', () => {
    expect(renderToStaticMarkup(createElement(ALink, { ctx, link: 'https://example.com', children: 'x' }))).toContain('href="https://example.com"');
    expect(renderToStaticMarkup(createElement(ALink, { ctx, link: 'mailto:a@b.co', children: 'x' }))).toContain('href="mailto:a@b.co"');
  });
});

describe('embed component', () => {
  const embed = (props: Record<string, unknown>): Node => ({ id: 'e1', type: 'embed', props: { title: 'Widget', aspect: '16:9', ...props } });
  it('allowlisted hosts keep their origin, others get an opaque-origin sandbox', () => {
    const yt = html(aranya, embed({ mode: 'iframe', url: 'https://www.youtube-nocookie.com/embed/abc' }));
    expect(yt).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"');
    const other = html(aranya, embed({ mode: 'iframe', url: 'https://evil.example/page' }));
    expect(other).toContain('src="https://evil.example/page"');
    expect(other).toContain('sandbox="allow-scripts allow-popups allow-forms"');
    expect(other).not.toContain('allow-same-origin');
    expect(html(aranya, embed({ mode: 'iframe', url: 'javascript:alert(1)' }))).not.toContain('<iframe');
    expect(html(aranya, embed({ mode: 'iframe', url: 'http://insecure.example/' }))).not.toContain('<iframe');
  });
  it('never loads live third-party content in the editor canvas', () => {
    for (const props of [{ mode: 'iframe', url: 'https://www.youtube.com/embed/abc' }, { mode: 'iframe', url: 'https://evil.example/' }, { mode: 'html', html: '<iframe src="https://www.youtube.com/embed/x"></iframe><p>hi</p>' }, { mode: 'sandbox', html: '<script>alert(1)</script>' }]) {
      const out = html(aranya, embed(props), 'editor');
      expect(out, JSON.stringify(props)).not.toContain('<iframe');
      expect(out).toContain('a-embed__placeholder');
    }
    expect(html(aranya, embed({ mode: 'iframe', url: 'https://evil.example/x' }), 'editor')).toContain('evil.example');
  });
  it('html mode only keeps allowlisted iframes, never with same-origin for others', () => {
    const out = sanitizeHtml('<iframe src="https://evil.example/x"></iframe><iframe src="https://player.vimeo.com/video/1" sandbox="allow-top-navigation" allow="camera; autoplay"></iframe><iframe src="https://www.youtube.com&#64;evil.example/"></iframe>', { allowIframes: true });
    expect(out).not.toContain('evil.example');
    expect(out).toContain('src="https://player.vimeo.com/video/1"');
    expect(out).not.toContain('allow-top-navigation');
    expect(out).toContain('allow="autoplay"');
    expect(sanitizeHtml('<iframe src="https://www.youtube.com/embed/x"></iframe>')).toBe('');
  });
});

describe('rich text sanitizer URLs', () => {
  it('rejects obfuscated script URLs', () => {
    for (const href of ['javascript:alert(1)', 'jav&#x09;ascript:alert(1)', '&#106;avascript:alert(1)', 'java&Tab;script:alert(1)', 'vbscript:x', 'data:text/html,x'])
      expect(sanitizeHtml(`<a href="${href}">x</a>`), href).toBe('<a>x</a>');
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="">')).toContain('src="data:image/png;base64,AAAA"');
    expect(sanitizeHtml('<a href="data:image/png;base64,AAAA">x</a>')).toBe('<a>x</a>');
  });
});
