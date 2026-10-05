import { describe, expect, it } from 'vitest';
import { {{camel}}Driver } from './{{id}}';

describe('{{kind}} driver "{{id}}"', () => {
  it('declares its identity', () => {
    expect({{camel}}Driver.kind).toBe('{{kind}}');
    expect({{camel}}Driver.id).toBe('{{id}}');
  });

  it('rejects missing secrets', () => {
    expect({{camel}}Driver.secretsSchema.safeParse({}).success).toBe(false);
  });

  it('never exposes secrets through the config schema', () => {
    const shape = Object.keys(({{camel}}Driver.configSchema as unknown as { shape: Record<string, unknown> }).shape ?? {});
    expect(shape.some((k) => /secret|password|token|apikey/i.test(k))).toBe(false);
  });
});
