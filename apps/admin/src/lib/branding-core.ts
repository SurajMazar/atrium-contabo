import { DEFAULT_ADMIN_BRANDING, type AdminBranding } from '@atrium/schema';

/**
 * Pure helpers for white-label admin branding: colour maths (contrast, accent
 * foregrounds, dark-mode accents), the CSS that overrides the accent tokens,
 * and the small cache the pre-hydration script reads to avoid a flash of the
 * default brand.
 */

export const BRANDING_CACHE_KEY = 'atrium.branding';
export const DEFAULT_PRODUCT_NAME = DEFAULT_ADMIN_BRANDING.productName;

const HEX = /^#([0-9a-f]{6})$/i;

export function isHex(v: string | undefined | null): v is string {
  return !!v && HEX.test(v);
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix `a` toward `b` by `t` (0–1) in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const LIGHT_INK = '#ffffff';
const DARK_INK = '#0b0d14';

/** Text colour for content placed on `bg` (white or near-black, whichever reads better). */
export function readableOn(bg: string): string {
  return contrast(bg, LIGHT_INK) >= contrast(bg, DARK_INK) ? LIGHT_INK : DARK_INK;
}

/** A dark-mode accent derived from the light one: lifted toward white until it reads on dark surfaces. */
export function deriveDarkAccent(accent: string): string {
  const surface = PALETTE.dark.surface;
  let out = accent;
  for (let t = 0; t <= 0.7 && contrast(out, surface) < 4.5; t += 0.05) out = mix(accent, '#ffffff', t);
  return out;
}

/** Surfaces the accent is used on, per theme (keep in sync with packages/ui/src/styles.css). */
export const PALETTE = {
  light: { bg: '#f7f7f5', surface: '#ffffff', surface2: '#f3f3f0', surface3: '#ebebe7', border: '#e4e3de', borderStrong: '#d2d1ca', fg: '#1b1b19', fgMuted: '#5c5b55', fgSubtle: '#77766f', seg: '#ecebe7', segOn: '#ffffff', track: '#d6d5ce' },
  dark: { bg: '#0f0f0e', surface: '#181817', surface2: '#20201e', surface3: '#2a2a27', border: '#2c2c29', borderStrong: '#3f3f3b', fg: '#edece8', fgMuted: '#a9a8a1', fgSubtle: '#85847c', seg: '#1f1f1d', segOn: '#33332f', track: '#3a3a36' },
} as const;

export interface AccentPair {
  accent: string;
  accentFg: string;
}

/** Resolved accent + foreground for each theme. */
export function accents(b: AdminBranding): { light: AccentPair; dark: AccentPair } {
  const light = isHex(b.accent) ? b.accent : DEFAULT_ADMIN_BRANDING.accent;
  const customLight = isHex(b.accent) && b.accent.toLowerCase() !== DEFAULT_ADMIN_BRANDING.accent;
  const dark = isHex(b.accentDark) ? b.accentDark : customLight ? deriveDarkAccent(light) : DEFAULT_ADMIN_BRANDING.accentDark;
  return { light: { accent: light, accentFg: readableOn(light) }, dark: { accent: dark, accentFg: readableOn(dark) } };
}

export interface ContrastReport {
  /** Accent used as text/links on the surface colour. */
  text: number;
  /** Button label on an accent background. */
  onAccent: number;
}

export function contrastReport(b: AdminBranding): { light: ContrastReport; dark: ContrastReport } {
  const a = accents(b);
  return {
    light: { text: contrast(a.light.accent, PALETTE.light.surface), onAccent: contrast(a.light.accent, a.light.accentFg) },
    dark: { text: contrast(a.dark.accent, PALETTE.dark.surface), onAccent: contrast(a.dark.accent, a.dark.accentFg) },
  };
}

function isDefaultAccent(b: AdminBranding) {
  const a = (b.accent ?? DEFAULT_ADMIN_BRANDING.accent).toLowerCase();
  const d = (b.accentDark ?? DEFAULT_ADMIN_BRANDING.accentDark).toLowerCase();
  return a === DEFAULT_ADMIN_BRANDING.accent && d === DEFAULT_ADMIN_BRANDING.accentDark;
}

/**
 * CSS overriding the accent tokens. Only --ui-accent / --ui-accent-fg are set;
 * soft, ring, selection and hover-outline derive from them in styles.css via
 * color-mix, so they stay balanced in both themes. Empty for the default brand.
 */
export function brandingCss(b: AdminBranding): string {
  if (isDefaultAccent(b)) return '';
  const a = accents(b);
  return `html:root{--ui-accent:${a.light.accent};--ui-accent-fg:${a.light.accentFg}}html:root[data-theme="dark"]{--ui-accent:${a.dark.accent};--ui-accent-fg:${a.dark.accentFg}}`;
}

/** CSS custom properties for a scoped preview of `b` in `theme` (the tokens are resolved at :root, so a subtree must redeclare the --color-* aliases too). */
export function previewVars(b: AdminBranding, theme: 'light' | 'dark'): Record<string, string> {
  const p = PALETTE[theme];
  const a = accents(b)[theme];
  const soft = `color-mix(in oklab, ${a.accent} ${theme === 'dark' ? 17 : 10}%, ${p.surface})`;
  const ring = `color-mix(in oklab, ${a.accent} ${theme === 'dark' ? 45 : 38}%, transparent)`;
  const vars: Record<string, string> = {
    '--color-bg': p.bg,
    '--color-surface': p.surface,
    '--color-surface-2': p.surface2,
    '--color-surface-3': p.surface3,
    '--color-border': p.border,
    '--color-border-strong': p.borderStrong,
    '--color-fg': p.fg,
    '--color-fg-muted': p.fgMuted,
    '--color-fg-subtle': p.fgSubtle,
    '--color-seg': p.seg,
    '--color-seg-on': p.segOn,
    '--color-track': p.track,
    '--color-accent': a.accent,
    '--color-accent-fg': a.accentFg,
    '--color-accent-soft': soft,
    '--color-ring': ring,
    ...radiusVars(b.radius),
    ...densityVars(b.density),
    colorScheme: theme,
  };
  return vars;
}

const RADII = {
  sharp: { xs: '0px', sm: '1px', md: '2px', lg: '2px', xl: '3px' },
  default: { xs: '3px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
  round: { xs: '4px', sm: '6px', md: '9px', lg: '12px', xl: '18px' },
} as const;

function radiusVars(r: AdminBranding['radius']): Record<string, string> {
  const set = RADII[r ?? 'default'];
  return Object.fromEntries(Object.entries(set).map(([k, v]) => [`--radius-${k}`, v]));
}

function densityVars(d: AdminBranding['density']): Record<string, string> {
  const c = d === 'comfortable';
  return { '--ui-ctl-xs': c ? '1.625rem' : '1.5rem', '--ui-ctl-sm': c ? '2rem' : '1.75rem', '--ui-ctl-md': c ? '2.25rem' : '2rem', '--ui-ctl-lg': c ? '2.5rem' : '2.25rem' };
}

/** What the pre-hydration script needs (kept tiny). */
export interface BrandingCache {
  css: string;
  radius?: string;
  density?: string;
  theme?: string;
  icon?: string;
  name?: string;
  /** Full resolved branding, used as the provider's initial state. */
  b: AdminBranding;
}

export function toCache(b: AdminBranding): BrandingCache {
  return {
    css: brandingCss(b),
    radius: b.radius && b.radius !== 'default' ? b.radius : undefined,
    density: b.density && b.density !== 'compact' ? b.density : undefined,
    theme: b.defaultTheme && b.defaultTheme !== 'system' ? b.defaultTheme : undefined,
    icon: b.iconUrl || undefined,
    name: b.productName && b.productName !== DEFAULT_PRODUCT_NAME ? b.productName : undefined,
    b,
  };
}

/** Drop empty strings / undefined so the API schema (URLs, min lengths) accepts the payload. */
export function compactBranding(b: AdminBranding): AdminBranding {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as AdminBranding;
}

/**
 * Inline <head> script: applies cached branding (accent CSS, radius, density,
 * favicon) and the theme before first paint. Theme precedence: the user's saved
 * preference, then the brand's default theme, then the OS setting.
 */
export const brandingInitScript = `(function(){try{var d=document.documentElement,b=null;try{b=JSON.parse(localStorage.getItem('${BRANDING_CACHE_KEY}')||'null')}catch(e){}if(b){if(b.css){var s=document.createElement('style');s.id='atrium-branding';s.textContent=b.css;document.head.appendChild(s)}if(b.radius)d.dataset.radius=b.radius;if(b.density)d.dataset.density=b.density;if(b.icon){var l=document.createElement('link');l.rel='icon';l.href=b.icon;l.dataset.brand='1';document.head.appendChild(l)}}var t=localStorage.getItem('atrium.theme')||(b&&b.theme)||'system';d.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){}})();`;
