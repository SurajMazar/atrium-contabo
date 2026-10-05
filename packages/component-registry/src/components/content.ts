import { z } from 'zod';
import { defineComponent } from '../types';
import { ButtonSchema, buttonItemControls, headingLevel } from '../fields';

export const heading = defineComponent({
  type: 'heading',
  name: 'Heading',
  category: 'content',
  level: 'element',
  icon: 'heading',
  description: 'Heading text (h1–h6). Supports *italic emphasis* with asterisks for editorial styling.',
  props: z.object({
    text: z.string().max(400),
    level: headingLevel.default('h2'),
    size: z.enum(['auto', 'sm', 'md', 'lg', 'xl', 'display']).default('auto'),
    font: z.enum(['heading', 'body', 'accent']).default('heading'),
  }),
  defaultProps: { text: 'A considered heading', level: 'h2' },
  controls: [
    { name: 'text', label: 'Text', type: 'textarea', group: 'content', help: 'Wrap words in *asterisks* for italic emphasis.' },
    { name: 'level', label: 'Level', type: 'segmented', group: 'content', options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((v) => ({ label: v.toUpperCase(), value: v })) },
    { name: 'size', label: 'Size', type: 'select', group: 'style', options: ['auto', 'sm', 'md', 'lg', 'xl', 'display'].map((v) => ({ label: v, value: v })) },
    { name: 'font', label: 'Font', type: 'segmented', group: 'style', options: [{ label: 'Heading', value: 'heading' }, { label: 'Body', value: 'body' }, { label: 'Accent', value: 'accent' }] },
  ],
  animations: { recommended: ['fade-up', 'reveal', 'word-reveal', 'text-reveal'] },
});

export const text = defineComponent({
  type: 'text',
  name: 'Paragraph',
  category: 'content',
  level: 'element',
  icon: 'pilcrow',
  description: 'Plain paragraph text.',
  props: z.object({ text: z.string().max(5000), size: z.enum(['sm', 'base', 'lg', 'xl']).default('base'), muted: z.boolean().default(false), eyebrow: z.boolean().default(false) }),
  defaultProps: { text: 'Write something meaningful here.' },
  controls: [
    { name: 'text', label: 'Text', type: 'textarea', group: 'content' },
    { name: 'size', label: 'Size', type: 'segmented', group: 'style', options: ['sm', 'base', 'lg', 'xl'].map((v) => ({ label: v, value: v })) },
    { name: 'muted', label: 'Muted', type: 'toggle', group: 'style' },
    { name: 'eyebrow', label: 'Eyebrow style', type: 'toggle', group: 'style', help: 'Small uppercase tracked label' },
  ],
  animations: { recommended: ['fade-up', 'fade'] },
});

export const richText = defineComponent({
  type: 'rich-text',
  name: 'Rich text',
  category: 'content',
  level: 'element',
  icon: 'text',
  description: 'Formatted long-form content (sanitized HTML: headings, lists, links, emphasis, quotes).',
  props: z.object({ html: z.string().max(200_000), measure: z.enum(['narrow', 'default', 'full']).default('default'), dropCap: z.boolean().default(false) }),
  defaultProps: { html: '<p>Start writing…</p>' },
  controls: [
    { name: 'html', label: 'Content', type: 'richtext', group: 'content' },
    { name: 'measure', label: 'Line length', type: 'segmented', group: 'layout', options: ['narrow', 'default', 'full'].map((v) => ({ label: v, value: v })) },
    { name: 'dropCap', label: 'Drop cap', type: 'toggle', group: 'style' },
  ],
});

export const button = defineComponent({
  type: 'button',
  name: 'Button',
  category: 'content',
  level: 'element',
  icon: 'mouse-pointer-click',
  description: 'Call-to-action button or link.',
  props: ButtonSchema.extend({ size: z.enum(['sm', 'md', 'lg']).default('md'), fullWidth: z.boolean().default(false) }),
  defaultProps: { label: 'Get in touch', link: '#contact', style: 'primary' },
  controls: [...buttonItemControls.map((c) => ({ ...c, group: 'content' as const })),
    { name: 'size', label: 'Size', type: 'segmented', group: 'style', options: ['sm', 'md', 'lg'].map((v) => ({ label: v.toUpperCase(), value: v })) },
    { name: 'fullWidth', label: 'Full width', type: 'toggle', group: 'layout' },
  ],
  styleControls: ['margin'],
});

export const buttonGroup = defineComponent({
  type: 'button-group',
  name: 'Button group',
  category: 'content',
  level: 'element',
  icon: 'square-mouse-pointer',
  description: 'Row of buttons.',
  props: z.object({ buttons: z.array(ButtonSchema).max(4), align: z.enum(['left', 'center', 'right']).default('left') }),
  defaultProps: { buttons: [{ label: 'Book now', link: '#contact', style: 'primary', iconPosition: 'end' }, { label: 'Explore', link: '#', style: 'outline', iconPosition: 'end' }] },
  controls: [
    { name: 'buttons', label: 'Buttons', type: 'list', group: 'content', item: buttonItemControls, itemLabel: 'label', itemDefaults: { label: 'Learn more', style: 'outline', link: '#' } },
    { name: 'align', label: 'Align', type: 'segmented', group: 'layout', options: ['left', 'center', 'right'].map((v) => ({ label: v, value: v })) },
  ],
  styleControls: ['margin'],
});

export const icon = defineComponent({
  type: 'icon',
  name: 'Icon',
  category: 'content',
  level: 'element',
  icon: 'sparkle',
  description: 'Line icon from the icon set.',
  props: z.object({ name: z.string().default('sparkle'), size: z.number().min(12).max(128).default(28), strokeWidth: z.number().min(0.5).max(3).default(1.25), label: z.string().optional() }),
  controls: [
    { name: 'name', label: 'Icon', type: 'icon', group: 'content' },
    { name: 'size', label: 'Size', type: 'slider', group: 'style', min: 12, max: 128, unit: 'px' },
    { name: 'strokeWidth', label: 'Stroke', type: 'slider', group: 'style', min: 0.5, max: 3, step: 0.25 },
    { name: 'label', label: 'Accessible label', type: 'text', group: 'advanced' },
  ],
  styleControls: ['color', 'margin'],
});

export const badge = defineComponent({
  type: 'badge',
  name: 'Badge',
  category: 'content',
  level: 'element',
  icon: 'tag',
  description: 'Small label or pill.',
  props: z.object({ text: z.string().max(60), style: z.enum(['subtle', 'outline', 'solid']).default('subtle') }),
  defaultProps: { text: 'New' },
  controls: [
    { name: 'text', label: 'Text', type: 'text', group: 'content' },
    { name: 'style', label: 'Style', type: 'segmented', group: 'style', options: ['subtle', 'outline', 'solid'].map((v) => ({ label: v, value: v })) },
  ],
});

export const quote = defineComponent({
  type: 'quote',
  name: 'Quote',
  category: 'content',
  level: 'element',
  icon: 'quote',
  description: 'Pull quote with optional attribution.',
  props: z.object({ text: z.string().max(1200), author: z.string().optional(), role: z.string().optional(), size: z.enum(['md', 'lg', 'xl']).default('lg') }),
  defaultProps: { text: 'An unforgettable stay — every detail was considered.', author: 'Guest review' },
  controls: [
    { name: 'text', label: 'Quote', type: 'textarea', group: 'content' },
    { name: 'author', label: 'Author', type: 'text', group: 'content' },
    { name: 'role', label: 'Role / source', type: 'text', group: 'content' },
    { name: 'size', label: 'Size', type: 'segmented', group: 'style', options: ['md', 'lg', 'xl'].map((v) => ({ label: v, value: v })) },
  ],
  animations: { recommended: ['text-reveal', 'fade-up'] },
});

export const list = defineComponent({
  type: 'list',
  name: 'List',
  category: 'content',
  level: 'element',
  icon: 'list',
  description: 'Bulleted, numbered, check or icon list.',
  props: z.object({
    items: z.array(z.object({ text: z.string(), icon: z.string().optional() })).max(50),
    style: z.enum(['bullet', 'number', 'check', 'icon', 'none']).default('check'),
    columns: z.number().int().min(1).max(3).default(1),
  }),
  defaultProps: { items: [{ text: 'First point' }, { text: 'Second point' }, { text: 'Third point' }] },
  controls: [
    { name: 'items', label: 'Items', type: 'list', group: 'content', itemLabel: 'text', item: [{ name: 'text', label: 'Text', type: 'text' }, { name: 'icon', label: 'Icon', type: 'icon' }], itemDefaults: { text: 'New item' } },
    { name: 'style', label: 'Marker', type: 'select', group: 'style', options: ['bullet', 'number', 'check', 'icon', 'none'].map((v) => ({ label: v, value: v })) },
    { name: 'columns', label: 'Columns', type: 'slider', group: 'layout', min: 1, max: 3 },
  ],
  animations: { recommended: ['stagger'] },
});

export const contentComponents = [heading, text, richText, button, buttonGroup, icon, badge, quote, list];
