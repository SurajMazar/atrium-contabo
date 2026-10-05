import { z } from 'zod';
import { responsive } from './responsive';
import { isSafeCssColor, isSafeCssValue, sanitizeUrl } from './security';

/**
 * Style values are CSS strings. Design tokens are referenced with `@group.key`
 * (e.g. `@color.primary`, `@space.8`, `@radius.md`, `@font.heading`, `@text.xl`)
 * and compile to CSS custom properties, so global theme changes propagate.
 *
 * Every string value must satisfy `isSafeCssValue` (no `< > { } ; \ :`, no url()/expression(),
 * balanced quotes/parens): values are compiled into `<style>` elements on public sites and in
 * the builder canvas. `StyleSchema` (stored data, imports, AI output) silently drops unsafe
 * values; `StrictStyleSchema` (builder operations, API inputs) rejects them.
 */
const UNSAFE_CSS = 'Unsafe CSS value (characters like < > { } ; \\ : and url()/expression() are not allowed)';

function cssValue(strict: boolean) {
  const base = z.string().max(500);
  return strict ? base.refine((v) => isSafeCssValue(v), UNSAFE_CSS) : base.transform((v) => (isSafeCssValue(v) ? v : undefined));
}

function cssOrNumber(strict: boolean) {
  return z.union([z.number(), cssValue(strict)]);
}

function makeBackgroundImageSchema(strict: boolean) {
  const src = strict
    ? z.string().max(2000).refine((v) => sanitizeUrl(v, 'media') !== undefined, 'Unsafe image URL')
    : z.string().max(2000).transform((v) => sanitizeUrl(v, 'media') ?? '');
  const overlay = strict
    ? z.string().max(120).refine((v) => isSafeCssColor(v), 'Unsafe overlay color')
    : z.string().max(120).transform((v) => (isSafeCssColor(v) ? v : undefined));
  const position = strict
    ? z.string().max(60).refine((v) => isSafeCssValue(v, 60), UNSAFE_CSS)
    : z.string().max(60).transform((v) => (isSafeCssValue(v, 60) ? v : undefined));
  return z.object({
    src,
    mediaId: z.string().optional(),
    position: position.optional(),
    size: z.enum(['cover', 'contain', 'auto']).optional(),
    attachment: z.enum(['scroll', 'fixed']).optional(),
    overlay: overlay.optional(),
    overlayOpacity: z.number().min(0).max(1).optional(),
  });
}

function makeStyleSchema(strict: boolean) {
  const css = cssValue(strict);
  const num = z.number();
  return z
    .object({
      // spacing
      padding: responsive(css),
      margin: responsive(css),
      gap: responsive(css),
      // sizing
      width: responsive(css),
      maxWidth: responsive(css),
      minHeight: responsive(css),
      height: responsive(css),
      aspectRatio: responsive(css),
      // layout
      display: responsive(z.enum(['block', 'flex', 'grid', 'inline-flex', 'none'])),
      flexDirection: responsive(z.enum(['row', 'column', 'row-reverse', 'column-reverse'])),
      flexWrap: responsive(z.enum(['wrap', 'nowrap'])),
      alignItems: responsive(z.enum(['start', 'center', 'end', 'stretch', 'baseline'])),
      justifyContent: responsive(z.enum(['start', 'center', 'end', 'between', 'around', 'evenly'])),
      gridColumns: responsive(z.number().int().min(1).max(12)),
      textAlign: responsive(z.enum(['left', 'center', 'right', 'justify'])),
      order: responsive(num),
      // appearance
      background: responsive(css),
      backgroundImage: makeBackgroundImageSchema(strict).optional(),
      color: responsive(css),
      borderRadius: responsive(css),
      border: responsive(css),
      boxShadow: responsive(css),
      opacity: responsive(z.number().min(0).max(1)),
      // typography
      fontFamily: responsive(css),
      fontSize: responsive(css),
      fontWeight: responsive(cssOrNumber(strict)),
      lineHeight: responsive(cssOrNumber(strict)),
      letterSpacing: responsive(css),
      textTransform: responsive(z.enum(['none', 'uppercase', 'lowercase', 'capitalize'])),
      // positioning
      position: responsive(z.enum(['static', 'relative', 'absolute', 'sticky', 'fixed'])),
      inset: responsive(css),
      zIndex: responsive(z.number().int()),
      overflow: responsive(z.enum(['visible', 'hidden', 'clip', 'auto'])),
    })
    .partial();
}

export const BackgroundImageSchema = makeBackgroundImageSchema(false);
/** Sanitizing style schema: unsafe values are dropped (never throws on legacy data). */
export const StyleSchema = makeStyleSchema(false);
/** Rejecting style schema for inputs (builder operations, API bodies). */
export const StrictStyleSchema = makeStyleSchema(true);

/** Every style key a node may carry. */
export const STYLE_KEYS = Object.keys(StyleSchema.shape) as Array<keyof StyleProps>;

export type StyleProps = z.infer<typeof StyleSchema>;
export type BackgroundImage = z.infer<typeof BackgroundImageSchema>;
