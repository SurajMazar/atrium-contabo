import { describe, expect, it } from 'vitest';
import {
  EMBED_IFRAME_HOSTS, FormDefinitionSchema, LinkSchema, MediaRefSchema, NodeInputSchema, NodeSchema, RedirectSchema, SiteSettingsSchema, StrictStyleSchema,
  StrictThemeTokensSchema, StyleSchema, ThemeTokensSchema, escapeCssForHtml, evaluateCondition, isAllowedIframeHost, isSafeCssColor, isSafeCssValue,
  isSafeNodeId, isSafeRegexPattern, isSafeUrl, resolveLink, safeHref, sanitizeThemeTokens, sanitizeUrl, themeTokenIssues, toSafeNodeId, validateSubmission,
  type ThemeTokensInput,
} from './index';

const C = (n: number) => String.fromCharCode(n);

describe('SafeUrl matrix', () => {
  const unsafeLinks = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    `${C(1)}${C(31)}javascript:alert(1)`,
    `java${C(0)}script:alert(1)`,
    'jav&#x09;ascript:alert(1)',
    '&#106;avascript:alert(1)',
    'javascript&colon;alert(1)',
    `java${C(0x200b)}script:alert(1)`,
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    'livescript:x',
  ];
  it.each(unsafeLinks)('rejects %j as a link', (u) => {
    expect(isSafeUrl(u, 'link')).toBe(false);
    expect(isSafeUrl(u, 'media')).toBe(false);
    expect(safeHref(u)).toBeUndefined();
  });

  it.each(['https://example.com/x?y=1#z', 'http://example.com', '/path', './rel', '../up', '?q=1', '#section', 'rooms/suite', 'mailto:hi@example.com', 'tel:+9771234', 'sms:+1555', '', '{{item.url}}'])(
    'accepts %j as a link',
    (u) => expect(isSafeUrl(u, 'link')).toBe(true),
  );

  it('allows data:image only for media', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(isSafeUrl(png, 'media')).toBe(true);
    expect(isSafeUrl('data:image/jpeg;base64,xx', 'media')).toBe(true);
    expect(isSafeUrl('data:image/webp;base64,xx', 'media')).toBe(true);
    expect(isSafeUrl('data:image/gif;base64,xx', 'media')).toBe(true);
    expect(isSafeUrl(png, 'link')).toBe(false);
    expect(isSafeUrl('data:image/svg+xml,<svg onload=alert(1)>', 'media')).toBe(false);
    expect(isSafeUrl('data:text/html,x', 'media')).toBe(false);
  });

  it('https policy is absolute https only; font allows same-origin paths', () => {
    expect(isSafeUrl('https://cdn.example.com/a.js', 'https')).toBe(true);
    expect(isSafeUrl('http://cdn.example.com/a.js', 'https')).toBe(false);
    expect(isSafeUrl('/a.js', 'https')).toBe(false);
    expect(isSafeUrl('//evil.com/a.js', 'https')).toBe(false);
    expect(isSafeUrl('/fonts/x.woff2', 'font')).toBe(true);
    expect(isSafeUrl('//evil.com/x.woff2', 'font')).toBe(false);
    expect(isSafeUrl('https://fonts.example.com/x.woff2', 'font')).toBe(true);
    expect(isSafeUrl('https://x.com/a.woff2") ; } </style><script>', 'font')).toBe(false);
  });

  it('navigation policy rejects mailto/javascript', () => {
    expect(isSafeUrl('https://x.com', 'navigation')).toBe(true);
    expect(isSafeUrl('/thanks', 'navigation')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)', 'navigation')).toBe(false);
  });

  it('trims what browsers trim', () => {
    expect(sanitizeUrl('  https://x.com/a\tb  ')).toBe('https://x.com/ab');
  });
});

describe('URL schemas sanitize stored data instead of throwing', () => {
  it('links', () => {
    expect(LinkSchema.parse('javascript:alert(1)')).toBe('#');
    expect(LinkSchema.parse({ type: 'url', href: 'JaVaScRiPt:alert(1)' })).toEqual({ type: 'url', href: '#' });
    expect(LinkSchema.parse('/rooms')).toBe('/rooms');
  });
  it('media', () => {
    expect(MediaRefSchema.parse({ src: 'javascript:alert(1)', poster: 'vbscript:x' })).toEqual({ src: '' });
    expect(MediaRefSchema.parse({ src: 'https://images.example.com/a.jpg' }).src).toBe('https://images.example.com/a.jpg');
  });
  it('redirects, scripts, social, policy url', () => {
    expect(RedirectSchema.parse({ id: 'r', source: '/a', destination: 'javascript:alert(1)' }).destination).toBe('/');
    const settings = SiteSettingsSchema.parse({
      name: 'x', business: { name: 'x', mapsUrl: 'javascript:alert(1)' }, seo: { siteTitle: 'x', canonicalBase: 'javascript:x' },
      social: [{ id: 's', network: 'x', url: 'javascript:alert(1)' }],
      scripts: [{ id: 'a', name: 'a', placement: 'head', src: 'http://insecure.example.com/a.js' }],
      cookieConsent: { policyUrl: 'javascript:alert(1)' },
    });
    expect(settings.business.mapsUrl).toBeUndefined();
    expect(settings.social[0]!.url).toBe('#');
    expect(settings.scripts[0]!.src).toBeUndefined();
    expect(settings.cookieConsent.policyUrl).toBeUndefined();
    expect(settings.seo.canonicalBase).toBeUndefined();
  });
  it('form redirect + webhook urls', () => {
    const f = FormDefinitionSchema.parse({
      id: 'f', name: 'F', slug: 'f', fields: [], settings: { redirectUrl: 'javascript:alert(1)' },
      rules: [{ id: 'r', name: 'r', then: [{ type: 'webhook', url: 'ftp://x.com/a' }] }],
    });
    expect(f.settings.redirectUrl).toBeUndefined();
    expect((f.rules[0]!.then[0] as { url?: string }).url).toBeUndefined();
  });
  it('resolveLink re-checks hrefs (templated values resolved after validation)', () => {
    const ctx = { pagePath: () => '/x' };
    expect(resolveLink('javascript:alert(1)' as never, ctx)?.href).toBe('#');
    expect(resolveLink({ type: 'url', href: 'javascript:alert(1)' } as never, ctx)?.href).toBe('#');
    expect(resolveLink({ type: 'url', href: 'https://ok.example' }, ctx)?.href).toBe('https://ok.example');
  });
});

describe('CSS value grammar', () => {
  const breakouts = [
    'red;}</style><script>alert(1)</script>',
    '</STYLE><img src=x onerror=alert(1)>',
    'red} body{display:none',
    'url(https://evil.example/x.png)',
    'expression(alert(1))',
    'red\\3c /style',
    '@import "x"',
    'red /* comment',
    '"unbalanced',
    'calc(1px',
    'javascript:alert(1)',
    'red; color: blue',
  ];
  it.each(breakouts)('rejects %j', (v) => expect(isSafeCssValue(v)).toBe(false));
  it.each(['96px 0', 'clamp(1rem, 2vw + 1rem, 3rem)', 'calc(100% - 2rem)', '@space.8 @space.4', '1px solid @color.border', '"Playfair Display", serif', '0 8px 24px rgb(0 0 0 / .2)', 'linear-gradient(180deg, #000 0%, transparent 100%)', 'color-mix(in srgb, @color.primary 50%, transparent)', '16 / 9', '-0.01em', 'var(--a-space-4)'])(
    'accepts %j',
    (v) => expect(isSafeCssValue(v)).toBe(true),
  );
  it('colors', () => {
    for (const ok of ['#fff', '#A1B2C3', '#a1b2c3d4', 'transparent', 'currentColor', 'rgb(0 0 0 / .5)', 'hsl(20 50% 40%)', 'oklch(70% 0.1 200)', 'color-mix(in srgb, red 20%, blue)', 'var(--brand)', '@color.primary'])
      expect(isSafeCssColor(ok), ok).toBe(true);
    for (const bad of ['red;}</style><script>', 'url(x)', '#fff;', 'rgb(0,0,0', 'expression(1)', 'red}'])
      expect(isSafeCssColor(bad), bad).toBe(false);
  });
  it('escapeCssForHtml never leaves a tag opener', () => {
    const out = escapeCssForHtml('a{content:"</style><script>"}@media (width < 600px){b{c:d}}<!--');
    expect(out).not.toMatch(/<\/style/i);
    expect(out).not.toMatch(/<[a-z!/?]/i);
    expect(out).toContain('(width < 600px)');
  });
});

describe('style schema', () => {
  it('drops unsafe values from stored data (no throw)', () => {
    const s = StyleSchema.parse({
      padding: 'red;}</style><script>alert(1)</script>', margin: { base: '1rem', mobile: '</style>' }, color: '@color.primary',
      fontWeight: '700;}</style>', backgroundImage: { src: 'javascript:alert(1)', position: 'center;}</style>', overlay: 'red;}</style>' },
    });
    expect(s.padding).toBeUndefined();
    expect(s.margin).toEqual({ base: '1rem', mobile: undefined });
    expect(s.color).toBe('@color.primary');
    expect(s.fontWeight).toBeUndefined();
    expect(s.backgroundImage).toEqual({ src: '', position: undefined, overlay: undefined });
  });
  it('strict schema rejects', () => {
    expect(StrictStyleSchema.safeParse({ padding: 'x;}</style>' }).success).toBe(false);
    expect(StrictStyleSchema.safeParse({ padding: '1rem 2rem' }).success).toBe(true);
  });
});

describe('node ids', () => {
  it('createId-style ids are safe', () => {
    expect(isSafeNodeId('abc123def456')).toBe(true);
    expect(isSafeNodeId('pg_abc123')).toBe(true);
    expect(isSafeNodeId('x{}</style>')).toBe(false);
    expect(isSafeNodeId('a'.repeat(65))).toBe(false);
  });
  it('stored nodes with unsafe ids get a stable safe id; inputs get re-assigned', () => {
    const n = NodeSchema.parse({ id: 'x{color:red}</style><script>', type: 'heading', props: {} });
    expect(isSafeNodeId(n.id)).toBe(true);
    expect(n.id).toBe(toSafeNodeId('x{color:red}</style><script>'));
    expect(NodeInputSchema.parse({ id: 'bad id!', type: 'heading' }).id).toBeUndefined();
    expect(NodeInputSchema.parse({ id: 'good_id-1', type: 'heading' }).id).toBe('good_id-1');
  });
});

const baseTheme = (): ThemeTokensInput => ({
  colors: { primary: '#111111', primaryContrast: '#ffffff', secondary: '#222222', accent: '#333333', background: '#ffffff', surface: '#fafafa', surfaceAlt: '#f0f0f0', text: '#111111', muted: '#666666', border: '#dddddd', inverse: '#111111', inverseText: '#ffffff', success: '#0a0', warning: '#aa0', danger: '#a00' },
  typography: { heading: { family: 'Playfair Display' }, body: { family: 'Inter' } },
  spacing: {},
  radius: { sm: '4px', md: '8px', lg: '12px', xl: '20px' },
  shadows: { sm: 'none', md: '0 6px 20px -8px rgb(0 0 0 / 0.18)', lg: 'none' },
  borders: {},
  containerWidths: { narrow: '46rem', default: '76rem', wide: '90rem' },
});

describe('theme tokens', () => {
  it('legacy data with an invalid color parses (falls back) instead of throwing', () => {
    const t = baseTheme();
    (t.colors as Record<string, string>).primary = 'red;}</style><script>alert(1)</script>';
    (t.colors as Record<string, string>)['bad key}'] = '#fff';
    (t.colors as Record<string, string>).brand = 'expression(alert(1))';
    t.radius.md = '8px;}</style>';
    t.shadows.xl = '0 0 1px red;}</style>';
    t.typography.heading = { family: 'X";}</style><script>', fallback: 'serif;}</style>', source: 'custom', files: [{ url: 'javascript:alert(1)', weight: '400;}' }, { url: '/fonts/x.woff2', weight: 700, format: 'woff2") </style>' }] };
    const parsed = ThemeTokensSchema.parse(t);
    expect(parsed.colors.primary).toBe('#1f2937');
    expect(parsed.colors).not.toHaveProperty('bad key}');
    expect(parsed.colors).not.toHaveProperty('brand');
    expect(parsed.radius.md).toBe('8px');
    expect(parsed.shadows).not.toHaveProperty('xl');
    expect(parsed.typography.heading.family).toBe('system-ui');
    expect(parsed.typography.heading.fallback).toBe('system-ui, sans-serif');
    expect(parsed.typography.heading.files).toEqual([{ url: '/fonts/x.woff2', weight: 700, style: 'normal' }]);
    expect(themeTokenIssues(parsed)).toEqual([]);
    expect(JSON.stringify(parsed)).not.toMatch(/<\/style/i);
  });
  it('strict schema reports issues', () => {
    const t = baseTheme();
    (t.colors as Record<string, string>).primary = 'red;}</style>';
    const r = StrictThemeTokensSchema.safeParse(t);
    expect(r.success).toBe(false);
    expect(StrictThemeTokensSchema.safeParse(baseTheme()).success).toBe(true);
  });
  it('sanitizeThemeTokens does not mutate its input', () => {
    const parsed = ThemeTokensSchema.parse(baseTheme());
    const evil = { ...parsed, colors: { ...parsed.colors, primary: '</style>' } };
    expect(sanitizeThemeTokens(evil).colors.primary).toBe('#1f2937');
    expect(evil.colors.primary).toBe('</style>');
  });
});

describe('ReDoS guards', () => {
  it.each(['(a+)+$', '(a*)*b', '(\\w+\\s?)*$', '(a|aa)+$', '(.*a){12}', '((a+)b)*', '(x)\\1', 'a'.repeat(201), '([a-z]+)*@'])('rejects %j', (p) => expect(isSafeRegexPattern(p)).toBe(false));
  it.each(['^[A-Z]{2}\\d{4}$', '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', '^(?:\\+?\\d{1,3})?[ -]?\\d{6,12}$', '^(com|net|org)$', '^\\d{5}(-\\d{4})?$'])('accepts %j', (p) => expect(isSafeRegexPattern(p)).toBe(true));
  it('stored forms drop unsafe patterns', () => {
    const f = FormDefinitionSchema.parse({ id: 'f', name: 'F', slug: 'f', fields: [{ id: '1', type: 'text', name: 'a', label: 'A', validation: { pattern: '(a+)+$' } }] });
    expect(f.fields[0]!.validation?.pattern).toBeUndefined();
  });
  it('submission validation never runs unsafe patterns and bounds tested input', () => {
    const fields = [{ id: '1', type: 'text' as const, name: 'a', label: 'A', required: false, width: 'full' as const, validation: { pattern: '(a+)+$' } }];
    const t0 = Date.now();
    validateSubmission({ fields }, { a: `${'a'.repeat(40)}!` });
    expect(Date.now() - t0).toBeLessThan(200);
    const safe = [{ ...fields[0]!, validation: { pattern: '^a+$' } }];
    expect(validateSubmission({ fields: safe }, { a: 'a'.repeat(2000) }).valid).toBe(false);
    expect(validateSubmission({ fields: safe }, { a: 'aaa' }).valid).toBe(true);
  });
  it('rule "matches" conditions are guarded', () => {
    const t0 = Date.now();
    expect(evaluateCondition({ field: 'x', op: 'matches', value: '(a+)+$' }, { x: `${'a'.repeat(40)}!` })).toBe(false);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(evaluateCondition({ field: 'x', op: 'matches', value: '^ab' }, { x: 'abc' })).toBe(true);
  });
});

describe('submission bounds and file descriptors', () => {
  const fields = [
    { id: '1', type: 'text' as const, name: 'name', label: 'Name', required: true, width: 'full' as const },
    { id: '2', type: 'file' as const, name: 'cv', label: 'CV', required: true, width: 'full' as const, validation: { maxFiles: 2 } },
    { id: '3', type: 'multiselect' as const, name: 'tags', label: 'Tags', required: false, width: 'full' as const, options: [{ label: 'A', value: 'a' }] },
  ];
  const good = { key: 'private/submissions/w1/2026/abc-cv.pdf', filename: 'cv.pdf', size: 123, mimeType: 'application/pdf' };
  it('accepts only server-generated descriptors and strips extra props', () => {
    const r = validateSubmission({ fields }, { name: 'A', cv: [{ ...good, url: 'javascript:alert(1)' }] }, { fileKeyPrefix: 'private/submissions/w1/' });
    expect(r.valid).toBe(true);
    expect(r.values.cv).toEqual([good]);
  });
  it('rejects visitor-supplied urls / foreign keys / strings', () => {
    expect(validateSubmission({ fields }, { name: 'A', cv: [{ url: 'https://evil.example/x' }] }).valid).toBe(false);
    expect(validateSubmission({ fields }, { name: 'A', cv: 'cv.pdf' }).valid).toBe(false);
    expect(validateSubmission({ fields }, { name: 'A', cv: [{ ...good, key: 'private/submissions/other/x.pdf' }] }, { fileKeyPrefix: 'private/submissions/w1/' }).valid).toBe(false);
    expect(validateSubmission({ fields }, { name: 'A', cv: [{ ...good, key: '../../etc/passwd' }] }).valid).toBe(false);
    expect(validateSubmission({ fields }, { name: 'A', cv: [good, good, good] }).valid).toBe(false);
  });
  it('client mode accepts the file-name display string', () => {
    expect(validateSubmission({ fields }, { name: 'A', cv: 'cv.pdf' }, { mode: 'client' }).valid).toBe(true);
  });
  it('bounds strings, arrays and rejects objects', () => {
    expect(validateSubmission({ fields }, { name: 'x'.repeat(10_001), cv: [good] }).valid).toBe(false);
    expect(validateSubmission({ fields }, { name: { toString: 'x' }, cv: [good] }).valid).toBe(false);
    expect(validateSubmission({ fields }, { name: 'A', cv: [good], tags: Array.from({ length: 101 }, () => 'a') }).valid).toBe(false);
  });
});

describe('iframe allowlist', () => {
  it('matches exact https hosts only', () => {
    expect(EMBED_IFRAME_HOSTS).toContain('www.youtube-nocookie.com');
    expect(isAllowedIframeHost('https://www.youtube.com/embed/x')).toBe(true);
    expect(isAllowedIframeHost('http://www.youtube.com/embed/x')).toBe(false);
    expect(isAllowedIframeHost('https://www.youtube.com.evil.com/x')).toBe(false);
    expect(isAllowedIframeHost('https://user:pw@www.youtube.com/x')).toBe(false);
    expect(isAllowedIframeHost('https://evil.example/x')).toBe(false);
  });
});
