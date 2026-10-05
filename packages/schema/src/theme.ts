import { z } from 'zod';
import { MotionIntensitySchema } from './animation';

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

export const ThemeTokensSchema = z.object({
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
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;
export type ThemeTokensInput = z.input<typeof ThemeTokensSchema>;
