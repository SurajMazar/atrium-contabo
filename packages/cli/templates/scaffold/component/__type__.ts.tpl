import { z } from 'zod';
import { defineComponent } from '{{registryImport}}';
{{#if isSection}}import { intro, sectionBase, sectionControls } from '{{fieldsImport}}';
{{/if}}
/**
 * {{title}} — scaffolded by `atrium new-component {{type}}`.
 * The definition is the single source of truth: the builder renders the inspector from
 * `controls`, the API/AI validate against `props`, and the renderer receives parsed props.
 */
export const {{camel}}Definition = defineComponent({
  type: '{{type}}',
  name: '{{title}}',
  category: '{{category}}',
  level: '{{level}}',
  icon: 'square-dashed',
  // Describe the purpose (not the implementation) — users and the AI agent read this.
  description: 'TODO: what the {{title}} {{level}} is for.',
  variants: [
    { id: 'default', name: 'Default', description: 'TODO: describe the default layout.' },
    { id: 'compact', name: 'Compact', description: 'TODO: a denser alternative.' },
  ],
  defaultVariant: 'default',
  props: z.object({
{{#if isSection}}    ...sectionBase,
    ...intro,
{{/if}}{{#unless isSection}}    heading: z.string().max(200).optional(),
{{/unless}}    items: z
      .array(z.object({ title: z.string().max(120), text: z.string().max(600).optional() }))
      .max(12)
      .default([]),
  }),
  defaultProps: {
    heading: '{{title}}',
    items: [
      { title: 'First item', text: 'Supporting text.' },
      { title: 'Second item', text: 'Supporting text.' },
    ],
  },
  controls: [
    { name: 'heading', label: 'Heading', type: 'text', group: 'content' },
    {
      name: 'items',
      label: 'Items',
      type: 'list',
      group: 'content',
      itemLabel: 'title',
      item: [
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'text', label: 'Text', type: 'textarea' },
      ],
      itemDefaults: { title: 'New item' },
    },
{{#if isSection}}    ...sectionControls,
{{/if}}  ],
  children: false,
  animations: { recommended: ['fade', 'slide-up'], default: 'fade' },
  ai: {
    useWhen: 'TODO: when the AI agent should pick this component.',
    avoidWhen: 'TODO: when it should not.',
  },
  tags: ['{{category}}'],
});
