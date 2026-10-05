import type { DragEvent } from 'react';
import { endDrag, startDrag, type DragPayload } from '../store/ui';

export const DRAG_MIME = 'application/x-atrium-drag';

/** HTML5 drag source props: the payload lives in the drag store (same-origin iframe shares JS memory). */
export function dragSourceProps(payload: () => DragPayload, enabled = true) {
  return {
    draggable: enabled,
    onDragStart: (e: DragEvent) => {
      if (!enabled) return e.preventDefault();
      const p = payload();
      startDrag(p);
      e.dataTransfer.effectAllowed = p.kind === 'move' ? 'move' : 'copy';
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: p.kind }));
      e.dataTransfer.setData('text/plain', p.kind === 'component' ? p.type : p.kind);
    },
    onDragEnd: () => endDrag(),
  };
}
