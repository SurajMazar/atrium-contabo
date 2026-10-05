import { listAnimationPresets } from '@atrium/animations';
import { CODE_COMPONENT_TYPES } from '@atrium/builder-core';
import type { ComponentRegistry } from '@atrium/component-registry';
import { THEME_PRESETS } from '@atrium/design-tokens';

type JsonSchema = { type?: string | string[]; enum?: unknown[]; const?: unknown; properties?: Record<string, JsonSchema>; items?: JsonSchema; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; default?: unknown; maxItems?: number; description?: string; required?: string[] };

function typeOf(s: JsonSchema | undefined, depth = 0): string {
  if (!s) return 'any';
  if (s.enum) return s.enum.map((e) => JSON.stringify(e)).join('|');
  if (s.const !== undefined) return JSON.stringify(s.const);
  const alts = s.anyOf ?? s.oneOf;
  if (alts) return [...new Set(alts.map((a) => typeOf(a, depth)))].join(' | ');
  const t = Array.isArray(s.type) ? s.type.join('|') : s.type;
  if (t === 'array') return `${typeOf(s.items, depth)}[]${s.maxItems ? `(≤${s.maxItems})` : ''}`;
  if (t === 'object' && s.properties) {
    if (depth >= 2) return 'object';
    return `{ ${Object.entries(s.properties).map(([k, v]) => `${k}${s.required?.includes(k) ? '' : '?'}: ${typeOf(v, depth + 1)}`).join('; ')} }`;
  }
  return t ?? 'any';
}

/** Compact, prompt-friendly reference for a set of components (props from the registry's JSON Schemas). */
export function componentGuide(registry: ComponentRegistry, types?: string[]): string {
  // Code-bearing components (embeds / custom HTML) are never offered to the model.
  const defs = registry.list().filter((d) => !d.hidden && !CODE_COMPONENT_TYPES.has(d.type) && (!types || types.includes(d.type)));
  return defs
    .map((d) => {
      const schema = registry.jsonSchema(d.type) as JsonSchema | undefined;
      const props = schema?.properties ? Object.entries(schema.properties).map(([k, v]) => `    ${k}${schema.required?.includes(k) ? '' : '?'}: ${typeOf(v)}`).join('\n') : '';
      const variants = d.variants?.length ? `\n  variants: ${d.variants.map((v) => `${v.id} (${v.description})`).join('; ')}` : '';
      const children = d.children ? `\n  children: ${d.children.allowed === 'any' ? 'any blocks/elements' : d.children.allowed.join(', ')}` : '';
      const bind = d.bindable ? `\n  can bind a CMS collection into "${d.bindable.listProp}"` : '';
      const anim = d.animations?.recommended?.length ? `\n  good animations: ${d.animations.recommended.join(', ')}` : '';
      return `## ${d.type} — ${d.name} [${d.level}/${d.category}]\n  ${d.description}${d.ai?.useWhen ? `\n  use when: ${d.ai.useWhen}` : ''}${d.ai?.avoidWhen ? `\n  avoid: ${d.ai.avoidWhen}` : ''}${variants}${children}${bind}${anim}\n  props:\n${props}`;
    })
    .join('\n\n');
}

/** One line per component — used for planning. */
export function componentIndex(registry: ComponentRegistry): string {
  return registry
    .catalog()
    .filter((c) => (c.level === 'section' || c.level === 'site') && !CODE_COMPONENT_TYPES.has(c.type))
    .map((c) => `- ${c.type}${c.variants?.length ? ` (variants: ${c.variants.map((v) => v.id).join(', ')})` : ''}: ${c.description}${c.useWhen ? ` Use when: ${c.useWhen}` : ''}`)
    .join('\n');
}

export function themeIndex(): string {
  return Object.entries(THEME_PRESETS)
    .map(([k, t]) => `- ${k}: ${t.name} — headings ${t.typography.heading.family}, body ${t.typography.body.family}, ${t.colorScheme} scheme, primary ${t.colors.primary}, motion ${t.motion.intensity}`)
    .join('\n');
}

export function animationIndex(): string {
  return listAnimationPresets()
    .map((a) => `- ${a.id} [${a.category}]: ${a.description}; best for ${a.bestFor.join(', ')}`)
    .join('\n');
}
