import { z } from 'zod';
import { defineComponent } from '../types';
import { sectionBase, sectionControls } from '../fields';

export const section = defineComponent({
  type: 'section',
  name: 'Section',
  category: 'structure',
  level: 'section',
  icon: 'square',
  description: 'Generic full-width page band with a container. Use to compose custom layouts from blocks and elements.',
  props: z.object({
    ...sectionBase,
    minHeight: z.enum(['auto', 'half', 'screen']).default('auto'),
    verticalAlign: z.enum(['start', 'center', 'end']).default('start'),
  }),
  defaultProps: { tone: 'default', containerWidth: 'default', spacingTop: 'lg', spacingBottom: 'lg' },
  controls: [
    ...sectionControls,
    { name: 'minHeight', label: 'Min height', type: 'segmented', group: 'layout', options: [{ label: 'Auto', value: 'auto' }, { label: '50vh', value: 'half' }, { label: 'Screen', value: 'screen' }] },
    { name: 'verticalAlign', label: 'Vertical align', type: 'segmented', group: 'layout', options: [{ label: 'Top', value: 'start' }, { label: 'Middle', value: 'center' }, { label: 'Bottom', value: 'end' }] },
  ],
  children: { allowed: 'any' },
  animations: { recommended: ['fade-up', 'stagger'] },
  ai: { useWhen: 'No specialized section fits and you need a custom arrangement of blocks.' },
});

export const container = defineComponent({
  type: 'container',
  name: 'Container',
  category: 'structure',
  level: 'block',
  icon: 'box',
  description: 'Groups children with optional background, padding and max width.',
  props: z.object({ width: z.enum(['narrow', 'default', 'wide', 'full', 'auto']).default('auto'), tag: z.enum(['div', 'article', 'aside', 'header', 'footer', 'nav']).default('div') }),
  controls: [
    { name: 'width', label: 'Width', type: 'segmented', group: 'layout', options: ['auto', 'narrow', 'default', 'wide', 'full'].map((v) => ({ label: v, value: v })) },
    { name: 'tag', label: 'HTML tag', type: 'select', group: 'advanced', options: ['div', 'article', 'aside', 'header', 'footer', 'nav'].map((v) => ({ label: v, value: v })) },
  ],
  styleControls: ['padding', 'margin', 'gap', 'background', 'backgroundImage', 'color', 'borderRadius', 'border', 'boxShadow', 'maxWidth', 'minHeight', 'textAlign', 'display', 'flexDirection', 'alignItems', 'justifyContent'],
  children: { allowed: 'any' },
});

export const grid = defineComponent({
  type: 'grid',
  name: 'Grid',
  category: 'structure',
  level: 'block',
  icon: 'layout-grid',
  description: 'Responsive grid. Columns collapse automatically on tablet and mobile.',
  props: z.object({
    columns: z.number().int().min(1).max(6).default(3),
    tabletColumns: z.number().int().min(1).max(4).default(2),
    mobileColumns: z.number().int().min(1).max(2).default(1),
    gap: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('md'),
    alignItems: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
  }),
  controls: [
    { name: 'columns', label: 'Columns', type: 'slider', group: 'layout', min: 1, max: 6 },
    { name: 'tabletColumns', label: 'Tablet columns', type: 'slider', group: 'layout', min: 1, max: 4 },
    { name: 'mobileColumns', label: 'Mobile columns', type: 'slider', group: 'layout', min: 1, max: 2 },
    { name: 'gap', label: 'Gap', type: 'segmented', group: 'layout', options: ['none', 'sm', 'md', 'lg', 'xl'].map((v) => ({ label: v.toUpperCase(), value: v })) },
    { name: 'alignItems', label: 'Align', type: 'select', group: 'layout', options: ['start', 'center', 'end', 'stretch'].map((v) => ({ label: v, value: v })) },
  ],
  children: { allowed: 'any' },
  animations: { recommended: ['stagger'] },
});

export const columns = defineComponent({
  type: 'columns',
  name: 'Columns',
  category: 'structure',
  level: 'block',
  icon: 'columns-2',
  description: 'Two or three columns with a chosen ratio; stacks on mobile.',
  props: z.object({
    ratio: z.enum(['1:1', '1:2', '2:1', '1:1:1', '5:7', '7:5']).default('1:1'),
    gap: z.enum(['sm', 'md', 'lg', 'xl']).default('lg'),
    alignItems: z.enum(['start', 'center', 'end', 'stretch']).default('center'),
    reverseOnMobile: z.boolean().default(false),
  }),
  controls: [
    { name: 'ratio', label: 'Ratio', type: 'select', group: 'layout', options: ['1:1', '1:2', '2:1', '1:1:1', '5:7', '7:5'].map((v) => ({ label: v, value: v })) },
    { name: 'gap', label: 'Gap', type: 'segmented', group: 'layout', options: ['sm', 'md', 'lg', 'xl'].map((v) => ({ label: v.toUpperCase(), value: v })) },
    { name: 'alignItems', label: 'Vertical align', type: 'select', group: 'layout', options: ['start', 'center', 'end', 'stretch'].map((v) => ({ label: v, value: v })) },
    { name: 'reverseOnMobile', label: 'Reverse on mobile', type: 'toggle', group: 'layout' },
  ],
  children: { allowed: 'any', min: 2 },
  defaultChildren: [{ type: 'stack', props: {} }, { type: 'stack', props: {} }],
});

export const stack = defineComponent({
  type: 'stack',
  name: 'Stack',
  category: 'structure',
  level: 'block',
  icon: 'rows-3',
  description: 'Vertical or horizontal stack of children with consistent spacing.',
  props: z.object({
    direction: z.enum(['vertical', 'horizontal']).default('vertical'),
    gap: z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']).default('md'),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
    justify: z.enum(['start', 'center', 'end', 'between']).default('start'),
    wrap: z.boolean().default(false),
  }),
  controls: [
    { name: 'direction', label: 'Direction', type: 'segmented', group: 'layout', options: [{ label: 'Vertical', value: 'vertical' }, { label: 'Horizontal', value: 'horizontal' }] },
    { name: 'gap', label: 'Gap', type: 'segmented', group: 'layout', options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'].map((v) => ({ label: v.toUpperCase(), value: v })) },
    { name: 'align', label: 'Align', type: 'select', group: 'layout', options: ['start', 'center', 'end', 'stretch'].map((v) => ({ label: v, value: v })) },
    { name: 'justify', label: 'Justify', type: 'select', group: 'layout', options: ['start', 'center', 'end', 'between'].map((v) => ({ label: v, value: v })) },
    { name: 'wrap', label: 'Wrap', type: 'toggle', group: 'layout' },
  ],
  children: { allowed: 'any' },
});

export const spacer = defineComponent({
  type: 'spacer',
  name: 'Spacer',
  category: 'structure',
  level: 'element',
  icon: 'move-vertical',
  description: 'Vertical whitespace.',
  props: z.object({ size: z.enum(['xs', 'sm', 'md', 'lg', 'xl', '2xl']).default('md') }),
  controls: [{ name: 'size', label: 'Size', type: 'segmented', group: 'layout', options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].map((v) => ({ label: v.toUpperCase(), value: v })) }],
  styleControls: ['height'],
});

export const divider = defineComponent({
  type: 'divider',
  name: 'Divider',
  category: 'structure',
  level: 'element',
  icon: 'minus',
  description: 'Horizontal rule, optionally with an ornament or label.',
  props: z.object({ style: z.enum(['line', 'short', 'ornament', 'label']).default('line'), label: z.string().optional() }),
  controls: [
    { name: 'style', label: 'Style', type: 'select', group: 'style', options: ['line', 'short', 'ornament', 'label'].map((v) => ({ label: v, value: v })) },
    { name: 'label', label: 'Label', type: 'text', group: 'content', showIf: { prop: 'style', equals: 'label' } },
  ],
  styleControls: ['margin', 'color', 'maxWidth'],
});

export const structureComponents = [section, container, grid, columns, stack, spacer, divider];
