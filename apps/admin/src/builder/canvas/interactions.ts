'use client';

import { registry } from '@atrium/component-registry';
import type { WebsiteDefinition } from '@atrium/schema';
import { useEffect } from 'react';
import { applyDrop, applyMediaToNode, copyNode, cutNode, firstMediaControl, pasteNodes } from '../actions';
import { resolveDropTarget, isNoopMove, type DropCandidate, type DropTarget } from '../lib/drop-target';
import { makeAccepts } from '../lib/rules';
import { buildNodeIndex, isSelfOrDescendant, type NodeMeta } from '../lib/tree';
import { handleEditorKeyDown, isEditableTarget } from '../shortcuts';
import { useDocumentStore } from '../store/document';
import { canEdit } from '../store/editor';
import { endDrag, hover, select, selectZoom, setZoom, useDragStore, useSelectionStore, useUiStore, useViewportStore, type DragPayload } from '../store/ui';
import { nodeIdOf, useCanvasDom } from './dom';
import { finishInlineEdit, isInlineEditing, startInlineEdit } from './inline-edit';

const accepts = makeAccepts(registry);

let cached: { def: WebsiteDefinition | null; pageId: string | null; index: Map<string, NodeMeta> } = { def: null, pageId: null, index: new Map() };
/** Node index for the current page, recomputed only when the document changes. */
export function currentIndex(): Map<string, NodeMeta> {
  const { definition, pageId } = useDocumentStore.getState();
  if (cached.def !== definition || cached.pageId !== pageId) {
    cached = { def: definition, pageId, index: definition ? buildNodeIndex(definition, pageId) : new Map() };
  }
  return cached.index;
}

function closestNode(target: EventTarget | null): HTMLElement | null {
  const el = target as Element | null;
  if (!el || typeof (el as Element).closest !== 'function') return null;
  return el.closest<HTMLElement>('[data-node-id],[data-atrium-for]');
}

/** Nearest selectable (not locked) node element for an event target. */
function selectableNode(target: EventTarget | null): { el: HTMLElement; id: string } | null {
  const index = currentIndex();
  let el = closestNode(target);
  while (el) {
    const id = nodeIdOf(el);
    const meta = id ? index.get(id) : undefined;
    if (id && meta && !meta.locked) return { el, id };
    el = closestNode(el.parentElement);
  }
  return null;
}

function axisOf(el: Element, win: Window): 'vertical' | 'horizontal' {
  const parent = el.parentElement;
  if (!parent) return 'vertical';
  const cs = win.getComputedStyle(parent);
  if (cs.display.includes('flex')) return cs.flexDirection.startsWith('row') ? 'horizontal' : 'vertical';
  if (cs.display.includes('grid')) return cs.gridTemplateColumns.split(' ').filter((x) => x && x !== 'none').length > 1 ? 'horizontal' : 'vertical';
  return 'vertical';
}

function payloadType(p: DragPayload): string | null {
  if (p.kind === 'component') return p.type;
  if (p.kind === 'template') return p.node.type;
  if (p.kind === 'move') return p.type;
  if (p.kind === 'media') return registry.has('image') ? 'image' : null;
  return null;
}

export type CanvasDrop = { kind: 'place'; target: DropTarget } | { kind: 'media-replace'; nodeId: string };

/** Hit-test the canvas DOM under the pointer and resolve a drop. */
export function computeCanvasDrop(payload: DragPayload, targetEl: Element, x: number, y: number, win: Window): CanvasDrop | null {
  const index = currentIndex();
  const { pageId } = useDocumentStore.getState();

  if (payload.kind === 'media') {
    const hit = selectableNode(targetEl);
    if (hit) {
      const meta = index.get(hit.id);
      if (meta && firstMediaControl(meta.type)) return { kind: 'media-replace', nodeId: hit.id };
    }
  }
  const type = payloadType(payload);
  if (!type) return null;

  const zoneEl = targetEl.closest?.('[data-drop-zone]');
  let zone: { parentId: string; parentType: string } | null = null;
  if (zoneEl) {
    const parentId = zoneEl.getAttribute('data-parent-id');
    const meta = parentId ? index.get(parentId) : undefined;
    if (meta && meta.target === pageId && !meta.locked) zone = { parentId: meta.id, parentType: meta.type };
  }

  const candidates: DropCandidate[] = [];
  let el = closestNode(targetEl);
  while (el) {
    const id = nodeIdOf(el) ?? '';
    const meta = index.get(id);
    if (meta && meta.target === pageId) {
      const r = el.getBoundingClientRect();
      candidates.push({
        id, type: meta.type, parentId: meta.parentId, parentType: meta.parentType, index: meta.index, childCount: meta.childCount,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height }, axis: axisOf(el, win), locked: meta.locked,
      });
    }
    el = closestNode(el.parentElement);
  }

  // Pointer over empty canvas space (below the last section): append to the page.
  if (!candidates.length && !zone) {
    if (!accepts(null, type)) return null;
    const page = useDocumentStore.getState().definition?.pages.find((p) => p.id === pageId);
    const last = page?.sections[page.sections.length - 1];
    return { kind: 'place', target: { parentId: null, index: page?.sections.length ?? 0, position: last ? 'after' : 'inside', refId: last?.id ?? null, axis: 'vertical' } };
  }

  const movingId = payload.kind === 'move' ? payload.nodeId : undefined;
  const target = resolveDropTarget({
    candidates,
    zone,
    pointer: { x, y },
    payload: { type, movingId },
    accepts,
    isWithinMoving: movingId ? (id) => isSelfOrDescendant(index, movingId, id) : undefined,
  });
  if (!target) return null;
  if (movingId) {
    const m = index.get(movingId);
    if (m && isNoopMove(target, { parentId: m.parentId, index: m.index })) return null;
  }
  return { kind: 'place', target };
}

function indicatorFor(drop: CanvasDrop | null): ReturnType<typeof useDragStore.getState>['indicator'] {
  if (!drop) return null;
  if (drop.kind === 'media-replace') return { refId: drop.nodeId, position: 'inside', axis: 'vertical', label: 'Replace image' };
  return { refId: drop.target.refId, position: drop.target.position, axis: drop.target.axis };
}

function sameIndicator(a: DragStateIndicator, b: DragStateIndicator) {
  return a?.refId === b?.refId && a?.position === b?.position && a?.axis === b?.axis && a?.label === b?.label;
}
type DragStateIndicator = ReturnType<typeof useDragStore.getState>['indicator'];

/** Install native listeners on the iframe document (selection, hover, inline edit, DnD, keys, clipboard). */
export function useCanvasInteractions() {
  const doc = useCanvasDom((s) => s.doc);
  const win = useCanvasDom((s) => s.win);

  useEffect(() => {
    if (!doc || !win) return;

    let hoverFrame = 0;
    let pendingHover: string | null = null;
    const onPointerMove = (e: PointerEvent) => {
      if (useDragStore.getState().payload) return;
      const hit = selectableNode(e.target);
      pendingHover = hit?.id ?? null;
      if (!hoverFrame) {
        hoverFrame = win.requestAnimationFrame(() => {
          hoverFrame = 0;
          hover(pendingHover);
        });
      }
    };
    const onPointerLeave = () => hover(null);

    const onMouseDown = (e: MouseEvent) => {
      if (isInlineEditing() && (e.target as Element)?.closest?.('[data-atrium-editing]')) return;
      const t = e.target as HTMLElement;
      // Keep form controls inert: clicking selects instead of focusing.
      if (t?.closest?.('input,textarea,select,button,a,label,summary')) e.preventDefault();
    };

    const onClick = (e: MouseEvent) => {
      if (isInlineEditing() && (e.target as Element)?.closest?.('[data-atrium-editing]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (isInlineEditing()) finishInlineEdit(true);
      useUiStore.setState({ contextMenu: null });
      const hit = selectableNode(e.target);
      select(hit?.id ?? null);
      // Move keyboard focus out of iframe form controls but keep it in the document for shortcuts.
      (doc.activeElement as HTMLElement | null)?.blur?.();
    };

    const onDblClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const editEl = t?.closest?.<HTMLElement>('[data-edit-prop]');
      if (!editEl) return;
      const owner = closestNode(editEl);
      const id = owner ? nodeIdOf(owner) : null;
      if (!id) return;
      const meta = currentIndex().get(id);
      if (!meta || meta.locked) return;
      e.preventDefault();
      e.stopPropagation();
      select(id);
      startInlineEdit(editEl, id, editEl.getAttribute('data-edit-prop')!);
    };

    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onContextMenu = (e: MouseEvent) => {
      const hit = selectableNode(e.target);
      if (!hit) return;
      e.preventDefault();
      select(hit.id);
      const frame = useCanvasDom.getState().frame;
      const fr = frame?.getBoundingClientRect();
      const zoom = selectZoom(useViewportStore.getState());
      useUiStore.setState({ contextMenu: { x: (fr?.left ?? 0) + e.clientX * zoom, y: (fr?.top ?? 0) + e.clientY * zoom, nodeId: hit.id } });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      handleEditorKeyDown(e);
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const id = useSelectionStore.getState().selectedId;
      if (id) copyNode(id, e);
    };
    const onCut = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const id = useSelectionStore.getState().selectedId;
      if (id) cutNode(id, e);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (pasteNodes(e.clipboardData?.getData('text/plain'))) e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const current = selectZoom(useViewportStore.getState());
      setZoom(Math.round(Math.min(2, Math.max(0.1, current * (1 - e.deltaY * 0.01))) * 100) / 100);
    };

    // ── drag & drop (payload lives in the drag store: same-origin, shared JS memory)
    let lastDrop: CanvasDrop | null = null;
    const onDragOver = (e: DragEvent) => {
      const payload = useDragStore.getState().payload;
      if (!payload || !canEdit()) return;
      const drop = computeCanvasDrop(payload, e.target as Element, e.clientX, e.clientY, win);
      lastDrop = drop;
      if (drop) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = payload.kind === 'move' ? 'move' : 'copy';
      }
      const next = indicatorFor(drop);
      if (!sameIndicator(useDragStore.getState().indicator, next)) useDragStore.setState({ indicator: next });
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) useDragStore.setState({ indicator: null });
    };
    const onDrop = (e: DragEvent) => {
      const payload = useDragStore.getState().payload;
      if (!payload) return;
      e.preventDefault();
      const drop = computeCanvasDrop(payload, e.target as Element, e.clientX, e.clientY, win) ?? lastDrop;
      endDrag();
      if (!drop) return;
      if (drop.kind === 'media-replace' && payload.kind === 'media') applyMediaToNode(drop.nodeId, payload.media);
      else if (drop.kind === 'place') applyDrop(payload, drop.target);
    };

    doc.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.documentElement.addEventListener('pointerleave', onPointerLeave);
    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('dblclick', onDblClick, true);
    doc.addEventListener('submit', onSubmit, true);
    doc.addEventListener('contextmenu', onContextMenu, true);
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('copy', onCopy);
    doc.addEventListener('cut', onCut);
    doc.addEventListener('paste', onPaste);
    doc.addEventListener('wheel', onWheel, { passive: false });
    doc.addEventListener('dragover', onDragOver);
    doc.addEventListener('dragleave', onDragLeave);
    doc.addEventListener('drop', onDrop);
    return () => {
      if (hoverFrame) win.cancelAnimationFrame(hoverFrame);
      doc.removeEventListener('pointermove', onPointerMove);
      doc.documentElement.removeEventListener('pointerleave', onPointerLeave);
      doc.removeEventListener('mousedown', onMouseDown, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('dblclick', onDblClick, true);
      doc.removeEventListener('submit', onSubmit, true);
      doc.removeEventListener('contextmenu', onContextMenu, true);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('copy', onCopy);
      doc.removeEventListener('cut', onCut);
      doc.removeEventListener('paste', onPaste);
      doc.removeEventListener('wheel', onWheel);
      doc.removeEventListener('dragover', onDragOver);
      doc.removeEventListener('dragleave', onDragLeave);
      doc.removeEventListener('drop', onDrop);
    };
  }, [doc, win]);
}
