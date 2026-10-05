import { createRegistry } from '@atrium/component-registry';
import type { AIProvider, AiChatRequest, AiChatResponse, StructuredRequest } from '@atrium/providers';
import { describe, expect, it } from 'vitest';
import { generateSite, Llm, proposeEdit, resolveLibraryImages, siteOverview } from './index';

const registry = createRegistry();
const usage = { inputTokens: 100, outputTokens: 50 };

/** Scripted provider: structured outputs by schema name, chat by turn. */
function fakeProvider(script: { structured: Record<string, (req: StructuredRequest<unknown>) => unknown>; chat?: Array<(req: AiChatRequest) => AiChatResponse['content']> }): AIProvider {
  let turn = 0;
  return {
    driver: 'fake',
    models: [{ id: 'fake-1', label: 'Fake', inputPrice: 1, outputPrice: 2, default: true }],
    async chat(req) {
      const step = script.chat?.[turn++];
      const content = step ? step(req) : [{ type: 'text' as const, text: 'done' }];
      return { content, stopReason: content.some((c) => c.type === 'tool_call') ? 'tool_use' : 'end', usage, model: 'fake-1', provider: 'fake' };
    },
    async *stream() {},
    async generateText() {
      return { text: 'rewritten', usage, model: 'fake-1' };
    },
    async generateStructuredData<T>(req: StructuredRequest<T>) {
      const make = script.structured[req.schemaName];
      if (!make) throw new Error(`unexpected schema ${req.schemaName}`);
      return { data: req.parse(make(req as StructuredRequest<unknown>)), usage, model: 'fake-1' };
    },
    estimateCost: (_m, u) => (u.inputTokens + u.outputTokens * 2) / 1e6,
    async test() {
      return { ok: true, message: 'ok' };
    },
  };
}

const plan = {
  siteName: 'Aranya Lake Retreat', tagline: 'Slow mornings on Phewa Lake', description: 'A twelve-room lakeside retreat in Pokhara. Mountain light, a quiet spa and a seasonal kitchen.', voice: 'warm, unhurried',
  locale: 'en', themePreset: 'editorial-warm', palette: {}, fonts: {}, motion: 'moderate', headerVariant: 'classic', footerVariant: 'statement',
  primaryCta: { label: 'Enquire', slug: 'contact' },
  pages: [
    { title: 'Home', slug: '', purpose: 'Introduce', sections: [{ type: 'hero', variant: 'cinematic', purpose: 'open' }, { type: 'section', purpose: 'story' }] },
    { title: 'Contact', slug: 'contact', purpose: 'Enquiries', sections: [{ type: 'section', purpose: 'intro' }, { type: 'section', purpose: 'form' }] },
  ],
  navigation: [{ label: 'Home', slug: '' }, { label: 'Contact', slug: 'contact' }],
  forms: [{ name: 'Enquiry', slug: 'enquiry', purpose: 'stay enquiries', submitLabel: 'Send enquiry', successMessage: 'Thank you.', fields: [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }] }],
  collections: [{ slug: 'rooms', name: 'Rooms', singularName: 'Room', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'image', label: 'Image', type: 'image' }], itemCount: 2 }],
  structuredData: ['Hotel'],
};

describe('generateSite', () => {
  it('turns a brief into a valid, registry-checked website with repaired pages', async () => {
    let pageCalls = 0;
    const provider = fakeProvider({
      structured: {
        site_plan: () => plan,
        page_content: (req) => {
          pageCalls++;
          const isHome = req.prompt.includes('"Home" page');
          if (isHome && pageCalls === 1) {
            // first attempt has an invalid component → triggers a repair pass
            return { seo: { title: 'Aranya', description: 'x'.repeat(130) }, sections: [{ type: 'does-not-exist', props: {} }] };
          }
          return {
            seo: { title: isHome ? 'Aranya Lake Retreat' : 'Contact', description: 'A twelve-room lakeside retreat in Pokhara with mountain light, a quiet spa and a kitchen that cooks with the seasons year round.' },
            sections: isHome
              ? [{ type: 'hero', variant: 'cinematic', props: { heading: 'Slow mornings on *Phewa*', image: { src: 'library:lake-turquoise' }, buttons: [{ label: 'Enquire', link: '/contact' }] }, animation: { preset: 'cinematic-reveal' } }, { type: 'section', props: {}, children: [{ type: 'heading', props: { text: 'Our story' } }] }]
              : [{ type: 'section', props: {}, children: [{ type: 'heading', props: { text: 'Contact', level: 'h1' } }] }, { type: 'section', props: {}, children: [{ type: 'text', props: { text: 'Write to us' } }] }],
          };
        },
        collection_items: () => ({ items: [{ slug: 'lake-room', data: { name: 'Lake Room', image: 'library:room-balcony' } }, { slug: 'garden-suite', data: { name: 'Garden Suite', image: 'library:suite-classic' } }] }),
      },
    });
    const llm = new Llm(provider);
    const steps: string[] = [];
    const res = await generateSite({ llm, registry, brief: { businessName: 'Aranya', businessType: 'resort', description: 'lakeside retreat', contact: { email: 'stay@aranya.test' } }, onProgress: (s, st) => void steps.push(`${s}:${st}`) });
    expect(pageCalls).toBe(3);
    expect(res.definition.pages.map((p) => p.slug)).toEqual(['', 'contact']);
    const hero = res.definition.pages[0]!.sections[0]!;
    expect(hero.type).toBe('hero');
    expect((hero.props.image as { src: string; alt: string }).src).toContain('images.unsplash.com');
    expect((hero.props.image as { alt: string }).alt).toBeTruthy();
    expect(res.definition.forms[0]!.rules[0]!.then[0]).toMatchObject({ type: 'email', to: ['stay@aranya.test'] });
    expect(res.definition.collections[0]!.items).toHaveLength(2);
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(steps).toContain('pages:done');
    expect(llm.usage.requests).toBe(5);
  });
});

describe('proposeEdit', () => {
  it('runs the tool loop on a scratch copy and returns validated operations + diff', async () => {
    const base = (await generateSite({ llm: new Llm(fakeProvider({ structured: { site_plan: () => plan, page_content: () => ({ seo: { title: 't', description: 'd'.repeat(130) }, sections: [{ type: 'hero', props: { heading: 'Hi' } }, { type: 'section', props: {} }] }), collection_items: () => ({ items: [] }) } })), registry, brief: { businessName: 'A' } })).definition;
    const home = base.pages[0]!;
    const provider = fakeProvider({
      structured: {},
      chat: [
        () => [{ type: 'tool_call', id: 't1', name: 'get_page', input: { pageId: home.id } }],
        () => [
          { type: 'text', text: 'Updating.' },
          { type: 'tool_call', id: 't2', name: 'apply_operations', input: { operations: [
            { op: 'updateNode', pageId: home.id, nodeId: home.sections[0]!.id, props: { heading: 'Quietly *luxurious*' }, variant: 'editorial' },
            { op: 'updateNode', pageId: home.id, nodeId: home.sections[0]!.id, variant: 'nope' },
            { op: 'updateTheme', patch: { buttons: { radius: '3px' } } },
          ] } },
        ],
        () => [{ type: 'tool_call', id: 't3', name: 'finish', input: { summary: 'Made the hero editorial and squared buttons.' } }],
      ],
    });
    const p = await proposeEdit({ llm: new Llm(provider), registry, definition: base, prompt: 'Make the hero more luxurious', pageId: home.id });
    expect(p.operations).toHaveLength(2);
    expect(p.summary).toMatch(/editorial/);
    expect(p.after.pages[0]!.sections[0]!.props.heading).toBe('Quietly *luxurious*');
    expect(base.pages[0]!.sections[0]!.props.heading).toBe('Hi');
    expect(p.changes.map((c) => c.scope).sort()).toEqual(['section', 'theme']);
  });

  it('summarizes sites compactly and resolves library images', () => {
    expect(resolveLibraryImages({ a: 'library:spa-massage' }).a).toContain('1544161515');
    const ov = siteOverview({ settings: { name: 'x', business: { name: 'x' } }, theme: { name: 't', colors: {}, typography: { heading: { family: 'A' }, body: { family: 'B' } }, motion: { intensity: 'subtle' }, radius: {}, buttons: {} }, pages: [], navigation: { menus: {} }, header: { type: 'site-header' }, footer: { type: 'site-footer' }, forms: [], collections: [] } as never);
    expect(ov.pages).toEqual([]);
  });
});
