'use client';

import { createId, type NavItem } from '@atrium/schema';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, CornerDownRight, GripVertical, Lock, PanelBottom, PanelTop, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { scrollNodeIntoView } from '../canvas/dom';
import { LinkField } from '../inspector/controls/link';
import { cn } from '../lib/cn';
import { projectTreeDrop, toMoveIndex } from '../lib/tree-projection';
import { mutate, useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { select } from '../store/ui';
import { Btn, CommitInput, IconBtn, NativeSelect, PanelHeader, Row, Switch } from '../ui/primitives';

const INDENT = 16;
const MAX_DEPTH = 2;

interface FlatNav {
  id: string;
  item: NavItem;
  depth: number;
  parentId: string | null;
  index: number;
}

function flatten(items: NavItem[], depth = 0, parentId: string | null = null, out: FlatNav[] = []): FlatNav[] {
  items.forEach((item, index) => {
    out.push({ id: item.id, item, depth, parentId, index });
    if (item.children?.length) flatten(item.children, depth + 1, item.id, out);
  });
  return out;
}

function findList(items: NavItem[], parentId: string | null): NavItem[] | null {
  if (parentId === null) return items;
  for (const it of items) {
    if (it.id === parentId) return (it.children ??= []);
    const hit = it.children ? findList(it.children, parentId) : null;
    if (hit) return hit;
  }
  return null;
}

function removeItem(items: NavItem[], id: string): NavItem | null {
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) return items.splice(i, 1)[0]!;
  for (const it of items) {
    const hit = it.children ? removeItem(it.children, id) : null;
    if (hit) {
      if (it.children && !it.children.length) delete it.children;
      return hit;
    }
  }
  return null;
}

function editMenu(menu: string, label: string, recipe: (items: NavItem[]) => void, mergeKey?: string) {
  mutate(label, (d) => {
    const items = (d.navigation.menus[menu] ??= []);
    recipe(items);
  }, { mergeKey });
}

export function NavigationPanel() {
  const menus = useDocumentStore((s) => s.definition?.navigation.menus);
  const header = useDocumentStore((s) => s.definition?.header);
  const footer = useDocumentStore((s) => s.definition?.footer);
  const perms = usePerms();
  const keys = Object.keys(menus ?? {});
  const [menu, setMenu] = useState<string>(() => (keys.includes('primary') ? 'primary' : (keys[0] ?? 'primary')));
  const [editing, setEditing] = useState<string | null>(null);
  const [newMenu, setNewMenu] = useState('');
  const items = menus?.[menu] ?? [];
  const rows = useMemo(() => flatten(items), [items]);
  const ro = !perms.navigation;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [offset, setOffset] = useState(0);

  const onDragEnd = (e: DragEndEvent) => {
    setOffset(0);
    if (!e.over) return;
    const activeId = String(e.active.id);
    // hide descendants of the active item from the projection
    const active = rows.find((r) => r.id === activeId);
    if (!active) return;
    const visible = rows.filter((r) => {
      let p = r.parentId;
      while (p) {
        if (p === activeId) return false;
        p = rows.find((x) => x.id === p)?.parentId ?? null;
      }
      return true;
    });
    const proj = projectTreeDrop(visible.map((r) => ({ id: r.id, type: 'nav', depth: r.depth, parentId: r.parentId })), activeId, String(e.over.id), e.delta.x, INDENT, () => true, () => true);
    if (!proj || proj.depth > MAX_DEPTH) return;
    if (proj.parentId === active.parentId && proj.index === active.index) return;
    const index = toMoveIndex(proj, { parentId: active.parentId, index: active.index });
    editMenu(menu, 'Reorder menu', (list) => {
      const sameList = proj.parentId === active.parentId;
      const item = removeItem(list, activeId);
      if (!item) return;
      const target = findList(list, proj.parentId);
      if (!target) return;
      const at = sameList && index > active.index ? index - 1 : index;
      target.splice(Math.max(0, Math.min(at, target.length)), 0, item);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Navigation" actions={ro ? <span title="You do not have permission to edit navigation"><Lock className="size-3.5 text-fg-subtle" /></span> : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-2 border-b border-border p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Header & footer</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Btn variant="secondary" size="sm" icon={<PanelTop className="size-3.5" />} onClick={() => header && (select(header.id), scrollNodeIntoView(header.id))}>Header</Btn>
            <Btn variant="secondary" size="sm" icon={<PanelBottom className="size-3.5" />} onClick={() => footer && (select(footer.id), scrollNodeIntoView(footer.id))}>Footer</Btn>
          </div>
        </div>
        <div className="space-y-2 p-3">
          <Row label="Menu">
            <NativeSelect value={menu} onChange={setMenu} options={keys.map((k) => ({ label: `${k} · ${menus![k]!.length} items`, value: k }))} placeholder={keys.length ? undefined : 'No menus'} />
          </Row>
          {!ro && (
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const key = newMenu.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
                if (!key || keys.includes(key)) return;
                mutate('Create menu', (d) => void (d.navigation.menus[key] = []));
                setMenu(key);
                setNewMenu('');
              }}
            >
              <CommitInput value={newMenu} placeholder="New menu (e.g. legal)" onCommit={setNewMenu} />
              <Btn type="submit" size="sm" variant="secondary" disabled={!newMenu.trim()}>Add</Btn>
            </form>
          )}
        </div>
        <div className="px-2 pb-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragMove={(e) => setOffset(e.delta.x)} onDragEnd={onDragEnd} onDragCancel={() => setOffset(0)}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((r) => (
                <NavRow
                  key={r.id}
                  row={r}
                  open={editing === r.id}
                  ro={ro}
                  offset={offset}
                  onToggle={() => setEditing(editing === r.id ? null : r.id)}
                  onChange={(patch, mk) => editMenu(menu, 'Edit menu item', (list) => {
                    const target = findList(list, r.parentId)?.find((x) => x.id === r.id);
                    if (target) Object.assign(target, patch);
                    for (const [k, v] of Object.entries(patch)) if (v === undefined && target) delete (target as unknown as Record<string, unknown>)[k];
                  }, mk)}
                  onAddChild={() => editMenu(menu, 'Add submenu item', (list) => {
                    const target = findList(list, r.parentId)?.find((x) => x.id === r.id);
                    if (target) (target.children ??= []).push({ id: createId(), label: 'New link', link: '/' });
                  })}
                  onRemove={() => editMenu(menu, 'Remove menu item', (list) => void removeItem(list, r.id))}
                />
              ))}
            </SortableContext>
          </DndContext>
          {!rows.length && <p className="px-2 py-4 text-center text-xs text-fg-muted">This menu is empty.</p>}
          {!ro && (
            <Btn size="xs" variant="ghost" className="mt-1" icon={<Plus className="size-3.5" />} onClick={() => editMenu(menu, 'Add menu item', (list) => void list.push({ id: createId(), label: 'New link', link: '/' }))}>
              Add link
            </Btn>
          )}
          <p className="px-1 pt-2 text-[11px] leading-4 text-fg-subtle">Drag to reorder; drag right to nest under the item above (up to {MAX_DEPTH + 1} levels).</p>
        </div>
      </div>
    </div>
  );
}

function NavRow({ row, open, ro, offset, onToggle, onChange, onAddChild, onRemove }: { row: FlatNav; open: boolean; ro: boolean; offset: number; onToggle: () => void; onChange: (patch: Partial<NavItem>, mergeKey?: string) => void; onAddChild: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: ro });
  const it = row.item;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, marginLeft: row.depth * INDENT + (isDragging ? Math.round(offset / INDENT) * INDENT : 0) }} className={cn('mb-0.5 rounded-md border border-border bg-surface', isDragging && 'z-10 shadow-popover')}>
      <div className="group flex h-8 items-center gap-1 pr-1">
        <span className="flex h-8 w-5 cursor-grab items-center justify-center text-fg-subtle" {...attributes} {...listeners}>
          <GripVertical className="size-3.5" />
        </span>
        {row.depth > 0 && <CornerDownRight className="size-3 text-fg-subtle" />}
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13px]">
          <span className="truncate">{it.label}</span>
          {it.mega && <span className="rounded bg-surface-2 px-1 text-[10px] text-fg-subtle">mega</span>}
          {open ? <ChevronDown className="ml-auto size-3 text-fg-subtle" /> : <ChevronRight className="ml-auto size-3 text-fg-subtle" />}
        </button>
      </div>
      {open && (
        <fieldset disabled={ro} className="space-y-2 border-t border-border p-2">
          <Row label="Label">
            <CommitInput value={it.label} onCommit={(label) => label.trim() && onChange({ label: label.trim() }, `nav:${it.id}:label`)} />
          </Row>
          <Row label="Link" stacked>
            <LinkField value={it.link} disabled={ro} onChange={(link) => onChange({ link })} />
          </Row>
          <Row label="Description" stacked>
            <CommitInput value={it.description ?? ''} placeholder="Shown in mega menus" onCommit={(description) => onChange({ description: description || undefined })} />
          </Row>
          {row.depth === 0 && (
            <Row label="Mega menu" className="grid-cols-[minmax(0,1fr)_auto]">
              <Switch checked={!!it.mega} onChange={(mega) => onChange({ mega: mega || undefined })} disabled={ro} />
            </Row>
          )}
          <Row label="Highlight (button)" className="grid-cols-[minmax(0,1fr)_auto]">
            <Switch checked={!!it.highlight} onChange={(highlight) => onChange({ highlight: highlight || undefined })} disabled={ro} />
          </Row>
          <div className="flex justify-between">
            {row.depth < MAX_DEPTH ? (
              <Btn size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={onAddChild}>
                Add sub-item
              </Btn>
            ) : (
              <span />
            )}
            <IconBtn size="xs" label="Remove item" variant="danger" onClick={onRemove}>
              <Trash2 className="size-3.5" />
            </IconBtn>
          </div>
        </fieldset>
      )}
    </div>
  );
}

