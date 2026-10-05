import { describe, expect, it } from 'vitest';
import plugin, { registerPlugin } from './index';

describe('@atrium-plugin/{{name}}', () => {
  it('has a name and version', () => {
    expect(plugin.name).toBe('{{name}}');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('registers into a host', () => {
    const registered: string[] = [];
    registerPlugin(plugin, { registry: { register: (d) => registered.push(d.type) }, renderers: {} });
    expect(registered).toHaveLength(plugin.components.length);
  });
});
