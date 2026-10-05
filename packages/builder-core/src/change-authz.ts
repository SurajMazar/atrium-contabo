import { walkNodes, type Node, type PageDocument, type Permission, type WebsiteDefinition } from '@atrium/schema';

/**
 * Change-based authorization.
 *
 * Every write to a website draft (manual edits, generic operations, AI proposals,
 * version restores, imports into an existing site) is authorized by *what it
 * changes*, not by which endpoint it arrived through. The caller diffs the
 * before/after definitions with these helpers and checks the resulting
 * requirements against the actor's permissions. This closes the class of bugs
 * where a broad endpoint (e.g. `POST /operations` guarded by `page.update`)
 * could also change scripts, theme, forms or redirects.
 */
export interface ChangeRequirement {
  /** Satisfied when the actor holds ANY of these permissions. */
  anyOf: Permission[];
  /** Human-readable description of the change that needs it. */
  reason: string;
}

/** Component types whose props carry raw HTML / third-party code or frames. */
export const CODE_COMPONENT_TYPES = new Set(['embed']);

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return val;
  });
}

const same = (a: unknown, b: unknown) => a === b || stable(a) === stable(b);

const scriptText = (p: PageDocument | undefined) => [p?.scripts?.head?.trim() ?? '', p?.scripts?.body?.trim() ?? ''];

/** Content fingerprints of code-bearing nodes (set semantics: moving/duplicating existing code is not new code). */
function codeFingerprints(roots: Node[], into = new Set<string>()): Set<string> {
  walkNodes(roots, (n) => {
    if (CODE_COMPONENT_TYPES.has(n.type)) into.add(stable({ type: n.type, variant: n.variant, props: n.props }));
  });
  return into;
}

/** Page- and node-level custom CSS (any CSS can restyle or overlay the whole page). */
function cssFingerprints(roots: Node[], into = new Set<string>()): Set<string> {
  walkNodes(roots, (n) => {
    const css = n.customCss?.trim();
    if (css) into.add(css);
  });
  return into;
}

interface KnownCode {
  nodes: Set<string>;
  scripts: Set<string>;
  css: Set<string>;
}

function siteCode(def: WebsiteDefinition): KnownCode {
  const nodes = new Set<string>();
  const css = new Set<string>();
  for (const roots of [[def.header, def.footer], ...def.globalSections.map((g) => [g.node]), ...def.pages.map((p) => p.sections)]) {
    codeFingerprints(roots, nodes);
    cssFingerprints(roots, css);
  }
  const scripts = new Set<string>();
  def.pages.forEach((p) => {
    scriptText(p).forEach((s) => s && scripts.add(s));
    if (p.customCss?.trim()) css.add(p.customCss.trim());
  });
  return { nodes, scripts, css };
}

function introducesNew(after: Set<string>, before: Set<string>): boolean {
  for (const x of after) if (!before.has(x)) return true;
  return false;
}

function push(out: ChangeRequirement[], anyOf: Permission[], reason: string) {
  if (!out.some((r) => r.reason === reason)) out.push({ anyOf, reason });
}

/** Requirements for changing one page document (also used by the page autosave path). */
export function pageChangeRequirements(before: PageDocument | undefined, after: PageDocument | undefined, out: ChangeRequirement[] = [], known?: KnownCode): ChangeRequirement[] {
  if (!before && !after) return out;
  if (!before) push(out, ['page.create'], 'create a page');
  else if (!after) push(out, ['page.delete'], 'delete a page');
  else if (!same(before, after)) push(out, ['page.update'], 'edit a page');
  if (!after) return out;

  // Scheduling a page triggers an automatic publish of the whole site.
  const scheduled = after.status === 'scheduled' && (before?.status !== 'scheduled' || before?.publishAt !== after.publishAt);
  if (scheduled) push(out, ['page.publish'], 'schedule a page for publishing');

  const beforeScripts = known?.scripts ?? new Set(scriptText(before).filter(Boolean));
  if (scriptText(after).some((s) => s && !beforeScripts.has(s))) push(out, ['code.manage'], 'add or change page custom code');

  const beforeNodes = known?.nodes ?? codeFingerprints(before?.sections ?? []);
  if (introducesNew(codeFingerprints(after.sections), beforeNodes)) push(out, ['code.manage'], 'add or change an embed / custom HTML block');

  const beforeCss = known?.css ?? cssFingerprints(before?.sections ?? [], new Set(before?.customCss?.trim() ? [before.customCss.trim()] : []));
  const afterCss = cssFingerprints(after.sections, new Set(after.customCss?.trim() ? [after.customCss.trim()] : []));
  if (introducesNew(afterCss, beforeCss)) push(out, ['code.manage'], 'add or change custom CSS on a page or element');
  return out;
}

/** Requirements for turning website definition `before` into `after`. */
export function siteChangeRequirements(before: WebsiteDefinition, after: WebsiteDefinition): ChangeRequirement[] {
  const out: ChangeRequirement[] = [];
  if (before === after) return out;

  // settings: scripts → code.manage, seo → seo.manage|website.update, everything else → website.update
  if (!same(before.settings, after.settings)) {
    const { scripts: sa, seo: seoA, ...restA } = before.settings;
    const { scripts: sb, seo: seoB, ...restB } = after.settings;
    if (!same(sa ?? [], sb ?? [])) push(out, ['code.manage'], 'change site scripts');
    if (!same(seoA, seoB)) push(out, ['seo.manage', 'website.update'], 'change site SEO settings');
    if (!same(restA, restB)) push(out, ['website.update'], 'change site settings');
  }
  if ((before.customCss ?? '') !== (after.customCss ?? '')) push(out, ['code.manage'], 'change custom CSS');
  if (!same(before.theme, after.theme)) push(out, ['theme.update'], 'change the theme');
  if (!same(before.navigation, after.navigation) || !same(before.header, after.header) || !same(before.footer, after.footer)) push(out, ['navigation.update'], 'change navigation, header or footer');
  if (!same(before.globalSections, after.globalSections)) push(out, ['page.update'], 'change global sections');
  if (!same(before.redirects, after.redirects)) push(out, ['redirect.manage'], 'change redirects');

  // forms
  const formsA = new Map(before.forms.map((f) => [f.id, f]));
  const formsB = new Map(after.forms.map((f) => [f.id, f]));
  for (const [id, f] of formsB) {
    const prev = formsA.get(id);
    if (!prev) push(out, ['form.create'], 'create a form');
    else if (!same(prev, f)) push(out, ['form.update'], 'edit a form');
  }
  for (const id of formsA.keys()) if (!formsB.has(id)) push(out, ['form.delete'], 'delete a form');

  // collections: schema vs content
  const colA = new Map(before.collections.map((c) => [c.id, c]));
  const colB = new Map(after.collections.map((c) => [c.id, c]));
  for (const [id, c] of colB) {
    const prev = colA.get(id);
    const { items: itemsB, ...schemaB } = c;
    if (!prev) {
      push(out, ['collection.manage'], 'create a collection');
      continue;
    }
    const { items: itemsA, ...schemaA } = prev;
    if (!same(schemaA, schemaB)) push(out, ['collection.manage'], 'change a collection schema');
    if (!same(itemsA, itemsB)) push(out, ['collection.content'], 'change collection items');
  }
  for (const id of colA.keys()) if (!colB.has(id)) push(out, ['collection.manage'], 'delete a collection');

  // pages (+ code/scheduling inside pages, using site-wide "known code" so duplicating existing code is allowed)
  const known = siteCode(before);
  const pagesA = new Map(before.pages.map((p) => [p.id, p]));
  const pagesB = new Map(after.pages.map((p) => [p.id, p]));
  for (const [id, p] of pagesB) pageChangeRequirements(pagesA.get(id), p, out, known);
  for (const [id, p] of pagesA) if (!pagesB.has(id)) pageChangeRequirements(p, undefined, out);
  if (!same(before.pages.map((p) => p.id), after.pages.map((p) => p.id))) push(out, ['page.update'], 'reorder pages');

  // header/footer/global sections may also introduce embeds or element CSS
  const nodesAfter = new Set<string>();
  const cssAfter = new Set<string>();
  for (const roots of [[after.header, after.footer], ...after.globalSections.map((g) => [g.node])]) {
    codeFingerprints(roots, nodesAfter);
    cssFingerprints(roots, cssAfter);
  }
  if (introducesNew(nodesAfter, known.nodes)) push(out, ['code.manage'], 'add or change an embed / custom HTML block');
  if (introducesNew(cssAfter, known.css)) push(out, ['code.manage'], 'add or change custom CSS on a page or element');
  return out;
}

/** Requirements the actor does not satisfy. `*` grants everything (super-admin override). */
export function missingRequirements(reqs: ChangeRequirement[], granted: ReadonlySet<string>): ChangeRequirement[] {
  if (granted.has('*')) return [];
  return reqs.filter((r) => !r.anyOf.some((p) => granted.has(p)));
}
