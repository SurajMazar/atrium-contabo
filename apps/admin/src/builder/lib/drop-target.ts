import type { Accepts } from './rules';

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * One node under the pointer, as reported by the canvas hit-test. Candidates
 * are ordered innermost first (the hit node, then each ancestor up to root).
 */
export interface DropCandidate {
  id: string;
  type: string;
  parentId: string | null;
  /** Type of the logical parent; `null` = page root. */
  parentType: string | null;
  /** Index among siblings. */
  index: number;
  childCount: number;
  rect: Rect;
  /** Layout direction of the list this node sits in (decides top/bottom vs left/right edges). */
  axis: 'vertical' | 'horizontal';
  locked?: boolean;
}

export interface DropPayloadInfo {
  /** Component type being dropped (for moves: the moving node's type). */
  type: string;
  /** Set when reordering an existing node. */
  movingId?: string;
}

export interface DropResolveInput {
  candidates: DropCandidate[];
  /** Pointer is over an empty container placeholder (`[data-drop-zone]`). */
  zone?: { parentId: string; parentType: string } | null;
  pointer: { x: number; y: number };
  payload: DropPayloadInfo;
  accepts: Accepts;
  /** For moves: true when `id` is the moving node or one of its descendants. */
  isWithinMoving?: (id: string) => boolean;
  /** Fraction of a container's size treated as before/after edge (default 0.25). */
  edge?: number;
}

export interface DropTarget {
  parentId: string | null;
  index: number;
  position: 'before' | 'after' | 'inside';
  /** Node the indicator is drawn against (sibling for before/after, container for inside). */
  refId: string | null;
  axis: 'vertical' | 'horizontal';
}

/**
 * Pure drop-target resolution. Walks from the innermost hit node outwards and
 * returns the first placement allowed by registry child rules:
 *  - over an empty drop zone → inside that parent;
 *  - container that accepts the payload and pointer is in its middle band (or it is empty) → inside, appended;
 *  - otherwise before/after the candidate depending on the nearest edge, if its parent accepts the payload;
 *  - else continue with the ancestor.
 */
export function resolveDropTarget(input: DropResolveInput): DropTarget | null {
  const { candidates, zone, pointer, payload, accepts } = input;
  const edge = input.edge ?? 0.25;
  const within = (id: string) => (payload.movingId ? (input.isWithinMoving?.(id) ?? id === payload.movingId) : false);

  if (zone && !within(zone.parentId) && accepts(zone.parentType, payload.type)) {
    return { parentId: zone.parentId, index: 0, position: 'inside', refId: zone.parentId, axis: 'vertical' };
  }

  for (const c of candidates) {
    if (within(c.id) || c.locked) continue;
    const vertical = c.axis === 'vertical';
    const size = vertical ? c.rect.height : c.rect.width;
    const offset = vertical ? pointer.y - c.rect.top : pointer.x - c.rect.left;
    const ratio = size > 0 ? Math.min(1, Math.max(0, offset / size)) : 0.5;

    const canInside = accepts(c.type, payload.type);
    const canSibling = accepts(c.parentType, payload.type);

    if (canInside && (c.childCount === 0 || !canSibling || (ratio > edge && ratio < 1 - edge))) {
      const index = !canSibling && ratio < 0.5 && c.childCount > 0 && ratio <= edge ? 0 : c.childCount;
      return { parentId: c.id, index, position: 'inside', refId: c.id, axis: c.axis };
    }
    if (canSibling) {
      const after = ratio >= 0.5;
      return { parentId: c.parentId, index: c.index + (after ? 1 : 0), position: after ? 'after' : 'before', refId: c.id, axis: c.axis };
    }
  }
  return null;
}

/** True when moving a node to this target would leave it where it already is. */
export function isNoopMove(target: DropTarget, current: { parentId: string | null; index: number }): boolean {
  if (target.parentId !== current.parentId) return false;
  return target.index === current.index || target.index === current.index + 1;
}
