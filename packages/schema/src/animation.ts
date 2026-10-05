import { z } from 'zod';

export const AnimationTriggerSchema = z.enum(['load', 'scroll', 'hover']);

export const AnimationSchema = z.object({
  /** Registered animation preset id, e.g. `fade-up`, `clip-reveal`, `word-reveal`. */
  preset: z.string(),
  duration: z.number().min(0).max(10).optional(),
  delay: z.number().min(0).max(10).optional(),
  ease: z.string().optional(),
  distance: z.number().optional(),
  stagger: z.number().min(0).max(2).optional(),
  trigger: AnimationTriggerSchema.optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  scrub: z.union([z.boolean(), z.number()]).optional(),
  /** Animate direct children individually (stagger) instead of the element. */
  target: z.enum(['self', 'children', 'words', 'chars', 'lines']).optional(),
  once: z.boolean().optional(),
});

export type Animation = z.infer<typeof AnimationSchema>;

export const MotionIntensitySchema = z.enum(['none', 'subtle', 'moderate', 'expressive']);
export type MotionIntensity = z.infer<typeof MotionIntensitySchema>;
