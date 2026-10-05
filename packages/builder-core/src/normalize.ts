import type { ComponentRegistry, NodeIssue } from '@atrium/component-registry';
import {
  createId, slugify, WebsiteInputSchema, WebsiteDefinitionSchema, PageInputSchema, PageDocumentSchema,
  type NavItem, type Node, type NodeInput, type PageDocument, type PageInput, type WebsiteDefinition, type WebsiteInput,
} from '@atrium/schema';
import { z } from 'zod';

export interface NormalizeResult<T> {
  value: T;
  issues: NodeIssue[];
}

function normalizeNodes(nodes: NodeInput[], registry: ComponentRegistry, path: string, seen: Set<string>, issues: NodeIssue[], allowedLevels?: string[]): Node[] {
  const out: Node[] = [];
  nodes.forEach((n, i) => {
    const def = registry.get(n.type);
    if (def && allowedLevels && !allowedLevels.includes(def.level)) {
      issues.push({ path: `${path}[${i}]`, type: n.type, message: `"${n.type}" (${def.level}) cannot be placed at page root; wrapping in a section`, severity: 'warning' });
      const wrapped = registry.normalize({ type: 'section', props: {}, children: [n] }, `${path}[${i}]`, seen);
      issues.push(...wrapped.issues);
      out.push(wrapped.node);
      return;
    }
    const res = registry.normalize(n, `${path}[${i}]`, seen);
    issues.push(...res.issues);
    if (registry.has(n.type)) out.push(res.node);
  });
  return out;
}

function normalizeNav(items: NavItem[] | Array<Partial<NavItem> & { label: string }>): NavItem[] {
  return items.map((it) => ({ ...it, id: it.id || createId(), children: it.children ? normalizeNav(it.children) : undefined }) as NavItem);
}

export function normalizePage(input: PageInput, registry: ComponentRegistry, seen = new Set<string>()): NormalizeResult<PageDocument> {
  const issues: NodeIssue[] = [];
  const parsed = PageInputSchema.parse(input);
  const page: PageDocument = PageDocumentSchema.parse({
    ...parsed,
    id: parsed.id ?? createId('pg'),
    slug: parsed.isHomepage ? '' : parsed.slug.replace(/^\/+|\/+$/g, ''),
    sections: normalizeNodes(parsed.sections, registry, `pages.${parsed.slug || 'home'}.sections`, seen, issues, ['section']),
  });
  return { value: page, issues };
}

/**
 * Turn loose input (AI output, imports, blueprints) into a valid WebsiteDefinition.
 * Throws only on structurally invalid input; component-level problems become issues.
 */
export function normalizeWebsite(input: WebsiteInput, registry: ComponentRegistry): NormalizeResult<WebsiteDefinition> {
  const parsed = WebsiteInputSchema.parse(input);
  const issues: NodeIssue[] = [];
  const seen = new Set<string>();

  const usedSlugs = new Set<string>();
  const pages: PageDocument[] = [];
  let hasHome = false;
  for (const p of parsed.pages) {
    const res = normalizePage(p as PageInput, registry, seen);
    issues.push(...res.issues);
    const page = res.value;
    if (page.isHomepage || page.slug === '') {
      if (hasHome) {
        page.isHomepage = false;
        page.slug = page.slug || slugify(page.title) || createId();
      } else {
        hasHome = true;
        page.isHomepage = true;
        page.slug = '';
      }
    }
    let slug = page.slug;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${page.slug}-${n++}`;
    page.slug = slug;
    usedSlugs.add(slug);
    pages.push(page);
  }
  if (!hasHome && pages[0]) {
    pages[0].isHomepage = true;
    pages[0].slug = '';
  }

  const header = registry.normalize(parsed.header.type ? parsed.header : { type: 'site-header', props: {} }, 'header', seen);
  const footer = registry.normalize(parsed.footer.type ? parsed.footer : { type: 'site-footer', props: {} }, 'footer', seen);
  issues.push(...header.issues, ...footer.issues);

  const menus: Record<string, NavItem[]> = {};
  for (const [k, items] of Object.entries(parsed.navigation.menus)) menus[k] = normalizeNav(items);

  const definition = WebsiteDefinitionSchema.parse({
    schemaVersion: 1,
    settings: parsed.settings,
    theme: parsed.theme,
    navigation: { menus },
    header: header.node,
    footer: footer.node,
    globalSections: parsed.globalSections.map((g) => {
      const r = registry.normalize(g.node, `global.${g.name}`, seen);
      issues.push(...r.issues);
      return { id: g.id ?? createId('gs'), name: g.name, node: r.node };
    }),
    pages,
    forms: parsed.forms.map((f) => ({ ...f, id: f.id ?? createId('form'), fields: f.fields.map((fl) => ({ ...fl, id: fl.id || createId() })), rules: f.rules.map((r) => ({ ...r, id: r.id || createId() })) })),
    collections: parsed.collections.map((c) => ({ ...c, id: c.id ?? createId('col'), items: c.items.map((it) => ({ ...it, id: it.id || createId() })) })),
    redirects: parsed.redirects.map((r) => ({ ...r, id: r.id ?? createId() })),
    customCss: parsed.customCss,
  });
  return { value: definition, issues };
}

/** Zod error → readable string list (used when rejecting AI output). */
export function formatZodError(err: unknown): string[] {
  if (err instanceof z.ZodError) return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return [String(err)];
}
