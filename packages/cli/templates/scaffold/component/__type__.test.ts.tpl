import { describe, expect, it } from 'vitest';
import { ComponentRegistry } from '{{registryClassImport}}';
import { {{camel}}Definition } from './{{type}}';

describe('{{type}} component', () => {
  const registry = new ComponentRegistry([{{camel}}Definition as never]);

  it('creates a node whose default props validate', () => {
    const node = registry.createNode('{{type}}');
    expect(node.type).toBe('{{type}}');
    expect(registry.validate([node])).toEqual([]);
  });

  it('falls back to defaults for invalid props instead of failing (AI/import safety)', () => {
    const { node, issues } = registry.normalize({ type: '{{type}}', props: { heading: 42 } } as never);
    expect(node.type).toBe('{{type}}');
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('exposes a JSON schema for the AI tool catalog', () => {
    expect(registry.jsonSchema('{{type}}')).toMatchObject({ type: 'object' });
  });
});
