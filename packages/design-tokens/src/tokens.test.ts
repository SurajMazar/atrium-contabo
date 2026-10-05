import { describe, expect, it } from 'vitest';
import { compileNodeCss, googleFontsUrl, resolveTokenRefs, themeToCss, THEME_PRESETS } from './index';

describe('tokens', () => {
  it('resolves token refs', () => {
    expect(resolveTokenRefs('@space.6 @space.12')).toBe('var(--a-space-6) var(--a-space-12)');
    expect(resolveTokenRefs('1px solid @color.border')).toBe('1px solid var(--a-color-border)');
  });
  it('emits theme css and fonts url', () => {
    const t = THEME_PRESETS['editorial-warm']!;
    expect(themeToCss(t)).toContain('--a-color-primary:#2E2A24');
    expect(googleFontsUrl(t)).toContain('family=Cormorant+Garamond:ital,wght@');
  });
});

describe('style compiler', () => {
  it('compiles responsive cascade into media queries', () => {
    const css = compileNodeCss({ id: 'x1', style: { padding: { base: '96px', tablet: '48px', mobile: '20px' }, color: '@color.text' } });
    expect(css).toContain('.a-n-x1{padding:96px;color:var(--a-color-text)}');
    expect(css).toContain('@media (max-width:991px){.a-n-x1{padding:48px}}');
    expect(css).toContain('@media (max-width:767px){.a-n-x1{padding:20px}}');
  });
  it('scopes and sanitizes custom css', () => {
    const css = compileNodeCss({ id: 'y', customCss: '& h2{color:red} @import url(x); </style><script>' });
    expect(css.trim()).toBe('.a-n-y h2{color:red}');
  });
});
