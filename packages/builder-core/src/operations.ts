import type { ComponentRegistry } from '@atrium/component-registry';
import {
  AnimationSchema, FormDefinitionSchema, formRuleLimitIssue, NavItemSchema, NodeInputSchema, PageInputSchema, PageSeoSchema, RedirectSchema,
  StyleSchema, createId, setResponsive, slugify, type Breakpoint, type WebsiteDefinition,
} from '@atrium/schema';
import { z } from 'zod';
import { normalizePage } from './normalize';
import { cloneWithNewIds, deepMerge, findNode, insertNode, jsonClone, moveNode, OperationError, removeNode, setPath } from './tree';

/**
 * Serializable site operations. The visual builder, the REST API and AI agent
 * tools all express edits as these operations, so every change — human or AI —
 * flows through one validated code path and can be logged, diffed and undone.
 */
const nodeTarget = { pageId: z.string().describe('Page id, or "header" / "footer" / "global:<id>" for site-level trees') };

export const SiteOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('addNode'), ...nodeTarget, parentId: z.string().nullable().default(null), index: z.number().int().optional(), node: NodeInputSchema }),
  z.object({
    op: z.literal('updateNode'), ...nodeTarget, nodeId: z.string(),
    props: z.record(z.string(), z.unknown()).optional().describe('Shallow-merged into props; use null to remove a prop'),
    style: StyleSchema.optional(),
    variant: z.string().optional(),
    animation: AnimationSchema.nullable().optional(),
    name: z.string().optional(),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    anchor: z.string().nullable().optional(),
    customCss: z.string().nullable().optional(),
  }),
  z.object({ op: z.literal('setProp'), ...nodeTarget, nodeId: z.string(), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('setStyle'), ...nodeTarget, nodeId: z.string(), key: z.string(), breakpoint: z.enum(['base', 'laptop', 'tablet', 'mobile']).default('base'), value: z.unknown() }),
  z.object({ op: z.literal('replaceNode'), ...nodeTarget, nodeId: z.string(), node: NodeInputSchema }),
  z.object({ op: z.literal('moveNode'), ...nodeTarget, nodeId: z.string(), parentId: z.string().nullable(), index: z.number().int() }),
  z.object({ op: z.literal('removeNode'), ...nodeTarget, nodeId: z.string() }),
  z.object({ op: z.literal('duplicateNode'), ...nodeTarget, nodeId: z.string() }),
  z.object({ op: z.literal('createPage'), page: PageInputSchema, index: z.number().int().optional() }),
  z.object({
    op: z.literal('updatePage'), pageId: z.string(),
    patch: z.object({ title: z.string().optional(), slug: z.string().optional(), status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional(), seo: PageSeoSchema.partial().optional(), layout: z.object({ header: z.enum(['default', 'transparent', 'hidden']).optional(), footer: z.enum(['default', 'hidden']).optional() }).optional(), customCss: z.string().optional(), isHomepage: z.boolean().optional() }),
  }),
  z.object({ op: z.literal('deletePage'), pageId: z.string() }),
  z.object({ op: z.literal('duplicatePage'), pageId: z.string(), title: z.string().optional(), slug: z.string().optional() }),
  z.object({ op: z.literal('updateTheme'), patch: z.record(z.string(), z.unknown()).describe('Deep-merged into theme tokens') }),
  z.object({ op: z.literal('updateSettings'), patch: z.record(z.string(), z.unknown()).describe('Deep-merged into site settings') }),
  z.object({ op: z.literal('setMenu'), menu: z.string(), items: z.array(NavItemSchema.or(z.object({ label: z.string() }).passthrough())) }),
  z.object({ op: z.literal('createForm'), form: FormDefinitionSchema.extend({ id: z.string().optional() }) }),
  z.object({ op: z.literal('updateForm'), formId: z.string(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('deleteForm'), formId: z.string() }),
  z.object({ op: z.literal('setRedirects'), redirects: z.array(RedirectSchema.extend({ id: z.string().optional() })) }),
  z.object({ op: z.literal('setCustomCss'), css: z.string() }),
]);
export type SiteOperation = z.input<typeof SiteOperationSchema>;
type ParsedOp = z.output<typeof SiteOperationSchema>;

export interface ApplyResult {
  /** Id of a created node/page/form, when applicable. */
  createdId?: string;
  warnings: string[];
}

// One error class for every builder-core failure (tree helpers throw it too).
export { OperationError };

function treeFor(def: WebsiteDefinition, pageId: string) {
  if (pageId === 'header') return [def.header];
  if (pageId === 'footer') return [def.footer];
  if (pageId.startsWith('global:')) {
    const g = def.globalSections.find((x) => x.id === pageId.slice(7));
    if (!g) throw new OperationError(`Global section ${pageId} not found`);
    return [g.node];
  }
  const page = def.pages.find((p) => p.id === pageId);
  if (!page) throw new OperationError(`Page ${pageId} not found`);
  return page.sections;
}

/**
 * Apply one operation to a mutable WebsiteDefinition draft (use inside immer
 * `produce`/`produceWithPatches`). Validates via schemas and the registry.
 */
export function applyOperation(def: WebsiteDefinition, rawOp: SiteOperation, registry: ComponentRegistry): ApplyResult {
  const op = SiteOperationSchema.parse(rawOp) as ParsedOp;
  const warnings: string[] = [];
  switch (op.op) {
    case 'addNode': {
      const tree = treeFor(def, op.pageId);
      const { node, issues } = registry.normalize(op.node);
      issues.forEach((i) => warnings.push(`${i.type}: ${i.message}`));
      if (!registry.has(node.type)) throw new OperationError(`Unknown component "${op.node.type}"`);
      if (op.parentId) {
        const parent = findNode(tree, op.parentId);
        if (!parent) throw new OperationError(`Parent ${op.parentId} not found`);
        const pdef = registry.get(parent.node.type);
        if (!pdef?.children) throw new OperationError(`"${parent.node.type}" does not accept children`);
        if (pdef.children.allowed !== 'any' && !pdef.children.allowed.includes(node.type)) throw new OperationError(`"${node.type}" is not allowed inside "${parent.node.type}"`);
      } else if (registry.get(node.type)?.level !== 'section' && !['header', 'footer'].includes(op.pageId)) {
        throw new OperationError(`"${node.type}" is not a section; add it inside a section or container`);
      }
      insertNode(tree, node, op.parentId ?? null, op.index);
      return { createdId: node.id, warnings };
    }
    case 'updateNode': {
      const loc = findNode(treeFor(def, op.pageId), op.nodeId);
      if (!loc) throw new OperationError(`Node ${op.nodeId} not found`);
      const n = loc.node;
      if (op.props) {
        const next = { ...n.props };
        for (const [k, v] of Object.entries(op.props)) v === null ? delete next[k] : (next[k] = v);
        const parsed = registry.parseProps(n.type, next);
        if (!parsed.success) throw new OperationError(`Invalid props for ${n.type}: ${parsed.error}`);
        n.props = parsed.data;
      }
      if (op.style) n.style = deepMerge((n.style ?? {}) as Record<string, unknown>, op.style as Record<string, unknown>) as typeof n.style;
      if (op.variant !== undefined) {
        const variants = registry.get(n.type)?.variants;
        if (!variants?.some((v) => v.id === op.variant)) throw new OperationError(`Unknown variant "${op.variant}" for ${n.type}`);
        n.variant = op.variant;
      }
      if (op.animation === null) delete n.animation;
      else if (op.animation) n.animation = op.animation;
      if (op.name !== undefined) n.name = op.name;
      if (op.hidden !== undefined) n.hidden = op.hidden || undefined;
      if (op.locked !== undefined) n.locked = op.locked || undefined;
      if (op.anchor !== undefined) op.anchor === null ? delete n.anchor : (n.anchor = op.anchor);
      if (op.customCss !== undefined) op.customCss === null ? delete n.customCss : (n.customCss = op.customCss);
      return { warnings };
    }
    case 'setProp': {
      const loc = findNode(treeFor(def, op.pageId), op.nodeId);
      if (!loc) throw new OperationError(`Node ${op.nodeId} not found`);
      const next = jsonClone(loc.node.props);
      setPath(next, op.path, op.value);
      const parsed = registry.parseProps(loc.node.type, next);
      if (!parsed.success) throw new OperationError(`Invalid value for ${op.path}: ${parsed.error}`);
      loc.node.props = parsed.data;
      return { warnings };
    }
    case 'setStyle': {
      const loc = findNode(treeFor(def, op.pageId), op.nodeId);
      if (!loc) throw new OperationError(`Node ${op.nodeId} not found`);
      const style = (loc.node.style ?? {}) as Record<string, unknown>;
      const next = setResponsive(style[op.key] as never, op.breakpoint as Breakpoint, op.value as never);
      if (next === undefined) delete style[op.key];
      else style[op.key] = next;
      const parsed = StyleSchema.safeParse(style);
      if (!parsed.success) throw new OperationError(`Invalid style ${op.key}`);
      // The sanitizing schema drops unsafe values: refuse them instead of storing them, and persist the parsed result.
      const clean = parsed.data as Record<string, unknown>;
      if (droppedBySanitizer(next, clean[op.key])) throw new OperationError(`Unsafe value for style ${op.key}`);
      loc.node.style = Object.keys(clean).length ? (clean as typeof loc.node.style) : undefined;
      return { warnings };
    }
    case 'replaceNode': {
      const loc = findNode(treeFor(def, op.pageId), op.nodeId);
      if (!loc) throw new OperationError(`Node ${op.nodeId} not found`);
      const { node, issues } = registry.normalize({ ...op.node, id: op.node.id ?? op.nodeId });
      issues.forEach((i) => warnings.push(`${i.type}: ${i.message}`));
      loc.list[loc.index] = node;
      return { createdId: node.id, warnings };
    }
    case 'moveNode':
      moveNode(treeFor(def, op.pageId), op.nodeId, op.parentId, op.index);
      return { warnings };
    case 'removeNode':
      if (!removeNode(treeFor(def, op.pageId), op.nodeId)) throw new OperationError(`Node ${op.nodeId} not found`);
      return { warnings };
    case 'duplicateNode': {
      const loc = findNode(treeFor(def, op.pageId), op.nodeId);
      if (!loc) throw new OperationError(`Node ${op.nodeId} not found`);
      const copy = cloneWithNewIds(loc.node);
      loc.list.splice(loc.index + 1, 0, copy);
      return { createdId: copy.id, warnings };
    }
    case 'createPage': {
      const { value: page, issues } = normalizePage(op.page, registry);
      issues.forEach((i) => warnings.push(`${i.type}: ${i.message}`));
      if (!page.isHomepage && !page.slug) page.slug = slugify(page.title);
      if (def.pages.some((p) => p.slug === page.slug)) throw new OperationError(`A page with slug "/${page.slug}" already exists`);
      if (page.isHomepage) def.pages.forEach((p) => (p.isHomepage = false));
      def.pages.splice(op.index ?? def.pages.length, 0, page);
      return { createdId: page.id, warnings };
    }
    case 'updatePage': {
      const page = def.pages.find((p) => p.id === op.pageId);
      if (!page) throw new OperationError(`Page ${op.pageId} not found`);
      const { seo, layout, isHomepage, slug, ...rest } = op.patch;
      Object.assign(page, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
      if (seo) page.seo = { ...page.seo, ...seo };
      if (layout) page.layout = { ...page.layout, ...layout };
      if (slug !== undefined && !page.isHomepage) {
        const clean = slug.replace(/^\/+|\/+$/g, '');
        if (def.pages.some((p) => p.id !== page.id && p.slug === clean)) throw new OperationError(`Slug "/${clean}" is taken`);
        page.slug = clean;
      }
      if (isHomepage) {
        const prev = def.pages.find((p) => p.isHomepage && p.id !== page.id);
        if (prev) {
          prev.isHomepage = false;
          prev.slug = slugify(prev.title) || createId();
        }
        page.isHomepage = true;
        page.slug = '';
      }
      return { warnings };
    }
    case 'deletePage': {
      const idx = def.pages.findIndex((p) => p.id === op.pageId);
      if (idx < 0) throw new OperationError(`Page ${op.pageId} not found`);
      if (def.pages[idx]!.isHomepage) throw new OperationError('Set another page as homepage before deleting this one');
      def.pages.splice(idx, 1);
      return { warnings };
    }
    case 'duplicatePage': {
      const src = def.pages.find((p) => p.id === op.pageId);
      if (!src) throw new OperationError(`Page ${op.pageId} not found`);
      const copy = jsonClone(src);
      copy.id = createId('pg');
      copy.isHomepage = false;
      copy.title = op.title ?? `${src.title} (copy)`;
      let slug = op.slug ?? `${src.slug || 'home'}-copy`;
      let n = 2;
      while (def.pages.some((p) => p.slug === slug)) slug = `${op.slug ?? `${src.slug || 'home'}-copy`}-${n++}`;
      copy.slug = slug;
      copy.status = 'draft';
      copy.sections = copy.sections.map(cloneWithNewIds);
      def.pages.push(copy);
      return { createdId: copy.id, warnings };
    }
    case 'updateTheme':
      deepMerge(def.theme as unknown as Record<string, unknown>, op.patch);
      return { warnings };
    case 'updateSettings':
      deepMerge(def.settings as unknown as Record<string, unknown>, op.patch);
      return { warnings };
    case 'setMenu': {
      const assign = (items: Array<Record<string, unknown>>): unknown[] => items.map((i) => ({ ...i, id: (i.id as string) || createId(), children: Array.isArray(i.children) ? assign(i.children as Array<Record<string, unknown>>) : undefined }));
      def.navigation.menus[op.menu] = z.array(NavItemSchema).parse(assign(op.items as Array<Record<string, unknown>>));
      return { warnings };
    }
    case 'createForm': {
      const form = FormDefinitionSchema.parse({ ...op.form, id: op.form.id ?? createId('form'), fields: op.form.fields.map((f) => ({ ...f, id: f.id || createId() })) });
      if (def.forms.some((f) => f.slug === form.slug)) throw new OperationError(`Form slug "${form.slug}" exists`);
      const tooBig = formRuleLimitIssue(form);
      if (tooBig) throw new OperationError(tooBig);
      def.forms.push(form);
      return { createdId: form.id, warnings };
    }
    case 'updateForm': {
      const idx = def.forms.findIndex((f) => f.id === op.formId);
      if (idx < 0) throw new OperationError(`Form ${op.formId} not found`);
      const merged = deepMerge(jsonClone(def.forms[idx]!) as unknown as Record<string, unknown>, op.patch);
      const next = FormDefinitionSchema.parse(merged);
      const tooBig = formRuleLimitIssue(next);
      if (tooBig) throw new OperationError(tooBig);
      def.forms[idx] = next;
      return { warnings };
    }
    case 'deleteForm':
      def.forms = def.forms.filter((f) => f.id !== op.formId);
      return { warnings };
    case 'setRedirects':
      def.redirects = op.redirects.map((r) => ({ ...r, id: r.id ?? createId() }));
      return { warnings };
    case 'setCustomCss':
      def.customCss = op.css;
      return { warnings };
  }
}

/** True when the sanitizing style schema removed a value (or a responsive breakpoint) that was set. */
function droppedBySanitizer(input: unknown, output: unknown): boolean {
  if (input === undefined || input === null) return false;
  if (output === undefined || output === null) return true;
  if (typeof input === 'object' && !Array.isArray(input)) {
    const out = output as Record<string, unknown>;
    return Object.entries(input as Record<string, unknown>).some(([k, v]) => v !== undefined && v !== null && droppedBySanitizer(v, out[k]));
  }
  return false;
}
