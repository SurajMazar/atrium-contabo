import { walkNodes, type Node, type WebsiteDefinition } from '@atrium/schema';

export interface ChangeSummary {
  kind: 'added' | 'removed' | 'modified';
  scope: 'page' | 'section' | 'node' | 'theme' | 'settings' | 'navigation' | 'form' | 'header' | 'footer';
  id: string;
  label: string;
  pageId?: string;
}

function index(nodes: Node[]) {
  const m = new Map<string, Node>();
  walkNodes(nodes, (n) => void m.set(n.id, n));
  return m;
}

const label = (n: Node) => n.name ?? (typeof n.props.heading === 'string' ? `${n.type}: ${n.props.heading}` : typeof n.props.text === 'string' ? `${n.type}: ${String(n.props.text).slice(0, 40)}` : n.type);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Human-readable summary of differences, used for AI change previews and version compare. */
export function diffWebsites(before: WebsiteDefinition, after: WebsiteDefinition): ChangeSummary[] {
  const out: ChangeSummary[] = [];
  const bPages = new Map(before.pages.map((p) => [p.id, p]));
  const aPages = new Map(after.pages.map((p) => [p.id, p]));
  for (const [id, p] of aPages) {
    const prev = bPages.get(id);
    if (!prev) {
      out.push({ kind: 'added', scope: 'page', id, label: p.title });
      continue;
    }
    if (prev.title !== p.title || prev.slug !== p.slug || !same(prev.seo, p.seo)) out.push({ kind: 'modified', scope: 'page', id, label: p.title });
    const bi = index(prev.sections);
    const ai = index(p.sections);
    const topIds = new Set(p.sections.map((s) => s.id));
    for (const [nid, n] of ai) {
      const old = bi.get(nid);
      const scope = topIds.has(nid) ? 'section' : 'node';
      if (!old) out.push({ kind: 'added', scope, id: nid, label: label(n), pageId: id });
      else if (!same({ ...old, children: undefined }, { ...n, children: undefined })) out.push({ kind: 'modified', scope, id: nid, label: label(n), pageId: id });
    }
    for (const [nid, n] of bi) if (!ai.has(nid)) out.push({ kind: 'removed', scope: prev.sections.some((s) => s.id === nid) ? 'section' : 'node', id: nid, label: label(n), pageId: id });
  }
  for (const [id, p] of bPages) if (!aPages.has(id)) out.push({ kind: 'removed', scope: 'page', id, label: p.title });
  if (!same(before.theme, after.theme)) out.push({ kind: 'modified', scope: 'theme', id: 'theme', label: 'Theme & design tokens' });
  if (!same(before.settings, after.settings)) out.push({ kind: 'modified', scope: 'settings', id: 'settings', label: 'Site settings' });
  if (!same(before.navigation, after.navigation)) out.push({ kind: 'modified', scope: 'navigation', id: 'navigation', label: 'Navigation' });
  if (!same(before.header, after.header)) out.push({ kind: 'modified', scope: 'header', id: 'header', label: 'Header' });
  if (!same(before.footer, after.footer)) out.push({ kind: 'modified', scope: 'footer', id: 'footer', label: 'Footer' });
  const bForms = new Map(before.forms.map((f) => [f.id, f]));
  for (const f of after.forms) {
    const prev = bForms.get(f.id);
    if (!prev) out.push({ kind: 'added', scope: 'form', id: f.id, label: f.name });
    else if (!same(prev, f)) out.push({ kind: 'modified', scope: 'form', id: f.id, label: f.name });
  }
  for (const f of before.forms) if (!after.forms.some((x) => x.id === f.id)) out.push({ kind: 'removed', scope: 'form', id: f.id, label: f.name });
  return out;
}
