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
