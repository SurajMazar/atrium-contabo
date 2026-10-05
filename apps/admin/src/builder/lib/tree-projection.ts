import type { Accepts } from './rules';

export interface ProjectableRow {
  id: string;
  type: string;
  depth: number;
  parentId: string | null;
}

export interface Projection {
  depth: number;
  parentId: string | null;
  parentType: string | null;
  /** Position among the new parent's children after the move. */
  index: number;
  valid: boolean;
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

/**
 * Sortable-tree projection (dnd-kit pattern): where would the active row land
 * given the row it is over and the horizontal drag offset (indentation)?
 * `rows` must already exclude the active row's descendants.
 */
export function projectTreeDrop(
  rows: ProjectableRow[],
  activeId: string,
  overId: string,
  offsetX: number,
  indent: number,
  accepts: Accepts,
  acceptsChildren: (type: string) => boolean,
): Projection | null {
  const activeIndex = rows.findIndex((r) => r.id === activeId);
  const overIndex = rows.findIndex((r) => r.id === overId);
  if (activeIndex < 0 || overIndex < 0) return null;
  const active = rows[activeIndex]!;
  const moved = arrayMove(rows, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const projected = active.depth + Math.round(offsetX / indent);
  const maxDepth = previous ? (acceptsChildren(previous.type) ? previous.depth + 1 : previous.depth) : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, projected));

  let parentId: string | null = null;
  let parentType: string | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth) parentId = previous.parentId;
    else if (depth > previous.depth) parentId = previous.id;
    else parentId = moved.slice(0, overIndex).reverse().find((r) => r.depth === depth)?.parentId ?? null;
    parentType = parentId ? (moved.find((r) => r.id === parentId)?.type ?? null) : null;
  }
  let index = 0;
  for (let i = 0; i < overIndex; i++) {
    const r = moved[i]!;
    if (r.parentId === parentId && r.depth === depth) index++;
  }
  return { depth, parentId, parentType, index, valid: accepts(parentType, active.type) };
}

/**
 * Convert a post-move sibling position into `moveNode`'s pre-removal index
 * (moveNode subtracts one when moving down within the same list).
 */
export function toMoveIndex(projection: Pick<Projection, 'parentId' | 'index'>, original: { parentId: string | null; index: number }): number {
  if (projection.parentId === original.parentId && projection.index >= original.index) return projection.index + 1;
  return projection.index;
}
