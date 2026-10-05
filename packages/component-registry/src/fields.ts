import { LinkSchema, MediaRefSchema } from '@atrium/schema';
import { z } from 'zod';
import type { Control } from './types';

/**
 * Reusable prop schemas + matching controls. Components compose these so the
 * builder, AI and renderer agree on shape everywhere.
 */
export const media = MediaRefSchema;
export const link = LinkSchema;

export const ButtonSchema = z.object({
  label: z.string().max(80),
  link: LinkSchema.optional(),
  style: z.enum(['primary', 'secondary', 'outline', 'ghost', 'link']).default('primary'),
  icon: z.string().optional(),
  iconPosition: z.enum(['start', 'end']).default('end'),
});
export type ButtonSpec = z.infer<typeof ButtonSchema>;

export const tone = z.enum(['default', 'surface', 'surface-alt', 'inverse', 'primary', 'transparent']).default('default');
export const containerWidth = z.enum(['narrow', 'default', 'wide', 'full']).default('default');
export const spacingY = z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('lg');
export const align = z.enum(['left', 'center', 'right']).default('left');
export const headingLevel = z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Base props every `section`-level component accepts. */
export const sectionBase = {
  tone,
  containerWidth,
  spacingTop: spacingY,
  spacingBottom: spacingY,
};

/** Common heading block used by most sections. */
export const intro = {
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(300).optional(),
  headingLevel: headingLevel.default('h2'),
  subheading: z.string().max(1200).optional(),
  align: align,
};

export const toneOptions = [
  { label: 'Default', value: 'default' },
  { label: 'Surface', value: 'surface' },
  { label: 'Surface alt', value: 'surface-alt' },
  { label: 'Inverse', value: 'inverse' },
  { label: 'Primary', value: 'primary' },
  { label: 'Transparent', value: 'transparent' },
];

export const sectionControls: Control[] = [
  { name: 'tone', label: 'Tone', type: 'select', group: 'style', options: toneOptions },
  {
    name: 'containerWidth', label: 'Container', type: 'segmented', group: 'layout',
    options: [{ label: 'Narrow', value: 'narrow' }, { label: 'Default', value: 'default' }, { label: 'Wide', value: 'wide' }, { label: 'Full', value: 'full' }],
  },
  { name: 'spacingTop', label: 'Space above', type: 'segmented', group: 'layout', options: ['none', 'sm', 'md', 'lg', 'xl'].map((v) => ({ label: v.toUpperCase(), value: v })) },
  { name: 'spacingBottom', label: 'Space below', type: 'segmented', group: 'layout', options: ['none', 'sm', 'md', 'lg', 'xl'].map((v) => ({ label: v.toUpperCase(), value: v })) },
];

export const introControls: Control[] = [
  { name: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'content', placeholder: 'Short label above the heading' },
  { name: 'heading', label: 'Heading', type: 'textarea', group: 'content' },
  { name: 'subheading', label: 'Supporting text', type: 'textarea', group: 'content' },
  { name: 'headingLevel', label: 'Heading level', type: 'select', group: 'advanced', options: ['h1', 'h2', 'h3', 'h4'].map((v) => ({ label: v.toUpperCase(), value: v })) },
  { name: 'align', label: 'Alignment', type: 'segmented', group: 'layout', options: [{ label: 'Left', value: 'left', icon: 'align-left' }, { label: 'Center', value: 'center', icon: 'align-center' }, { label: 'Right', value: 'right', icon: 'align-right' }] },
];

export const buttonItemControls: Control[] = [
  { name: 'label', label: 'Label', type: 'text' },
  { name: 'link', label: 'Link', type: 'link' },
  { name: 'style', label: 'Style', type: 'select', options: ['primary', 'secondary', 'outline', 'ghost', 'link'].map((v) => ({ label: v[0]!.toUpperCase() + v.slice(1), value: v })) },
  { name: 'icon', label: 'Icon', type: 'icon' },
];

export const buttonsControl = (name = 'buttons', label = 'Buttons'): Control => ({
  name, label, type: 'list', group: 'content', item: buttonItemControls, itemLabel: 'label', itemDefaults: { label: 'Learn more', style: 'primary', link: '#' },
});

export const mediaControl = (name: string, label: string, kind: 'image' | 'video' | 'any' = 'image'): Control => ({ name, label, type: 'media', group: 'content', mediaKind: kind });
