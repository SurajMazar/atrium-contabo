import { ComponentRegistry } from './registry';
import type { ComponentDefinition } from './types';
import { contentComponents } from './components/content';
import { hero } from './components/hero';
import { siteComponents } from './components/site';
import { structureComponents } from './components/structure';

export * from './types';
export * from './fields';
export * from './registry';

/** Every built-in component definition. Plugins may register more at runtime. */
export const BUILTIN_COMPONENTS: ComponentDefinition[] = [
  ...siteComponents,
  ...structureComponents,
  ...contentComponents,
  hero,
] as unknown as ComponentDefinition[];

export function createRegistry(extra: ComponentDefinition[] = []): ComponentRegistry {
  return new ComponentRegistry([...BUILTIN_COMPONENTS, ...extra]);
}

/** Shared default registry instance. */
export const registry = createRegistry();
