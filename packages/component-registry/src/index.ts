import { ComponentRegistry } from './registry';
import type { ComponentDefinition } from './types';
import { contentComponents } from './components/content';
import { hero } from './components/hero';
import { siteComponents } from './components/site';
import { structureComponents } from './components/structure';
import { mediaComponents } from './components/media';
import { marketingComponents } from './components/marketing';
import { hospitalityComponents } from './components/hospitality';
import { contactComponents } from './components/contact';
import { advancedComponents } from './components/advanced';
import { collectionComponents } from './components/collection';

export * from './types';
export * from './fields';
export * from './registry';
export * from './components/shared';

/** Every built-in component definition. Plugins may register more at runtime. */
export const BUILTIN_COMPONENTS: ComponentDefinition[] = [
  ...siteComponents,
  ...structureComponents,
  ...contentComponents,
  hero,
  ...mediaComponents,
  ...marketingComponents,
  ...hospitalityComponents,
  ...contactComponents,
  ...advancedComponents,
  ...collectionComponents,
] as unknown as ComponentDefinition[];

export function createRegistry(extra: ComponentDefinition[] = []): ComponentRegistry {
  return new ComponentRegistry([...BUILTIN_COMPONENTS, ...extra]);
}

/** Shared default registry instance. */
export const registry = createRegistry();
