import { z } from 'zod';
import { responsive } from './responsive';

/**
 * Style values are CSS strings. Design tokens are referenced with `@group.key`
 * (e.g. `@color.primary`, `@space.8`, `@radius.md`, `@font.heading`, `@text.xl`)
 * and compile to CSS custom properties, so global theme changes propagate.
 */
const css = z.string().max(500);
const num = z.number();

export const BackgroundImageSchema = z.object({
  src: z.string(),
  mediaId: z.string().optional(),
  position: z.string().optional(),
  size: z.enum(['cover', 'contain', 'auto']).optional(),
  attachment: z.enum(['scroll', 'fixed']).optional(),
  overlay: z.string().optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
});

export const StyleSchema = z
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
    backgroundImage: BackgroundImageSchema.optional(),
    color: responsive(css),
    borderRadius: responsive(css),
    border: responsive(css),
    boxShadow: responsive(css),
    opacity: responsive(z.number().min(0).max(1)),
    // typography
    fontFamily: responsive(css),
    fontSize: responsive(css),
    fontWeight: responsive(z.union([z.number(), z.string()])),
    lineHeight: responsive(z.union([z.number(), z.string()])),
    letterSpacing: responsive(css),
    textTransform: responsive(z.enum(['none', 'uppercase', 'lowercase', 'capitalize'])),
    // positioning
    position: responsive(z.enum(['static', 'relative', 'absolute', 'sticky', 'fixed'])),
    inset: responsive(css),
    zIndex: responsive(z.number().int()),
    overflow: responsive(z.enum(['visible', 'hidden', 'clip', 'auto'])),
  })
  .partial();

export type StyleProps = z.infer<typeof StyleSchema>;
export type BackgroundImage = z.infer<typeof BackgroundImageSchema>;
