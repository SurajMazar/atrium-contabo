import { ThemeTokensSchema, type Node, type ThemeTokens } from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { compileNodeCss, compileTreeCss, customFontFaces, nodeClass, sanitizeCss, themeToCss, THEME_PRESETS } from './index';

const noBreakout = (css: string) => {
  expect(css).not.toMatch(/<\/style/i);
  expect(css).not.toContain('<');
};

const PAYLOAD = 'red;}</style><script>alert(1)</script>';

describe('style values cannot break out of <style>', () => {
  it('drops unsafe values even when the node was never validated', () => {
    const node = {
      id: 'n1',
      style: {
        padding: PAYLOAD,
        margin: { base: '1rem', mobile: '</STYLE><img src=x onerror=alert(1)>' },
        color: 'red} body{display:none',
        background: 'url(https://evil.example/x)',
        fontWeight: '700;}</style>',
        gridColumns: '3);}</style><script>' as unknown as number,
        backgroundImage: { src: 'https://img.example/a.jpg");}</style><script>', position: 'center;}</style>', overlay: 'red;}</style>', size: 'cover;}' as 'cover' },
      },
    } as unknown as Node;
    const css = compileNodeCss(node, { scope: '.atrium-site' });
    noBreakout(css);
    expect(css).toContain('margin:1rem');
    expect(css).not.toContain('display:none');
    expect(css).not.toContain('evil.example');
    expect(css).toContain('background-position:center;');
    expect(css).toContain('background-size:cover');
  });
  it('escapes background image urls as CSS strings', () => {
    const css = compileNodeCss({ id: 'n2', style: { backgroundImage: { src: '/a b"c.jpg' } } } as Node);
    expect(css).toContain('url("/a b\\22 c.jpg")');
    expect(compileNodeCss({ id: 'n3', style: { backgroundImage: { src: 'javascript:alert(1)' } } } as Node)).not.toContain('url(');
  });
  it('node ids are re-mapped into a safe class name', () => {
    const id = 'x{}</style><script>alert(1)</script>';
    const css = compileTreeCss([{ id, type: 'heading', props: {}, style: { color: 'red' } } as Node]);
    noBreakout(css);
    expect(css.startsWith(`.${nodeClass(id)}{`)).toBe(true);
    expect(nodeClass(id)).toMatch(/^a-n-[A-Za-z0-9_-]+$/);
    expect(nodeClass('abc123')).toBe('a-n-abc123');
  });
});

describe('theme tokens cannot break out of <style>', () => {
  it('sanitizes colors, radius, shadows, fonts and custom keys', () => {
    const base = THEME_PRESETS['editorial-warm']!;
    const evil = JSON.parse(JSON.stringify(base)) as ThemeTokens;
    (evil.colors as Record<string, string>).primary = PAYLOAD;
    (evil.colors as Record<string, string>)['x}</style><script>'] = '#fff';
    evil.radius.md = PAYLOAD;
    (evil.shadows as Record<string, string>).huge = PAYLOAD;
    evil.typography.heading = { ...evil.typography.heading, family: 'X"</style><script>', fallback: 'serif;}</style>' };
    evil.typography.headingLetterSpacing = PAYLOAD;
    const css = themeToCss(evil, '.atrium-site');
    noBreakout(css);
    expect(css).toContain('--a-color-primary:#1f2937');
    expect(css).not.toContain('</');
  });
  it('custom font faces only use https/same-origin urls and safe formats', () => {
    const theme = ThemeTokensSchema.parse({
      ...THEME_PRESETS['editorial-warm'],
      typography: {
        ...THEME_PRESETS['editorial-warm']!.typography,
        heading: { family: 'Brand', source: 'custom', files: [{ url: '/fonts/brand.woff2', weight: 400, format: 'woff2' }, { url: 'javascript:alert(1)', weight: 700 }] },
      },
    });
    const unsafe = JSON.parse(JSON.stringify(theme)) as ThemeTokens;
    unsafe.typography.heading.files = [{ url: 'https://f.example/a.woff2");}</style><script>', weight: '400;}</style>', style: 'normal', format: 'woff2")}</style>' }];
    const css = customFontFaces(theme) + customFontFaces(unsafe);
    noBreakout(css);
    expect(customFontFaces(theme)).toBe('@font-face{font-family:"Brand";src:url("/fonts/brand.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap;}');
  });
});

describe('custom CSS sanitizer', () => {
  const cases: Array<[string, string]> = [
    ['nested style tag', '</sty</style>le><script>alert(1)</script>'],
    ['nested script', '<scr<script>ipt>alert(1)</scr</script>ipt>'],
    ['uppercase', '</STYLE ><SCRIPT>alert(1)</SCRIPT>'],
    ['in string', 'a{content:"</style><script>alert(1)</script>"}'],
    ['comment split', '</sty/**/le>'],
  ];
  it.each(cases)('%s', (_name, input) => noBreakout(sanitizeCss(input)));

  it('neutralizes imports, expressions, bindings and script urls (also nested/escaped)', () => {
    const out = sanitizeCss(
      [
        '@import url(https://evil.example/x.css);',
        '@im@importport "x.css";',
        '@\\69mport "y.css";',
        'a{width:expression(alert(1))}',
        'a{width:ex/**/pression(alert(1))}',
        'a{behavior:url(x.htc)}',
        'a{-moz-binding:url(x.xml#x)}',
        'a{background:url(javascript:alert(1))}',
        'a{background:url("JaVaScRiPt:alert(1)")}',
        'a{background:u\\72l(javascript:alert(1))}',
        'a{background:url(data:text/html,x)}',
        'a{background:image-set("x.png" 1x)}',
        'a{background:url("javascript:alert(1)"',
      ].join('\n'),
    ).toLowerCase();
    expect(out).not.toContain('@import');
    expect(out).not.toMatch(/expression\s*\(/);
    expect(out).not.toMatch(/behavior\s*:/);
    expect(out).not.toContain('-moz-binding');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('data:text');
    expect(out).not.toMatch(/(^|[^-])image-set\(/);
    expect(out).not.toMatch(/\burl\((?!")/);
  });

  it('keeps legitimate CSS working', () => {
    const css = '@media (width < 600px){.a{color:red}} .b{background:url(/img/a.png) no-repeat} .c{background:url("https://cdn.example/x.webp")} .d{background-image:url(data:image/png;base64,AAAA)} .e::before{content:"\\201C"}';
    const out = sanitizeCss(css);
    expect(out).toContain('@media (width < 600px){.a{color:red}}');
    expect(out).toContain('url("/img/a.png") no-repeat');
    expect(out).toContain('url("https://cdn.example/x.webp")');
    expect(out).toContain('url("data:image/png;base64,AAAA")');
    expect(out).toContain('content:"\\201C"');
    expect(sanitizeCss(out)).toBe(out);
  });
});
