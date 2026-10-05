import { describe, expect, it } from 'vitest';
import { accents, brandingCss, compactBranding, contrast, contrastReport, deriveDarkAccent, PALETTE, readableOn, toCache } from './branding-core';

describe('branding colour maths', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('picks a readable foreground for accents', () => {
    expect(readableOn('#2b4fd8')).toBe('#ffffff');
    expect(readableOn('#facc15')).not.toBe('#ffffff');
  });

  it('derives a dark-mode accent that reads on dark surfaces', () => {
    const dark = deriveDarkAccent('#1e3a8a');
    expect(contrast(dark, PALETTE.dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the default palette when no accent is customised', () => {
    expect(brandingCss({})).toBe('');
    expect(accents({}).dark.accent).toBe('#6f8cff');
  });

  it('emits light and dark accent overrides', () => {
    const css = brandingCss({ accent: '#0f766e' });
    expect(css).toContain('--ui-accent:#0f766e');
    expect(css).toContain('[data-theme="dark"]');
    const r = contrastReport({ accent: '#0f766e' });
    expect(r.light.onAccent).toBeGreaterThanOrEqual(4.5);
  });
});

describe('branding payloads', () => {
  it('drops empty values so the API schema accepts them', () => {
    expect(compactBranding({ productName: '  ', logoUrl: '', accent: '#123456', hidePoweredBy: false })).toEqual({ accent: '#123456', hidePoweredBy: false });
  });

  it('caches only non-default presentation hints', () => {
    const c = toCache({ productName: 'Atrium', radius: 'default', density: 'comfortable', defaultTheme: 'dark' });
    expect(c.radius).toBeUndefined();
    expect(c.density).toBe('comfortable');
    expect(c.theme).toBe('dark');
    expect(c.name).toBeUndefined();
  });
});
