import { z } from 'zod';
import { MotionIntensitySchema } from './animation';
import { isSafeCssColor, isSafeCssValue, isSafeFontFallback, sanitizeUrl, SAFE_FONT_FAMILY, SAFE_TOKEN_KEY } from './security';

const color = z.string().min(1).max(64);

export const FontDefinitionSchema = z.object({
  family: z.string(),
  source: z.enum(['google', 'local', 'custom', 'system']).default('google'),
  weights: z.array(z.number().int()).default([400, 700]),
  italic: z.boolean().default(false),
  /** For custom/local fonts. */
  files: z.array(z.object({ url: z.string(), weight: z.union([z.number(), z.string()]), style: z.enum(['normal', 'italic']).default('normal'), format: z.string().optional() })).optional(),
  fallback: z.string().default('system-ui, sans-serif'),
  variable: z.boolean().optional(),
});
export type FontDefinition = z.infer<typeof FontDefinitionSchema>;

const ThemeTokensObjectSchema = z.object({
  name: z.string().default('Custom'),
  colorScheme: z.enum(['light', 'dark']).default('light'),
  colors: z
    .object({
      primary: color,
      primaryContrast: color,
      secondary: color,
      accent: color,
      background: color,
      surface: color,
      surfaceAlt: color,
      text: color,
      muted: color,
      border: color,
      inverse: color,
      inverseText: color,
      success: color,
      warning: color,
      danger: color,
    })
    .catchall(color),
  typography: z.object({
    heading: FontDefinitionSchema,
    body: FontDefinitionSchema,
    accent: FontDefinitionSchema.optional(),
    baseSize: z.number().min(12).max(22).default(17),
    /** Modular scale ratio for heading sizes. */
    scale: z.number().min(1.05).max(1.8).default(1.25),
    headingWeight: z.number().int().default(500),
    bodyWeight: z.number().int().default(400),
    headingLineHeight: z.number().default(1.1),
    bodyLineHeight: z.number().default(1.6),
    headingLetterSpacing: z.string().default('-0.01em'),
    headingTransform: z.enum(['none', 'uppercase']).default('none'),
    eyebrowLetterSpacing: z.string().default('0.16em'),
  }),
  /** Base spacing unit in px; scale keys multiply it (`@space.4` = 4 * unit). */
  spacing: z.object({ unit: z.number().default(4), sectionY: z.enum(['compact', 'regular', 'airy']).default('regular') }),
  radius: z.object({ none: z.string().default('0'), sm: z.string(), md: z.string(), lg: z.string(), xl: z.string(), full: z.string().default('9999px') }),
  shadows: z.object({ sm: z.string(), md: z.string(), lg: z.string() }).catchall(z.string()),
  borders: z.object({ width: z.string().default('1px'), style: z.enum(['solid', 'dashed']).default('solid') }),
  containerWidths: z.object({ narrow: z.string(), default: z.string(), wide: z.string(), full: z.string().default('100%') }),
  buttons: z
    .object({
      radius: z.string().optional(),
      textTransform: z.enum(['none', 'uppercase']).default('none'),
      letterSpacing: z.string().default('0'),
      paddingY: z.string().default('0.85em'),
      paddingX: z.string().default('1.6em'),
      weight: z.number().int().default(500),
    })
    .default({ textTransform: 'none', letterSpacing: '0', paddingY: '0.85em', paddingX: '1.6em', weight: 500 }),
  motion: z
    .object({
      intensity: MotionIntensitySchema.default('subtle'),
      ease: z.string().default('power3.out'),
      duration: z.number().default(0.9),
    })
    .default({ intensity: 'subtle', ease: 'power3.out', duration: 0.9 }),
});
type ThemeTokensShape = z.output<typeof ThemeTokensObjectSchema>;

// ---------------------------------------------------------------------------------------------
// Token value grammars (theme values are compiled into <style> as custom properties)
// ---------------------------------------------------------------------------------------------

const FALLBACK_COLORS: Record<string, string> = {
  primary: '#1f2937', primaryContrast: '#ffffff', secondary: '#4b5563', accent: '#b45309', background: '#ffffff', surface: '#f8fafc',
  surfaceAlt: '#f1f5f9', text: '#111827', muted: '#6b7280', border: '#e5e7eb', inverse: '#111827', inverseText: '#ffffff',
  success: '#15803d', warning: '#b45309', danger: '#b91c1c',
};
const FALLBACK_LENGTHS: Record<string, string> = {
  'radius.none': '0', 'radius.sm': '4px', 'radius.md': '8px', 'radius.lg': '16px', 'radius.xl': '24px', 'radius.full': '9999px',
  'containerWidths.narrow': '46rem', 'containerWidths.default': '76rem', 'containerWidths.wide': '90rem', 'containerWidths.full': '100%',
  'borders.width': '1px', 'buttons.letterSpacing': '0', 'buttons.paddingY': '0.85em', 'buttons.paddingX': '1.6em',
  'typography.headingLetterSpacing': '-0.01em', 'typography.eyebrowLetterSpacing': '0.16em',
};
const SAFE_EASE = /^[a-zA-Z0-9.(), -]{1,60}$/;
const SAFE_FONT_FORMAT = /^[a-z0-9-]{1,30}$/i;
const SAFE_FONT_WEIGHT = /^(?:\d{1,4}(?: \d{1,4})?|normal|bold|bolder|lighter)$/;

export interface ThemeTokenIssue {
  path: Array<string | number>;
  message: string;
}

/**
 * Check every theme value that is emitted into CSS. With `fix`, unsafe values on `theme` are
 * replaced in place by safe fallbacks (unknown color/shadow keys with unsafe names are removed).
 */
function checkTheme(theme: ThemeTokensShape, fix: boolean): ThemeTokenIssue[] {
  const issues: ThemeTokenIssue[] = [];
  const report = (path: Array<string | number>, message: string) => issues.push({ path, message });

  const colors = theme.colors as Record<string, string>;
  for (const [k, v] of Object.entries(colors)) {
    if (!SAFE_TOKEN_KEY.test(k)) {
      report(['colors', k], 'Invalid color token name');
      if (fix) delete colors[k];
    } else if (!isSafeCssColor(v)) {
      report(['colors', k], 'Use a hex, rgb(), hsl(), oklch(), color-mix() or var() color');
      if (fix) {
        if (k in FALLBACK_COLORS) colors[k] = FALLBACK_COLORS[k]!;
        else delete colors[k];
      }
    }
  }

  const shadows = theme.shadows as Record<string, string>;
  for (const [k, v] of Object.entries(shadows)) {
    if (!SAFE_TOKEN_KEY.test(k)) {
      report(['shadows', k], 'Invalid shadow token name');
      if (fix) delete shadows[k];
    } else if (!isSafeCssValue(v, 300)) {
      report(['shadows', k], 'Unsafe shadow value');
      if (fix) {
        if (k === 'sm' || k === 'md' || k === 'lg') shadows[k] = 'none';
        else delete shadows[k];
      }
    }
  }

  const lengths: Array<[Record<string, unknown>, string, string]> = [
    ...(['none', 'sm', 'md', 'lg', 'xl', 'full'] as const).map((k) => [theme.radius, k, 'radius'] as [Record<string, unknown>, string, string]),
    ...(['narrow', 'default', 'wide', 'full'] as const).map((k) => [theme.containerWidths, k, 'containerWidths'] as [Record<string, unknown>, string, string]),
    [theme.borders, 'width', 'borders'],
    [theme.buttons, 'radius', 'buttons'],
    [theme.buttons, 'letterSpacing', 'buttons'],
    [theme.buttons, 'paddingY', 'buttons'],
    [theme.buttons, 'paddingX', 'buttons'],
    [theme.typography, 'headingLetterSpacing', 'typography'],
    [theme.typography, 'eyebrowLetterSpacing', 'typography'],
  ];
  for (const [obj, key, group] of lengths) {
    const v = obj[key];
    if (v === undefined) continue;
    if (!isSafeCssValue(v, 120)) {
      report([group, key], 'Unsafe CSS length');
      if (fix) {
        const fb = FALLBACK_LENGTHS[`${group}.${key}`];
        if (fb === undefined) delete obj[key];
        else obj[key] = fb;
      }
    }
  }

  for (const slot of ['heading', 'body', 'accent'] as const) {
    const f = theme.typography[slot];
    if (!f) continue;
    if (!SAFE_FONT_FAMILY.test(f.family)) {
      report(['typography', slot, 'family'], 'Font family may only contain letters, numbers, spaces, - _ . and \'');
      if (fix) {
        f.family = 'system-ui';
        f.source = 'system';
      }
    }
    if (!isSafeFontFallback(f.fallback)) {
      report(['typography', slot, 'fallback'], 'Unsafe font fallback stack');
      if (fix) f.fallback = 'system-ui, sans-serif';
    }
    if (f.files) {
      const kept: NonNullable<FontDefinition['files']> = [];
      f.files.forEach((file, i) => {
        let ok = true;
        if (sanitizeUrl(file.url, 'font') === undefined) {
          report(['typography', slot, 'files', i, 'url'], 'Font files must be https:// or a same-origin /path');
          ok = false;
        }
        if (file.format !== undefined && !SAFE_FONT_FORMAT.test(file.format)) {
          report(['typography', slot, 'files', i, 'format'], 'Invalid font format');
          if (fix) delete file.format;
        }
        if (typeof file.weight === 'number' ? !Number.isInteger(file.weight) || file.weight < 1 || file.weight > 1000 : !SAFE_FONT_WEIGHT.test(file.weight)) {
          report(['typography', slot, 'files', i, 'weight'], 'Invalid font weight');
          if (fix) file.weight = 400;
        }
        if (ok) kept.push(file);
      });
      if (fix) f.files = kept;
    }
  }

  if (!SAFE_EASE.test(theme.motion.ease)) {
    report(['motion', 'ease'], 'Invalid easing');
    if (fix) theme.motion.ease = 'power3.out';
  }
  return issues;
}

/** List unsafe theme values (empty = safe). */
export function themeTokenIssues(theme: ThemeTokens): ThemeTokenIssue[] {
  return checkTheme(structuredCloneSafe(theme), false);
}

/** Return a copy of `theme` with every unsafe value replaced by a safe fallback. */
export function sanitizeThemeTokens<T extends ThemeTokens>(theme: T): T {
  const copy = structuredCloneSafe(theme);
  checkTheme(copy, true);
  return copy;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Sanitizing theme schema: unsafe token values fall back to safe defaults (never throws on legacy data). */
export const ThemeTokensSchema = ThemeTokensObjectSchema.transform((t): ThemeTokensShape => {
  checkTheme(t, true);
  return t;
});
/** Rejecting theme schema for inputs (theme editor saves, builder operations). */
export const StrictThemeTokensSchema = ThemeTokensObjectSchema.superRefine((t, ctx) => {
  for (const issue of checkTheme(structuredCloneSafe(t), false)) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});

export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;
export type ThemeTokensInput = z.input<typeof ThemeTokensSchema>;
