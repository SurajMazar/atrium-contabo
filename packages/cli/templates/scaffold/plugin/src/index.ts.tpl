import type { ComponentDefinition } from '@atrium/component-registry';
import type { ProviderDriver } from '@atrium/providers';
import type { ComponentType } from 'react';

/**
 * Atrium plugin "{{name}}". A plugin is plain data + factories:
 *  - components: registry definitions (schema, controls, variants, AI hints)
 *  - renderers:  React components keyed by component type (renderer + builder canvas)
 *  - providers:  extra provider drivers (email/sms/storage/ai/deployment/captcha)
 * Hosts (API, worker, renderer, admin) call `registerPlugin()` at startup — see
 * docs/CONTRIBUTING.md#plugins.
 */
export interface AtriumPlugin {
  name: string;
  version: string;
  components: ComponentDefinition[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderers: Record<string, ComponentType<any>>;
  providers: ProviderDriver[];
}

export function definePlugin(plugin: AtriumPlugin): AtriumPlugin {
  for (const c of plugin.components) {
    // Prefixing keeps plugin component types from colliding with core or other plugins.
    if (!c.type.startsWith(`${plugin.name}-`)) throw new Error(`Plugin ${plugin.name}: component type "${c.type}" must start with "${plugin.name}-"`);
  }
  return plugin;
}

/** Register the plugin into a host's registries (duck-typed so hosts stay decoupled). */
export function registerPlugin(
  plugin: AtriumPlugin,
  host: { registry?: { register(def: ComponentDefinition): void }; renderers?: Record<string, unknown>; providers?: { add(driver: ProviderDriver): void } },
) {
  for (const def of plugin.components) host.registry?.register(def);
  if (host.renderers) Object.assign(host.renderers, plugin.renderers);
  for (const d of plugin.providers) host.providers?.add(d);
}

export default definePlugin({
  name: '{{name}}',
  version: '0.1.0',
  components: [],
  renderers: {},
  providers: [],
});
