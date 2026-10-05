import type { ComponentType } from 'react';
import type { RenderProps } from './types';

const renderers = new Map<string, ComponentType<RenderProps>>();

/** Register (or replace) the React renderer for a component type. Plugins call this for their components. */
export function registerRenderer(type: string, component: ComponentType<RenderProps>): void {
  renderers.set(type, component);
}

export function getRenderer(type: string): ComponentType<RenderProps> | undefined {
  return renderers.get(type);
}

export function listRenderers(): string[] {
  return [...renderers.keys()];
}
