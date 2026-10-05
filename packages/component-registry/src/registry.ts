import { createId, type Node, type NodeInput } from '@atrium/schema';
import { z } from 'zod';
import type { ComponentDefinition, ComponentLevel, StyleKey } from './types';

export interface NodeIssue {
  nodeId?: string;
  path: string;
  type: string;
  message: string;
  severity: 'error' | 'warning';
}

const DEFAULT_STYLE_KEYS: Record<ComponentLevel, StyleKey[]> = {
  section: ['padding', 'margin', 'background', 'backgroundImage', 'color', 'minHeight', 'border', 'textAlign'],
  block: ['padding', 'margin', 'gap', 'background', 'color', 'borderRadius', 'border', 'boxShadow', 'maxWidth', 'textAlign'],
  element: ['margin', 'padding', 'color', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'maxWidth', 'fontFamily'],
  site: ['padding', 'background', 'color', 'border'],
};

export class ComponentRegistry {
  private defs = new Map<string, ComponentDefinition>();

  constructor(definitions: ComponentDefinition[] = []) {
    definitions.forEach((d) => this.register(d));
  }

  /** Plugins call this to add components; they become available to builder, AI and renderer. */
  register(def: ComponentDefinition): void {
    if (!/^[a-z][a-z0-9-]*$/.test(def.type)) throw new Error(`Invalid component type "${def.type}"`);
    if (this.defs.has(def.type)) throw new Error(`Component "${def.type}" is already registered`);
    if (def.variants?.length && def.defaultVariant && !def.variants.some((v) => v.id === def.defaultVariant)) {
      throw new Error(`Component "${def.type}" default variant "${def.defaultVariant}" is not declared`);
    }
    this.defs.set(def.type, def);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.defs.get(type);
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  list(): ComponentDefinition[] {
    return [...this.defs.values()];
  }

  styleKeys(type: string): StyleKey[] {
    const def = this.defs.get(type);
    return def?.styleControls ?? (def ? DEFAULT_STYLE_KEYS[def.level] : []);
  }

  /** Parse props with defaults applied. Unknown keys are stripped. */
  parseProps(type: string, props: Record<string, unknown> | undefined) {
    const def = this.defs.get(type);
    if (!def) return { success: false as const, error: `Unknown component "${type}"` };
    const res = def.props.safeParse({ ...(def.defaultProps ?? {}), ...(props ?? {}) });
    return res.success ? { success: true as const, data: res.data as Record<string, unknown> } : { success: false as const, error: z.prettifyError(res.error), issues: res.error.issues };
  }

  /** Create a fresh node with default props/children, ready for insertion. */
  createNode(type: string, overrides: Partial<NodeInput> = {}): Node {
    const def = this.defs.get(type);
    if (!def) throw new Error(`Unknown component "${type}"`);
    const input: NodeInput = {
      type,
      variant: overrides.variant ?? def.defaultVariant,
      props: { ...(def.defaultProps ?? {}), ...(overrides.props ?? {}) },
      children: overrides.children ?? def.defaultChildren,
      animation: overrides.animation ?? (def.animations?.default ? { preset: def.animations.default } : undefined),
      ...overrides,
    };
    const { node } = this.normalize(input);
    return node;
  }

  /**
   * Normalize untrusted input (AI output, imports): assign ids, apply defaults,
   * validate types/variants/props/children. Invalid props fall back to defaults
   * and are reported, so a single bad prop never breaks a whole generation.
   */
  normalize(input: NodeInput, path = 'root', seen = new Set<string>()): { node: Node; issues: NodeIssue[] } {
    const issues: NodeIssue[] = [];
    let id = input.id && !seen.has(input.id) ? input.id : createId();
    seen.add(id);
    const def = this.defs.get(input.type);
    if (!def) {
      issues.push({ nodeId: id, path, type: input.type, message: `Unknown component type "${input.type}"`, severity: 'error' });
      return { node: { id, type: input.type, props: input.props ?? {} }, issues };
    }
    let variant = input.variant;
    if (def.variants?.length) {
      if (!variant || !def.variants.some((v) => v.id === variant)) {
        if (variant) issues.push({ nodeId: id, path, type: input.type, message: `Unknown variant "${variant}", using "${def.defaultVariant}"`, severity: 'warning' });
        variant = def.defaultVariant ?? def.variants[0]!.id;
      }
    } else variant = undefined;

    let props: Record<string, unknown>;
    const parsed = this.parseProps(input.type, input.props);
    if (parsed.success) props = parsed.data;
    else {
      // retry prop-by-prop, dropping offending keys
      const clean: Record<string, unknown> = { ...(input.props ?? {}) };
      for (const issue of parsed.issues ?? []) {
        const key = issue.path[0];
        if (typeof key === 'string') delete clean[key];
      }
      const retry = this.parseProps(input.type, clean);
      props = retry.success ? retry.data : ((def.props.safeParse(def.defaultProps ?? {}).data as Record<string, unknown>) ?? {});
      issues.push({ nodeId: id, path, type: input.type, message: `Invalid props: ${parsed.error}`, severity: 'warning' });
    }

    let children: Node[] | undefined;
    if (input.children?.length) {
      if (def.children === false || def.children === undefined) {
        issues.push({ nodeId: id, path, type: input.type, message: `"${input.type}" does not accept children; they were removed`, severity: 'warning' });
      } else {
        children = [];
        input.children.forEach((child, i) => {
          const allowed = def.children && def.children.allowed;
          if (allowed && allowed !== 'any' && !allowed.includes(child.type)) {
            issues.push({ path: `${path}.children[${i}]`, type: child.type, message: `"${child.type}" is not allowed inside "${input.type}"`, severity: 'warning' });
            return;
          }
          const res = this.normalize(child, `${path}.children[${i}]`, seen);
          issues.push(...res.issues);
          if (this.has(child.type)) children!.push(res.node);
        });
      }
    } else if (def.children && def.children.min && def.defaultChildren) {
      children = def.defaultChildren.map((c, i) => this.normalize(c, `${path}.children[${i}]`, seen).node);
    }

    const node: Node = { id, type: input.type, props };
    if (variant) node.variant = variant;
    if (input.name) node.name = input.name;
    if (input.style) node.style = input.style;
    if (input.animation && input.animation.preset !== 'none') node.animation = input.animation;
    if (input.visibility) node.visibility = input.visibility;
    if (input.binding) {
      if (def.bindable) node.binding = input.binding;
      else issues.push({ nodeId: id, path, type: input.type, message: `"${input.type}" cannot bind to collections`, severity: 'warning' });
    }
    if (children) node.children = children;
    if (input.locked) node.locked = true;
    if (input.hidden) node.hidden = true;
    if (input.customCss) node.customCss = input.customCss;
    if (input.anchor) node.anchor = input.anchor;
    if (input.translations) node.translations = input.translations;
    if (input.ref) node.ref = input.ref;
    return { node, issues };
  }

  /** Validate an existing (already normalized) node tree. */
  validate(nodes: Node[], path = 'sections'): NodeIssue[] {
    const issues: NodeIssue[] = [];
    nodes.forEach((n, i) => {
      const p = `${path}[${i}]`;
      const def = this.defs.get(n.type);
      if (!def) {
        issues.push({ nodeId: n.id, path: p, type: n.type, message: `Missing component "${n.type}"`, severity: 'error' });
        return;
      }
      if (def.variants?.length && n.variant && !def.variants.some((v) => v.id === n.variant)) {
        issues.push({ nodeId: n.id, path: p, type: n.type, message: `Unknown variant "${n.variant}"`, severity: 'error' });
      }
      const parsed = this.parseProps(n.type, n.props);
      if (!parsed.success) issues.push({ nodeId: n.id, path: p, type: n.type, message: parsed.error, severity: 'error' });
      if (n.children?.length) issues.push(...this.validate(n.children, `${p}.children`));
    });
    return issues;
  }

  /** JSON Schema for a component's props (for AI tool definitions and docs). */
  jsonSchema(type: string): Record<string, unknown> | undefined {
    const def = this.defs.get(type);
    if (!def) return undefined;
    return z.toJSONSchema(def.props, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  }

  /** Compact catalog for AI planning prompts (no full schemas — fetch per component). */
  catalog() {
    return this.list()
      .filter((d) => !d.hidden)
      .map((d) => ({
        type: d.type,
        name: d.name,
        category: d.category,
        level: d.level,
        description: d.description,
        variants: d.variants?.map((v) => ({ id: v.id, description: v.description })),
        acceptsChildren: d.children ? (d.children.allowed === 'any' ? 'any' : d.children.allowed) : false,
        bindable: !!d.bindable,
        recommendedAnimations: d.animations?.recommended,
        useWhen: d.ai?.useWhen,
        avoidWhen: d.ai?.avoidWhen,
      }));
  }
}
