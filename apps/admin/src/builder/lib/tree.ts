import { findNode, type NodeLocation } from '@atrium/builder-core';
import type { Node, PageDocument, WebsiteDefinition } from '@atrium/schema';

/**
 * A tree target is what SiteOperation calls `pageId`: a page id, or
 * `header` / `footer` / `global:<id>` for site-level trees.
 */
export type TreeTarget = string;

export function getTree(def: WebsiteDefinition, target: TreeTarget): Node[] | null {
  if (target === 'header') return [def.header];
  if (target === 'footer') return [def.footer];
  if (target.startsWith('global:')) {
    const g = def.globalSections.find((x) => x.id === target.slice(7));
    return g ? [g.node] : null;
  }
  return def.pages.find((p) => p.id === target)?.sections ?? null;
}

export function getPage(def: WebsiteDefinition | null | undefined, pageId: string | null | undefined): PageDocument | undefined {
  if (!def || !pageId) return undefined;
  return def.pages.find((p) => p.id === pageId);
}

export interface Located {
  target: TreeTarget;
  loc: NodeLocation;
}

/** Find a node on the current page or in the header/footer trees. */
export function locate(def: WebsiteDefinition, pageId: string | null, nodeId: string): Located | null {
  if (pageId) {
    const page = def.pages.find((p) => p.id === pageId);
    if (page) {
      const loc = findNode(page.sections, nodeId);
      if (loc) return { target: pageId, loc };
    }
  }
  const h = findNode([def.header], nodeId);
  if (h) return { target: 'header', loc: h };
  const f = findNode([def.footer], nodeId);
  if (f) return { target: 'footer', loc: f };
  for (const g of def.globalSections) {
    const l = findNode([g.node], nodeId);
    if (l) return { target: `global:${g.id}`, loc: l };
  }
  return null;
}

export function findInDef(def: WebsiteDefinition | null, pageId: string | null, nodeId: string | null): Node | null {
  if (!def || !nodeId) return null;
  return locate(def, pageId, nodeId)?.loc.node ?? null;
}

export interface NodeMeta {
  id: string;
  type: string;
  parentId: string | null;
  parentType: string | null;
  index: number;
  childCount: number;
  depth: number;
  target: TreeTarget;
  /** Node or one of its ancestors is locked. */
  locked: boolean;
  hidden: boolean;
}

/** Flat index of every node of the page plus header/footer, for O(1) lookups from the canvas. */
export function buildNodeIndex(def: WebsiteDefinition, pageId: string | null): Map<string, NodeMeta> {
  const map = new Map<string, NodeMeta>();
  const walk = (nodes: Node[], parent: Node | null, target: TreeTarget, depth: number, lockedAncestor: boolean, root: boolean) => {
    nodes.forEach((n, index) => {
      const locked = lockedAncestor || !!n.locked;
      map.set(n.id, {
        id: n.id,
        type: n.type,
        parentId: root ? null : (parent?.id ?? null),
        parentType: root ? null : (parent?.type ?? null),
        index,
        childCount: n.children?.length ?? 0,
        depth,
        target,
        locked,
        hidden: !!n.hidden,
      });
      if (n.children?.length) walk(n.children, n, target, depth + 1, locked, false);
    });
  };
  const page = pageId ? def.pages.find((p) => p.id === pageId) : undefined;
  if (page) walk(page.sections, null, page.id, 0, false, true);
  walk([def.header], null, 'header', 0, false, true);
  walk([def.footer], null, 'footer', 0, false, true);
  // Content of referenced global sections is editable in place (saved to the global section).
  for (const g of def.globalSections ?? []) walk([g.node], null, `global:${g.id}`, 0, false, true);
  return map;
}

/** Is `id` equal to `ancestorId` or inside it? */
export function isSelfOrDescendant(index: Map<string, NodeMeta>, ancestorId: string, id: string): boolean {
  let cur: string | null = id;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = index.get(cur)?.parentId ?? null;
  }
  return false;
}

export interface FlatRow {
  id: string;
  node: Node;
  depth: number;
  parentId: string | null;
  index: number;
  hasChildren: boolean;
  target: TreeTarget;
}

/** Depth-first flattening for the layers panel, skipping collapsed subtrees. */
export function flattenTree(nodes: Node[], target: TreeTarget, collapsed: ReadonlySet<string>, depth = 0, parentId: string | null = null, out: FlatRow[] = []): FlatRow[] {
  nodes.forEach((node, index) => {
    const hasChildren = !!node.children?.length;
    out.push({ id: node.id, node, depth, parentId, index, hasChildren, target });
    if (hasChildren && !collapsed.has(node.id)) flattenTree(node.children!, target, collapsed, depth + 1, node.id, out);
  });
  return out;
}

export function nodeLabel(node: Node, registryName?: string): string {
  if (node.name) return node.name;
  const p = node.props as Record<string, unknown>;
  const text = [p.heading, p.text, p.label, p.title].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  const base = registryName ?? node.type;
  return text ? `${base} · ${text.replace(/[*_]/g, '').slice(0, 32)}` : base;
}

export { nodePath as nodePathTo } from '@atrium/builder-core';
