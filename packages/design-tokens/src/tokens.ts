import type { FontDefinition, ThemeTokens } from '@atrium/schema';

/** Prefix for every generated custom property to avoid clashing with customer CSS. */
export const VAR_PREFIX = '--a';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export const cssVar = (group: string, key: string) => `${VAR_PREFIX}-${group}-${kebab(key)}`;

/** Spacing scale steps exposed as `@space.N`. */
export const SPACE_STEPS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48] as const;

/** Type scale steps exposed as `@text.<key>`; value = scale^power. */
export const TEXT_STEPS: Record<string, number> = { xs: -2, sm: -1, base: 0, lg: 1, xl: 2, '2xl': 3, '3xl': 4, '4xl': 5, '5xl': 6, '6xl': 7 };

function fontStack(f: FontDefinition): string {
  const family = /\s/.test(f.family) ? `"${f.family}"` : f.family;
  return f.source === 'system' ? f.fallback : `${family}, ${f.fallback}`;
}

function round(n: number, p = 3) {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}

/**
 * Fluid type: each heading step scales between a mobile size (reduced ratio)
 * and the desktop size, using clamp() so no breakpoint overrides are needed.
 */
export function typeScale(theme: ThemeTokens): Record<string, string> {
  const { baseSize, scale } = theme.typography;
  const mobileScale = 1 + (scale - 1) * 0.72;
  const out: Record<string, string> = {};
  for (const [key, power] of Object.entries(TEXT_STEPS)) {
    const max = baseSize * scale ** power;
    const min = Math.max(baseSize * 0.82, (baseSize - 1) * mobileScale ** power);
    if (power <= 0) {
      out[key] = `${round(max / 16)}rem`;
    } else {
      // interpolate between 375px and 1440px viewports
      const slope = (max - min) / (1440 - 375);
      const intercept = min - slope * 375;
      out[key] = `clamp(${round(min / 16)}rem, ${round(intercept / 16)}rem + ${round(slope * 100, 3)}vw, ${round(max / 16)}rem)`;
    }
  }
  return out;
}

const SECTION_Y = { compact: [56, 40], regular: [112, 64], airy: [160, 80] } as const;

/** Flattened map of CSS custom properties for a theme. */
export function themeToVariables(theme: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.colors)) vars[cssVar('color', k)] = v;
  vars[cssVar('font', 'heading')] = fontStack(theme.typography.heading);
  vars[cssVar('font', 'body')] = fontStack(theme.typography.body);
  vars[cssVar('font', 'accent')] = fontStack(theme.typography.accent ?? theme.typography.heading);
  for (const [k, v] of Object.entries(typeScale(theme))) vars[cssVar('text', k)] = v;
  vars[cssVar('weight', 'heading')] = String(theme.typography.headingWeight);
  vars[cssVar('weight', 'body')] = String(theme.typography.bodyWeight);
  vars[cssVar('leading', 'heading')] = String(theme.typography.headingLineHeight);
  vars[cssVar('leading', 'body')] = String(theme.typography.bodyLineHeight);
  vars[cssVar('tracking', 'heading')] = theme.typography.headingLetterSpacing;
  vars[cssVar('tracking', 'eyebrow')] = theme.typography.eyebrowLetterSpacing;
  vars[cssVar('transform', 'heading')] = theme.typography.headingTransform;
  for (const step of SPACE_STEPS) vars[cssVar('space', String(step).replace('.', '_'))] = `${round((step * theme.spacing.unit) / 16)}rem`;
  const [sy, syMobile] = SECTION_Y[theme.spacing.sectionY];
  vars[cssVar('space', 'section')] = `clamp(${syMobile / 16}rem, ${round(syMobile / 16 + 0.5)}rem + 5vw, ${sy / 16}rem)`;
  for (const [k, v] of Object.entries(theme.radius)) vars[cssVar('radius', k)] = v;
  for (const [k, v] of Object.entries(theme.shadows)) vars[cssVar('shadow', k)] = v;
  vars[cssVar('border', 'width')] = theme.borders.width;
  for (const [k, v] of Object.entries(theme.containerWidths)) vars[cssVar('container', k)] = v;
  vars[cssVar('button', 'radius')] = theme.buttons.radius ?? theme.radius.sm;
  vars[cssVar('button', 'transform')] = theme.buttons.textTransform;
  vars[cssVar('button', 'tracking')] = theme.buttons.letterSpacing;
  vars[cssVar('button', 'py')] = theme.buttons.paddingY;
  vars[cssVar('button', 'px')] = theme.buttons.paddingX;
  vars[cssVar('button', 'weight')] = String(theme.buttons.weight);
  vars[cssVar('motion', 'duration')] = `${theme.motion.duration}s`;
  return vars;
}

export function themeToCss(theme: ThemeTokens, selector = ':root'): string {
  const body = Object.entries(themeToVariables(theme))
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return `${selector}{${body}color-scheme:${theme.colorScheme};}`;
}

const TOKEN_REF = /@(color|space|radius|shadow|font|text|container|weight|leading|tracking)\.([a-zA-Z0-9_.-]+)/g;

/** Replace `@group.key` references in a CSS value with `var(--a-group-key)`. */
export function resolveTokenRefs(value: string): string {
  return value.replace(TOKEN_REF, (_, group: string, key: string) => `var(${cssVar(group, key.replace('.', '_'))})`);
}

/** Google Fonts CSS2 URL for the theme fonts (display=swap). */
export function googleFontsUrl(theme: ThemeTokens): string | null {
  const fonts = [theme.typography.heading, theme.typography.body, theme.typography.accent].filter(
    (f): f is FontDefinition => !!f && f.source === 'google',
  );
  const unique = new Map<string, FontDefinition>();
  for (const f of fonts) {
    const prev = unique.get(f.family);
    unique.set(f.family, prev ? { ...f, weights: [...new Set([...prev.weights, ...f.weights])], italic: prev.italic || f.italic } : f);
  }
  if (unique.size === 0) return null;
  const families = [...unique.values()].map((f) => {
    const weights = [...new Set(f.weights)].sort((a, b) => a - b);
    const name = f.family.replace(/ /g, '+');
    if (f.italic) return `family=${name}:ital,wght@${[...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(';')}`;
    return `family=${name}:wght@${weights.join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/** @font-face rules for custom/local uploaded fonts. */
export function customFontFaces(theme: ThemeTokens): string {
  const fonts = [theme.typography.heading, theme.typography.body, theme.typography.accent].filter(
    (f): f is FontDefinition => !!f && (f.source === 'custom' || f.source === 'local') && !!f.files?.length,
  );
  return fonts
    .flatMap((f) =>
      (f.files ?? []).map(
        (file) =>
          `@font-face{font-family:"${f.family}";src:url("${file.url}")${file.format ? ` format("${file.format}")` : ''};font-weight:${file.weight};font-style:${file.style};font-display:swap;}`,
      ),
    )
    .join('');
}
