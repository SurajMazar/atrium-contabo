'use client';

import { registry } from '@atrium/component-registry';
import { ArrowDown, ArrowUp, CopyPlus, CornerLeftUp, GripVertical, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { DropdownMenu as M } from 'radix-ui';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { duplicateNode, insertSiblingOf, moveBy, removeNode, selectParent } from '../actions';
import { cn } from '../lib/cn';
import { findInDef } from '../lib/tree';
import { useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { endDrag, openLeft, selectZoom, startDrag, useDragStore, useSelectionStore, useUiStore, useViewportStore } from '../store/ui';
import { Icon, Menu, MenuContent, MenuItem, MenuTrigger } from '../ui/primitives';
import { nodeElement, useCanvasDom } from './dom';
import { currentIndex } from './interactions';
import { NodeMenuItems } from './node-menu';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}
interface Measured {
  hover: Box | null;
  selected: Box | null;
  padding: [number, number, number, number] | null;
  indicator: Box | null;
  /** The selected node is in the canvas but not rendered (e.g. a site script hides it on the published page). */
  hidden: boolean;
}

const EMPTY: Measured = { hover: null, selected: null, padding: null, indicator: null, hidden: false };

function boxOf(el: HTMLElement | null, zoom: number): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { top: r.top * zoom, left: r.left * zoom, width: r.width * zoom, height: r.height * zoom };
}

const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

/**
 * Editor chrome drawn in the parent document over the iframe. Rects come from
 * the iframe DOM and are re-measured (rAF-throttled) on scroll, resize,
 * mutations and renders.
 */
export const CanvasOverlay = memo(function CanvasOverlay() {
  const doc = useCanvasDom((s) => s.doc);
  const win = useCanvasDom((s) => s.win);
  const renderTick = useCanvasDom((s) => s.renderTick);
  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const editingId = useSelectionStore((s) => s.editingId);
  const indicator = useDragStore((s) => s.indicator);
  const dragging = useDragStore((s) => !!s.payload);
  const zoom = useViewportStore(selectZoom);
  const [m, setM] = useState<Measured>(EMPTY);
  const frame = useRef(0);

  const measure = useCallback(() => {
    frame.current = 0;
    if (!doc || !win) return setM(EMPTY);
    const sel = nodeElement(selectedId);
    const next: Measured = {
      hover: hoveredId && hoveredId !== selectedId ? boxOf(nodeElement(hoveredId), zoom) : null,
      selected: boxOf(sel, zoom),
      padding: null,
      indicator: indicator?.refId ? boxOf(nodeElement(indicator.refId), zoom) : null,
      hidden: false,
    };
    next.hidden = !!sel && !next.selected;
    if (sel && next.selected) {
      const cs = win.getComputedStyle(sel);
      next.padding = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => (parseFloat(v) || 0) * zoom) as Measured['padding'];
    }
    setM((prev) =>
      sameBox(prev.hover, next.hover) && sameBox(prev.selected, next.selected) && sameBox(prev.indicator, next.indicator) && String(prev.padding) === String(next.padding) && prev.hidden === next.hidden ? prev : next,
    );
  }, [doc, win, hoveredId, selectedId, indicator, zoom]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    measure();
  }, [measure, renderTick]);

  useEffect(() => {
    if (!doc || !win) return;
    win.addEventListener('scroll', schedule, { passive: true });
    win.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(doc.body);
    const sel = nodeElement(selectedId);
    if (sel) ro.observe(sel);
    const mo = new MutationObserver(schedule);
    mo.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
    // images/fonts loading shift layout without mutations
    doc.addEventListener('load', schedule, true);
    return () => {
      win.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', schedule);
      doc.removeEventListener('load', schedule, true);
      ro.disconnect();
      mo.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [doc, win, schedule, selectedId]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
      {m.hover && !dragging && <div className="absolute rounded-[1px] outline outline-1 outline-hover-outline" style={pos(m.hover)} />}
      {m.selected && selectedId && (
        <>
          {m.padding && !dragging && <PaddingGuides box={m.selected} padding={m.padding} />}
          <div className="absolute outline outline-[1.5px] outline-selection" style={pos(m.selected)} />
          {!dragging && !editingId && <SelectionChrome nodeId={selectedId} box={m.selected} />}
        </>
      )}
      {indicator && <DropIndicator box={m.indicator} position={indicator.position} axis={indicator.axis} label={indicator.label} />}
      {m.hidden && selectedId && !dragging && <HiddenNotice />}
    </div>
  );
});

/** The selection exists but is not rendered: say why, and offer the page without the site's scripts. */
function HiddenNotice() {
  const mirror = useCanvasDom((s) => s.scriptMirror);
  const scripts = useViewportStore((s) => s.siteScripts);
  const byScripts = scripts && mirror !== 'off';
  return (
    <div className="pointer-events-auto absolute left-1/2 top-2 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-muted shadow-md">
      <span>{byScripts ? 'This element is not shown on the published page: the site’s scripts hide or replace it.' : 'This element is not visible at this width.'}</span>
      {byScripts && (
        <button type="button" className="shrink-0 font-medium text-fg underline-offset-2 hover:underline" onClick={() => useViewportStore.setState({ siteScripts: false })}>
          Show without site scripts
        </button>
      )}
    </div>
  );
}

const pos = (b: Box): CSSProperties => ({ top: b.top, left: b.left, width: b.width, height: b.height });

function PaddingGuides({ box, padding: [t, r, b, l] }: { box: Box; padding: [number, number, number, number] }) {
  if (!t && !r && !b && !l) return null;
  const cls = 'absolute bg-selection/8 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgb(43_79_216/0.10)_4px_5px)]';
  return (
    <>
      {t > 0 && <div className={cls} style={{ top: box.top, left: box.left, width: box.width, height: t }} />}
      {b > 0 && <div className={cls} style={{ top: box.top + box.height - b, left: box.left, width: box.width, height: b }} />}
      {l > 0 && <div className={cls} style={{ top: box.top + t, left: box.left, width: l, height: Math.max(0, box.height - t - b) }} />}
      {r > 0 && <div className={cls} style={{ top: box.top + t, left: box.left + box.width - r, width: r, height: Math.max(0, box.height - t - b) }} />}
    </>
  );
}

function DropIndicator({ box, position, axis, label }: { box: Box | null; position: 'before' | 'after' | 'inside'; axis: 'vertical' | 'horizontal'; label?: string }) {
  if (!box) return null;
  if (position === 'inside') {
    return (
      <div className="absolute rounded-sm border-2 border-dashed border-selection bg-selection/5" style={pos(box)}>
        {label && <span className="absolute left-1 top-1 rounded bg-selection px-1.5 py-0.5 text-[11px] font-medium text-white">{label}</span>}
      </div>
    );
  }
  const vertical = axis === 'vertical';
  const style: CSSProperties = vertical
    ? { left: box.left, width: box.width, top: (position === 'before' ? box.top : box.top + box.height) - 1.5, height: 3 }
    : { top: box.top, height: box.height, left: (position === 'before' ? box.left : box.left + box.width) - 1.5, width: 3 };
  return (
    <div className="absolute rounded-full bg-selection shadow-[0_0_0_1px_white]" style={style}>
      <span className={cn('absolute size-2 rounded-full border-2 border-selection bg-white', vertical ? '-left-1 -top-[2.5px]' : '-top-1 -left-[2.5px]')} />
    </div>
  );
}

function SelectionChrome({ nodeId, box }: { nodeId: string; box: Box }) {
  const perms = usePerms();
  const type = currentIndex().get(nodeId)?.type;
  const name = useDocumentStore((s) => findInDef(s.definition, s.pageId, nodeId)?.name);
  const meta = currentIndex().get(nodeId);
  const def = type ? registry.get(type) : undefined;
  const site = meta?.target === 'header' || meta?.target === 'footer';
  const label = name ?? def?.name ?? type ?? 'Element';
  const above = box.top >= 26;
  const chipTop = above ? box.top - 22 : box.top + 2;
  const toolbarTop = above ? box.top - 30 : box.top + 2;
  const ro = !perms.edit;

  const onDragStart = (e: DragEvent) => {
    if (!type || ro || site) return e.preventDefault();
    startDrag({ kind: 'move', nodeId, type });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `atrium:move:${nodeId}`);
  };

  return (
    <>
      <div
        className="pointer-events-auto absolute flex h-5 max-w-[60%] items-center gap-0.5 rounded-[4px] bg-selection pl-0.5 pr-1.5 text-[11px] font-medium leading-none text-white shadow-sm"
        style={{ top: chipTop, left: Math.max(0, box.left) }}
      >
        {!site && !ro && (
          <span draggable onDragStart={onDragStart} onDragEnd={endDrag} title="Drag to move" className="flex h-4 w-3.5 cursor-grab items-center justify-center rounded-sm hover:bg-white/20 active:cursor-grabbing">
            <GripVertical className="size-3" />
          </span>
        )}
        {def?.icon && <Icon name={def.icon} size={12} className="opacity-80" />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className="pointer-events-auto absolute flex h-7 items-center gap-px rounded-md border border-border bg-surface p-0.5 text-fg shadow-popover"
        style={{ top: toolbarTop, left: Math.max(0, box.left + box.width - 2), transform: 'translateX(-100%)' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {!site && !ro && (
          <>
            <ToolBtn label="Move up" onClick={() => moveBy(nodeId, -1)} disabled={meta?.index === 0}>
              <ArrowUp />
            </ToolBtn>
            <ToolBtn label="Move down" onClick={() => moveBy(nodeId, 1)}>
              <ArrowDown />
            </ToolBtn>
          </>
        )}
        <ToolBtn label="Select parent" onClick={() => selectParent()} disabled={!meta?.parentId}>
          <CornerLeftUp />
        </ToolBtn>
        {!site && !ro && (
          <>
            <Menu>
              <MenuTrigger asChild>
                <button type="button" title="Add before / after" className="flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-3.5">
                  <Plus />
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => insertSiblingOf(nodeId, 'before')}>Add {def?.name ?? 'copy'} before</MenuItem>
                <MenuItem onSelect={() => insertSiblingOf(nodeId, 'after')}>Add {def?.name ?? 'copy'} after</MenuItem>
                <MenuItem onSelect={() => openLeft(meta?.parentId ? 'add' : 'sections')}>Browse {meta?.parentId ? 'elements' : 'sections'}…</MenuItem>
              </MenuContent>
            </Menu>
            <ToolBtn label="Duplicate (⌘D)" onClick={() => duplicateNode(nodeId)}>
              <CopyPlus />
            </ToolBtn>
            <ToolBtn label="Delete (⌫)" onClick={() => removeNode(nodeId)} danger>
              <Trash2 />
            </ToolBtn>
          </>
        )}
        <Menu>
          <MenuTrigger asChild>
            <button type="button" title="More actions" className="flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-3.5">
              <MoreHorizontal />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="w-56">
            <NodeMenuItems nodeId={nodeId} />
          </MenuContent>
        </Menu>
      </div>
    </>
  );
}

function ToolBtn({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 [&_svg]:size-3.5', danger && 'hover:bg-danger-soft hover:text-danger')}
    >
      {children}
    </button>
  );
}

/** Right-click menu for canvas nodes (anchored at the pointer). */
export function CanvasContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  if (!menu) return null;
  return (
    <M.Root open onOpenChange={(o) => !o && useUiStore.setState({ contextMenu: null })} modal={false}>
      <M.Trigger asChild>
        <span className="pointer-events-none fixed size-px" style={{ left: menu.x, top: menu.y }} />
      </M.Trigger>
      <MenuContent align="start" className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
        <NodeMenuItems nodeId={menu.nodeId} />
      </MenuContent>
    </M.Root>
  );
}
