import { LinkSchema } from '@atrium/schema';
import { z } from 'zod';
import { ButtonSchema, align, headingLevel, media } from '../fields';
import type { Control } from '../types';

/**
 * Shared prop fragments + controls for the extended component library.
 * Kept separate from `fields.ts` so the original helpers stay untouched.
 */

export const aspect = z.enum(['auto', '1:1', '4:3', '3:2', '16:9', '21:9', '3:4', '2:3', '4:5']);
export const aspectOptions = aspect.options.map((v) => ({ label: v === 'auto' ? 'Original' : v, value: v }));

export const gapSize = z.enum(['none', 'sm', 'md', 'lg']);
export const columnsProp = (def: number, max = 6) => z.number().int().min(1).max(max).default(def);

/** Optional intro block (eyebrow, heading, supporting text) used by list-style sections. */
export const optionalIntro = {
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(300).optional(),
  headingLevel: headingLevel.default('h2'),
  subheading: z.string().max(1200).optional(),
  align,
};

/** Section-level actions shown under the intro or list. */
export const sectionButtons = { buttons: z.array(ButtonSchema).max(3).default([]) };

export const columnsControl = (max = 6, min = 1): Control => ({ name: 'columns', label: 'Columns', type: 'slider', group: 'layout', min, max, step: 1 });

export const aspectControl = (name = 'aspect', label = 'Aspect ratio'): Control => ({ name, label, type: 'select', group: 'style', options: aspectOptions });

export const opts = (values: readonly string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }));

export const showForVariants = (variants: string[]) => ({ prop: 'variant', variants });

export const cardItemLink = { link: LinkSchema.optional(), linkLabel: z.string().max(60).optional() };

export const priceFields = {
  price: z.string().max(40).optional(),
  priceNote: z.string().max(60).optional(),
};

export const imageItem = media;
export const optionalImage = media.optional();
