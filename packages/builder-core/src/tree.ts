import { createId, type Node } from '@atrium/schema';

export interface NodeLocation {
  node: Node;
  parent: Node | null;
  list: Node[];
  index: number;
  depth: number;
}

export function findNode(nodes: Node[], id: string, parent: Node | null = null, depth = 0): NodeLocation | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.id === id) return { node, parent, list: nodes, index: i, depth };
    if (node.children?.length) {
      const hit = findNode(node.children, id, node, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Path of ancestor ids from root to the node (inclusive). */
export function nodePath(nodes: Node[], id: string): string[] {
  const walk = (list: Node[], trail: string[]): string[] | null => {
    for (const n of list) {
      if (n.id === id) return [...trail, n.id];
      if (n.children) {
        const r = walk(n.children, [...trail, n.id]);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}

export function isDescendant(nodes: Node[], ancestorId: string, id: string): boolean {
  const loc = findNode(nodes, ancestorId);
  return !!loc?.node.children && !!findNode(loc.node.children, id);
}

/** JSON deep clone — safe on immer drafts (structuredClone is not). Schema data is JSON by design. */
export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep clone with fresh ids for the node and all descendants. */
export function cloneWithNewIds(node: Node): Node {
  const copy: Node = jsonClone(node);
  const reid = (n: Node) => {
    n.id = createId();
    n.children?.forEach(reid);
  };
  reid(copy);
  return copy;
}

/** Resolve the child list for a parent id (null = page root). Creates `children` if needed. */
export function childList(nodes: Node[], parentId: string | null): Node[] | null {
  if (parentId === null) return nodes;
  const loc = findNode(nodes, parentId);
  if (!loc) return null;
  loc.node.children ??= [];
  return loc.node.children;
}

export function insertNode(nodes: Node[], node: Node, parentId: string | null, index?: number): void {
  const list = childList(nodes, parentId);
  if (!list) throw new Error(`Parent ${parentId} not found`);
  const at = index === undefined || index < 0 || index > list.length ? list.length : index;
  list.splice(at, 0, node);
}

export function insertRelative(nodes: Node[], node: Node, refId: string, position: 'before' | 'after' | 'inside'): void {
  if (position === 'inside') return insertNode(nodes, node, refId);
  const loc = findNode(nodes, refId);
  if (!loc) throw new Error(`Node ${refId} not found`);
  loc.list.splice(position === 'before' ? loc.index : loc.index + 1, 0, node);
}

export function removeNode(nodes: Node[], id: string): Node | null {
  const loc = findNode(nodes, id);
  if (!loc) return null;
  const [removed] = loc.list.splice(loc.index, 1);
  return removed ?? null;
}

export function moveNode(nodes: Node[], id: string, parentId: string | null, index: number): void {
  if (parentId === id || (parentId && isDescendant(nodes, id, parentId))) throw new Error('Cannot move a node into itself');
  const loc = findNode(nodes, id);
  if (!loc) throw new Error(`Node ${id} not found`);
  const sameList = (parentId === null && loc.parent === null) || loc.parent?.id === parentId;
  const node = loc.list.splice(loc.index, 1)[0]!;
  const target = childList(nodes, parentId);
  if (!target) throw new Error(`Parent ${parentId} not found`);
  const adjusted = sameList && index > loc.index ? index - 1 : index;
  target.splice(Math.max(0, Math.min(adjusted, target.length)), 0, node);
}

export function duplicateNode(nodes: Node[], id: string): Node {
  const loc = findNode(nodes, id);
  if (!loc) throw new Error(`Node ${id} not found`);
  const copy = cloneWithNewIds(loc.node);
  if (copy.name) copy.name = `${copy.name} copy`;
  loc.list.splice(loc.index + 1, 0, copy);
  return copy;
}

/** Wrap a node in a new container node (group). */
export function wrapNode(nodes: Node[], id: string, wrapper: Node): void {
  const loc = findNode(nodes, id);
  if (!loc) throw new Error(`Node ${id} not found`);
  wrapper.children = [loc.node];
  loc.list.splice(loc.index, 1, wrapper);
}

/** Replace a node with its children (ungroup). */
export function unwrapNode(nodes: Node[], id: string): void {
  const loc = findNode(nodes, id);
  if (!loc) throw new Error(`Node ${id} not found`);
  loc.list.splice(loc.index, 1, ...(loc.node.children ?? []));
}

export function countNodes(nodes: Node[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children ?? []), 0);
}

// ── object path helpers (for inspector controls like `cta.label`) ──

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge `patch` into `target` in place. Arrays replace; `null` deletes. */
export function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete target[k];
    else if (isPlainObject(v) && isPlainObject(target[k])) deepMerge(target[k] as Record<string, unknown>, v);
    else target[k] = v;
  }
  return target;
}
