'use client';

import { registry } from '@atrium/component-registry';
import type { Node } from '@atrium/schema';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, ChevronsDownUp, Eye, EyeOff, Lock, LockOpen, MoreHorizontal } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { renameNode, toggleHidden, toggleLocked } from '../actions';
import { NodeMenuItems } from '../canvas/node-menu';
import { scrollNodeIntoView } from '../canvas/dom';
import { cn } from '../lib/cn';
import { acceptsChildren, makeAccepts } from '../lib/rules';
import { flattenTree, nodeLabel, nodePathTo, type FlatRow } from '../lib/tree';
import { projectTreeDrop, toMoveIndex, type Projection } from '../lib/tree-projection';
import { runOps, useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { hover, select, useSelectionStore, useUiStore } from '../store/ui';
import { Empty, Icon, IconBtn, Menu, MenuContent, MenuTrigger, PanelHeader } from '../ui/primitives';

const INDENT = 14;
const ROW_H = 28;
const VIRTUALIZE_AT = 250;
const accepts = makeAccepts(registry);
const hasChildrenRule = (type: string) => acceptsChildren(registry, type);

export function LayersPanel() {
  const page = useDocumentStore((s) => s.definition?.pages.find((p) => p.id === s.pageId));
  const header = useDocumentStore((s) => s.definition?.header);
  const footer = useDocumentStore((s) => s.definition?.footer);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const perms = usePerms();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });

  // Reveal the selection: expand its ancestors.
  useEffect(() => {
    if (!selectedId || !page) return;
    const path = nodePathTo(page.sections, selectedId);
    if (path.length > 1) {
      setCollapsed((prev) => {
        const ancestors = path.slice(0, -1).filter((id) => prev.has(id));
        if (!ancestors.length) return prev;
        const next = new Set(prev);
        ancestors.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [selectedId, page]);

  const rows = useMemo(() => (page ? flattenTree(page.sections, page.id, collapsed) : []), [page, collapsed]);
  // While dragging, hide the active row's descendants so it cannot be dropped into itself.
  const visibleRows = useMemo(() => {
    if (!activeId) return rows;
    const out: FlatRow[] = [];
    let skipDepth = -1;
    for (const r of rows) {
      if (skipDepth >= 0) {
        if (r.depth > skipDepth) continue;
        skipDepth = -1;
      }
      out.push(r);
      if (r.id === activeId) skipDepth = r.depth;
    }
    return out;
  }, [rows, activeId]);

  const projection: Projection | null = useMemo(() => {
    if (!activeId || !overId) return null;
    return projectTreeDrop(visibleRows.map((r) => ({ id: r.id, type: r.node.type, depth: r.depth, parentId: r.parentId })), activeId, overId, offsetX, INDENT, accepts, hasChildrenRule);
  }, [activeId, overId, offsetX, visibleRows]);

  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const idx = rows.findIndex((r) => r.id === selectedId);
    if (idx < 0) return;
    const el = scrollRef.current;
    const top = idx * ROW_H + (header ? ROW_H + 8 : 0);
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - ROW_H) el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3) });
  }, [selectedId, rows, header]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const reset = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
    document.body.style.cursor = '';
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    document.body.style.cursor = 'grabbing';
  };
  const onDragMove = (e: DragMoveEvent) => setOffsetX(e.delta.x);
  const onDragOver = (e: DragOverEvent) => setOverId(e.over ? String(e.over.id) : null);
  const onDragEnd = (e: DragEndEvent) => {
    const p = projection;
    const id = String(e.active.id);
    reset();
    if (!p || !page || !p.valid) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.parentId === p.parentId && row.index === p.index) return;
    runOps('Move element', [{ op: 'moveNode', pageId: page.id, nodeId: id, parentId: p.parentId, index: toMoveIndex(p, { parentId: row.parentId, index: row.index }) }]);
    if (p.parentId) setCollapsed((prev) => (prev.has(p.parentId!) ? new Set([...prev].filter((x) => x !== p.parentId)) : prev));
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const collapseAll = () => {
    const all = new Set<string>();
    const walk = (nodes: Node[]) => nodes.forEach((n) => n.children?.length && (all.add(n.id), walk(n.children)));
    if (page) walk(page.sections);
    setCollapsed(all);
  };

  if (!page) return null;
  const activeRow = activeId ? rows.find((r) => r.id === activeId) : null;
  const virtual = !activeId && visibleRows.length > VIRTUALIZE_AT;
  const start = virtual ? Math.max(0, Math.floor(scroll.top / ROW_H) - 20) : 0;
  const end = virtual ? Math.min(visibleRows.length, Math.ceil((scroll.top + scroll.height) / ROW_H) + 20) : visibleRows.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Layers" actions={<IconBtn label="Collapse all" onClick={collapseAll}><ChevronsDownUp /></IconBtn>} />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onScroll={(e) => virtual && setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
        onMouseLeave={() => hover(null)}
      >
        {header && <SiteRow node={header} label="Header" selected={selectedId === header.id} />}
        <div className="mx-2 my-1 h-px bg-border" />
        {!rows.length && <Empty title="This page is empty">Add a section from the Sections or Add panel.</Empty>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={reset}>
          <SortableContext items={visibleRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {virtual && <div style={{ height: start * ROW_H }} />}
            {visibleRows.slice(start, end).map((r) => (
              <LayerRow
                key={r.id}
                row={r}
                selected={r.id === selectedId}
                collapsed={collapsed.has(r.id)}
                onToggle={toggle}
                depth={r.id === activeId && projection ? projection.depth : r.depth}
                invalid={r.id === activeId && !!projection && !projection.valid}
                draggable={perms.edit}
              />
            ))}
            {virtual && <div style={{ height: (visibleRows.length - end) * ROW_H }} />}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeRow ? (
              <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[13px] shadow-popover">
                <Icon name={registry.get(activeRow.node.type)?.icon} size={14} />
                {nodeLabel(activeRow.node, registry.get(activeRow.node.type)?.name)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <div className="mx-2 my-1 h-px bg-border" />
        {footer && <SiteRow node={footer} label="Footer" selected={selectedId === footer.id} />}
      </div>
    </div>
  );
}

function SiteRow({ node, label, selected }: { node: Node; label: string; selected: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        select(node.id);
        scrollNodeIntoView(node.id);
      }}
      onMouseEnter={() => hover(node.id)}
      className={cn('mx-1 flex h-7 w-[calc(100%-8px)] items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-fg-muted', selected ? 'bg-accent-soft text-fg' : 'hover:bg-surface-2')}
    >
      <Icon name={registry.get(node.type)?.icon} size={14} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Site</span>
    </button>
  );
}

const LayerRow = memo(function LayerRow({ row, selected, collapsed, onToggle, depth, invalid, draggable }: { row: FlatRow; selected: boolean; collapsed: boolean; onToggle: (id: string) => void; depth: number; invalid: boolean; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !draggable || !!row.node.locked });
  const renaming = useUiStore((s) => s.renamingId === row.id);
  const def = registry.get(row.node.type);
  const n = row.node;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, paddingLeft: 6 + depth * INDENT }}
      className={cn(
        'group relative mx-1 flex h-7 items-center gap-1 rounded-md pr-1 text-[13px]',
        selected ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-surface-2',
        isDragging && 'opacity-50',
        invalid && 'ring-1 ring-danger',
        n.hidden && 'text-fg-subtle',
      )}
      onMouseEnter={() => hover(row.id)}
      onClick={() => {
        select(row.id);
        scrollNodeIntoView(row.id);
      }}
      onDoubleClick={() => draggable && useUiStore.setState({ renamingId: row.id })}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(row.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn('flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg', !row.hasChildren && 'invisible')}
        aria-label={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      <Icon name={def?.icon} size={14} className={cn('text-fg-muted', selected && 'text-accent')} />
      {renaming ? (
        <input
          autoFocus
          defaultValue={n.name ?? def?.name ?? n.type}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') useUiStore.setState({ renamingId: null });
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (n.name ?? def?.name)) renameNode(row.id, v === def?.name ? '' : v);
            useUiStore.setState({ renamingId: null });
          }}
          className="h-5 min-w-0 flex-1 rounded border border-accent bg-surface px-1 text-[13px] outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{nodeLabel(n, def?.name)}</span>
      )}
      {n.binding && <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">CMS</span>}
      <span className={cn('flex items-center', !(n.hidden || n.locked) && 'opacity-0 group-hover:opacity-100')} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" tabIndex={-1} title={n.hidden ? 'Show' : 'Hide'} disabled={!draggable} onClick={(e) => (e.stopPropagation(), toggleHidden(row.id))} className="rounded p-0.5 text-fg-subtle hover:text-fg">
          {n.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
        <button type="button" tabIndex={-1} title={n.locked ? 'Unlock' : 'Lock'} disabled={!draggable} onClick={(e) => (e.stopPropagation(), toggleLocked(row.id))} className="rounded p-0.5 text-fg-subtle hover:text-fg">
          {n.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button type="button" tabIndex={-1} title="More" onClick={(e) => e.stopPropagation()} className="rounded p-0.5 text-fg-subtle hover:text-fg">
              <MoreHorizontal className="size-3.5" />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
            <NodeMenuItems nodeId={row.id} />
          </MenuContent>
        </Menu>
      </span>
    </div>
  );
});
