import { getPath } from '@atrium/builder-core';
import type { Control, ControlCondition } from '@atrium/component-registry';

export type InspectorGroup = 'content' | 'style' | 'layout' | 'advanced';

/** Evaluate a control's `showIf` against the node's props and variant. */
export function conditionMatches(cond: ControlCondition | undefined, props: Record<string, unknown>, variant: string | undefined): boolean {
  if (!cond) return true;
  if (cond.variants && !(variant && cond.variants.includes(variant))) return false;
  if (cond.prop === 'variant' && cond.variants && cond.equals === undefined && cond.notEquals === undefined && cond.in === undefined) return true;
  const value = cond.prop === 'variant' ? variant : getPath(props, cond.prop);
  if (cond.equals !== undefined && value !== cond.equals) {
    // Treat undefined booleans as false so `equals: false` matches unset toggles.
    if (!(cond.equals === false && value === undefined)) return false;
  }
  if (cond.notEquals !== undefined && value === cond.notEquals) return false;
  if (cond.in && !cond.in.includes(value)) return false;
  return true;
}

export function visibleControls(controls: Control[], props: Record<string, unknown>, variant: string | undefined): Control[] {
  return controls.filter((c) => conditionMatches(c.showIf, props, variant));
}

export function controlsByGroup(controls: Control[]): Record<InspectorGroup, Control[]> {
  const out: Record<InspectorGroup, Control[]> = { content: [], style: [], layout: [], advanced: [] };
  for (const c of controls) out[c.group ?? 'content'].push(c);
  return out;
}

/** Find the control that edits a given prop path (used for inline editing / AI rewrite). */
export function controlForPath(controls: Control[], path: string): Control | undefined {
  const direct = controls.find((c) => c.name === path);
  if (direct) return direct;
  // list item path: `buttons.0.label` → list `buttons`, item control `label`
  const m = /^(.+?)\.(\d+)\.(.+)$/.exec(path);
  if (m) {
    const list = controls.find((c) => c.name === m[1] && c.type === 'list');
    return list?.item ? controlForPath(list.item, m[3]!) : undefined;
  }
  return undefined;
}

export function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
