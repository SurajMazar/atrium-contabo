import { describe, expect, it } from 'vitest';
import { BUILTIN_COMPONENTS, registry } from './index';

describe('component registry', () => {
  it('normalizes AI input: ids, defaults, invalid variants and props', () => {
    const { node, issues } = registry.normalize({
      type: 'hero',
      variant: 'does-not-exist',
      props: { heading: 'Hello', overlayOpacity: 5 },
      children: [{ type: 'heading', props: { text: 'x' } }],
    });
    expect(node.id).toMatch(/^[a-z0-9]{12}$/);
    expect(node.variant).toBe('fullscreen-image');
    expect(node.props.heading).toBe('Hello');
    expect(node.props.overlayOpacity).toBe(0.35);
    expect(node.children).toBeUndefined();
    expect(issues.length).toBe(3);
  });
  it('drops unknown child types and reports errors', () => {
    const { node, issues } = registry.normalize({ type: 'section', props: {}, children: [{ type: 'nope', props: {} }, { type: 'heading', props: { text: 'ok' } }] });
    expect(node.children?.map((c) => c.type)).toEqual(['heading']);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });
  it('creates nodes with default children', () => {
    const n = registry.createNode('columns');
    expect(n.children).toHaveLength(2);
  });
  it('exposes JSON schema and catalog', () => {
    expect(registry.jsonSchema('heading')).toHaveProperty('properties.text');
    expect(registry.catalog().length).toBe(BUILTIN_COMPONENTS.length);
  });
  it('every component has unique type, controls referencing real props', () => {
    for (const def of BUILTIN_COMPONENTS) {
      const shape = def.props.shape as Record<string, unknown>;
      for (const c of def.controls) {
        const root = c.name.split('.')[0]!;
        expect(Object.keys(shape), `${def.type}.${c.name}`).toContain(root);
      }
      expect(def.props.safeParse(def.defaultProps ?? {}).success, `${def.type} defaults`).toBe(true);
    }
  });
});

describe('extended component library', () => {
  it('every component normalizes cleanly from its defaults', () => {
    for (const def of BUILTIN_COMPONENTS) {
      const { issues } = registry.normalize({ type: def.type, variant: def.defaultVariant, props: def.defaultProps as Record<string, unknown> });
      expect(issues, def.type).toEqual([]);
    }
  });
  it('declares a default variant, recommended animations and AI guidance where relevant', () => {
    for (const def of BUILTIN_COMPONENTS) {
      if (def.variants?.length) {
        expect(def.defaultVariant, def.type).toBeTruthy();
        expect(new Set(def.variants.map((v) => v.id)).size, `${def.type} variant ids unique`).toBe(def.variants.length);
      }
      if (def.level === 'section') expect(def.ai?.useWhen, `${def.type} ai.useWhen`).toBeTruthy();
      if (def.bindable) {
        const shape = def.props.shape as Record<string, unknown>;
        expect(Object.keys(shape), `${def.type} bindable listProp`).toContain(def.bindable.listProp);
      }
    }
  });
  it('showIf conditions reference real props or variants', () => {
    for (const def of BUILTIN_COMPONENTS) {
      const shape = def.props.shape as Record<string, unknown>;
      const variants = new Set(def.variants?.map((v) => v.id) ?? []);
      for (const c of def.controls) {
        if (!c.showIf) continue;
        if (c.showIf.variants) c.showIf.variants.forEach((v) => expect(variants.has(v), `${def.type}.${c.name} variant ${v}`).toBe(true));
        if (c.showIf.prop !== 'variant') expect(Object.keys(shape), `${def.type}.${c.name} showIf`).toContain(c.showIf.prop);
      }
    }
  });
  it('covers the full catalog', () => {
    const types = new Set(BUILTIN_COMPONENTS.map((d) => d.type));
    for (const t of ['image', 'video', 'background-video', 'gallery', 'carousel', 'logo-cloud', 'cta', 'features', 'stats', 'testimonials', 'faq', 'pricing', 'team', 'timeline', 'comparison-table', 'content-split', 'text-section', 'benefits', 'rooms', 'amenities', 'offers', 'dining', 'menu', 'experiences', 'venues', 'events', 'attractions', 'booking-cta', 'contact-info', 'map', 'form', 'newsletter', 'social-links', 'tabs', 'accordion', 'modal', 'drawer', 'marquee', 'before-after', 'horizontal-scroll', 'sticky-story', 'parallax-band', 'animated-text', 'embed', 'global-section', 'collection-list']) {
      expect(types.has(t), t).toBe(true);
    }
  });
});
