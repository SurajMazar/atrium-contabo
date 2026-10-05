import type { ComponentRegistry } from '@atrium/component-registry';
import type { NodeInput } from '@atrium/schema';

export interface SectionPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  node: NodeInput;
  source: 'local' | 'registry' | 'server';
  thumbnailUrl?: string | null;
}

/** Hand-composed starting points built from structural primitives. */
const COMPOSED: SectionPreset[] = [
  {
    id: 'intro-text', name: 'Intro text', description: 'Eyebrow, heading, paragraph and buttons, centered.', category: 'Content', icon: 'align-center', source: 'local',
    node: {
      type: 'section', props: { spacingTop: 'xl', spacingBottom: 'xl', containerWidth: 'narrow' },
      children: [{ type: 'stack', props: { align: 'center', gap: 'md' }, children: [
        { type: 'text', props: { text: 'Our story', eyebrow: true } },
        { type: 'heading', props: { text: 'Crafted with *intention*', level: 'h2', size: 'lg' }, style: { textAlign: 'center' } },
        { type: 'text', props: { text: 'Describe what makes this place, product or service distinct in two or three sentences.', size: 'lg', muted: true }, style: { textAlign: 'center' } },
        { type: 'button-group', props: { align: 'center' } },
      ] }],
    },
  },
  {
    id: 'two-columns', name: 'Text + text columns', description: 'Heading on the left, supporting copy on the right.', category: 'Content', icon: 'columns-2', source: 'local',
    node: {
      type: 'section', props: {},
      children: [{ type: 'columns', props: { ratio: '5:7', alignItems: 'start' }, children: [
        { type: 'stack', props: {}, children: [{ type: 'heading', props: { text: 'A considered approach', level: 'h2' } }] },
        { type: 'stack', props: {}, children: [
          { type: 'text', props: { text: 'Explain your philosophy, history or method. Keep paragraphs short and specific.' } },
          { type: 'button', props: { label: 'Read more', style: 'link', link: '#' } },
        ] },
      ] }],
    },
  },
  {
    id: 'feature-grid', name: 'Feature grid', description: 'Three columns with icon, heading and text.', category: 'Features', icon: 'layout-grid', source: 'local',
    node: {
      type: 'section', props: { tone: 'surface' },
      children: [
        { type: 'stack', props: { align: 'center', gap: 'sm' }, children: [{ type: 'heading', props: { text: 'What we offer', level: 'h2' } }] },
        { type: 'grid', props: { columns: 3, gap: 'lg' }, animation: { preset: 'stagger' }, children: [1, 2, 3].map((i) => ({
          type: 'stack', props: { gap: 'sm' }, children: [
            { type: 'icon', props: { name: ['sparkle', 'leaf', 'sun'][i - 1] } },
            { type: 'heading', props: { text: `Feature ${i}`, level: 'h3', size: 'sm' } },
            { type: 'text', props: { text: 'One or two lines describing the benefit.', muted: true } },
          ],
        })) },
      ],
    },
  },
  {
    id: 'quote-band', name: 'Quote', description: 'Large centered testimonial quote.', category: 'Social proof', icon: 'quote', source: 'local',
    node: { type: 'section', props: { containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'xl' }, children: [{ type: 'quote', props: { size: 'xl' }, animation: { preset: 'text-reveal' } }] },
  },
  {
    id: 'cta-band', name: 'Call to action', description: 'Inverse band with heading and buttons.', category: 'Calls to action', icon: 'megaphone', source: 'local',
    node: {
      type: 'section', props: { tone: 'inverse', spacingTop: 'xl', spacingBottom: 'xl' },
      children: [{ type: 'stack', props: { align: 'center', gap: 'md' }, children: [
        { type: 'heading', props: { text: 'Ready when you are', level: 'h2', size: 'lg' } },
        { type: 'button-group', props: { align: 'center' } },
      ] }],
    },
  },
];

function allTypesRegistered(node: NodeInput, registry: ComponentRegistry): boolean {
  return registry.has(node.type) && (node.children ?? []).every((c) => allTypesRegistered(c, registry));
}

/**
 * Local section presets: every section-level component × variant from the
 * registry, plus composed layouts whose component types are all registered.
 */
export function localSectionPresets(registry: ComponentRegistry): SectionPreset[] {
  const out: SectionPreset[] = [];
  for (const def of registry.list()) {
    if (def.hidden || def.level !== 'section' || def.type === 'section') continue;
    const category = def.category[0]!.toUpperCase() + def.category.slice(1);
    if (def.variants?.length) {
      for (const v of def.variants) {
        out.push({ id: `${def.type}:${v.id}`, name: `${def.name} · ${v.name}`, description: v.description, category, icon: def.icon, source: 'registry', node: { type: def.type, variant: v.id, props: {} } });
      }
    } else {
      out.push({ id: def.type, name: def.name, description: def.description, category, icon: def.icon, source: 'registry', node: { type: def.type, props: {} } });
    }
  }
  for (const p of COMPOSED) if (allTypesRegistered(p.node, registry)) out.push(p);
  return out;
}
