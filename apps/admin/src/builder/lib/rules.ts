import type { ComponentRegistry } from '@atrium/component-registry';

/**
 * Builder placement rules (stricter than applyOperation's checks so the UI
 * never offers a drop that the engine would reject):
 *  - page root accepts only `section`-level components;
 *  - sections and site-level components never nest;
 *  - other parents follow their `children.allowed` rule.
 */
export function canAccept(registry: ComponentRegistry, parentType: string | null, childType: string): boolean {
  const child = registry.get(childType);
  if (!child) return childType === 'global-section' && parentType === null;
  if (child.level === 'site') return false;
  if (parentType === null) return child.level === 'section';
  if (child.level === 'section') return false;
  const parent = registry.get(parentType);
  if (!parent?.children) return false;
  if (parent.children.allowed === 'any') return true;
  return parent.children.allowed.includes(childType);
}

export function acceptsChildren(registry: ComponentRegistry, type: string): boolean {
  return !!registry.get(type)?.children;
}

export type Accepts = (parentType: string | null, childType: string) => boolean;

export function makeAccepts(registry: ComponentRegistry): Accepts {
  return (parentType, childType) => canAccept(registry, parentType, childType);
}
