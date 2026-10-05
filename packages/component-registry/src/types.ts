import type { NodeInput, StyleProps } from '@atrium/schema';
import type { z } from 'zod';

export const COMPONENT_CATEGORIES = [
  'site', 'structure', 'content', 'media', 'marketing', 'hospitality', 'contact', 'forms', 'advanced', 'collection',
] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

/**
 * section  — top-level page band (hero, features, gallery…); can be dropped on the page root.
 * block    — composite placed inside sections/containers (card, accordion…).
 * element  — leaf primitives (heading, text, button, image…).
 * site     — header/footer, only one per site.
 */
export type ComponentLevel = 'section' | 'block' | 'element' | 'site';

export type ControlType =
  | 'text' | 'textarea' | 'richtext' | 'number' | 'slider' | 'select' | 'segmented' | 'toggle' | 'color'
  | 'media' | 'link' | 'icon' | 'list' | 'form' | 'collection' | 'menu' | 'code' | 'date' | 'button';

export interface ControlCondition {
  prop: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  /** Show only for these variants. */
  variants?: string[];
}

/** JSON-serializable inspector control. The admin renders these generically. */
export interface Control {
  /** Dot path inside props, e.g. `title`, `primaryCta.label`. */
  name: string;
  label: string;
  type: ControlType;
  group?: 'content' | 'style' | 'layout' | 'advanced';
  help?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string | number | boolean; icon?: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  responsive?: boolean;
  mediaKind?: 'image' | 'video' | 'any';
  /** For `list` controls: controls for each item and the prop used as row title. */
  item?: Control[];
  itemLabel?: string;
  itemDefaults?: Record<string, unknown>;
  showIf?: ControlCondition;
}

export interface VariantDefinition {
  id: string;
  name: string;
  description: string;
}

export type StyleKey = keyof StyleProps;

export interface ComponentDefinition<S extends z.ZodObject = z.ZodObject> {
  type: string;
  name: string;
  category: ComponentCategory;
  level: ComponentLevel;
  /** Shown to users and AI agents. Describe purpose, not implementation. */
  description: string;
  /** lucide icon name for the element picker. */
  icon: string;
  props: S;
  /** Sensible starting content when inserted from the picker. */
  defaultProps?: Partial<z.input<S>>;
  variants?: VariantDefinition[];
  defaultVariant?: string;
  controls: Control[];
  /** Which generic style controls the inspector offers. Defaults by level. */
  styleControls?: StyleKey[];
  children?: false | { allowed: 'any' | string[]; min?: number; max?: number };
  /** Supports binding a CMS collection into a list prop. */
  bindable?: { listProp: string; itemFields: string[] };
  animations?: { recommended: string[]; default?: string; supportsParts?: boolean };
  ai?: { useWhen: string; avoidWhen?: string; example?: Omit<NodeInput, 'type'> };
  tags?: string[];
  /** Hidden from the picker (e.g. internal wrappers). */
  hidden?: boolean;
  /** Default child nodes when inserted from the picker. */
  defaultChildren?: NodeInput[];
}

export function defineComponent<S extends z.ZodObject>(def: ComponentDefinition<S>): ComponentDefinition<S> {
  return def;
}
