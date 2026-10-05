'use client';

import { getPath, jsonClone } from '@atrium/builder-core';
import type { Control } from '@atrium/component-registry';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, CopyPlus, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { conditionMatches, humanize } from '../../lib/controls';
import { cn } from '../../lib/cn';
import { Btn } from '../../ui/primitives';
import { ControlField } from '../control-field';
import type { ControlProps } from './types';

type Item = Record<string, unknown> | string;

function itemTitle(item: Item, control: Control, index: number): string {
  if (typeof item === 'string') return item || `Item ${index + 1}`;
  const key = control.itemLabel;
  const v = key ? getPath(item, key) : undefined;
  if (typeof v === 'string' && v.trim()) return v;
  const first = Object.values(item).find((x) => typeof x === 'string' && x.trim() && !/^https?:|^\//.test(x));
  return typeof first === 'string' ? first : `${control.label} ${index + 1}`;
}

function defaultItem(control: Control): Item {
  if (control.itemDefaults) return jsonClone(control.itemDefaults);
  const sub = control.item ?? [];
  const out: Record<string, unknown> = {};
  for (const c of sub) {
    if (c.type === 'text' || c.type === 'textarea') out[c.name] = c.type === 'text' ? `New ${c.label.toLowerCase()}` : '';
    if (c.type === 'toggle') out[c.name] = false;
  }
  return out;
}

/**
 * Sortable list editor: reorder by drag (or keyboard), add / duplicate /
 * remove, per-item sub-controls. Item ids are positional, so keys are
 * regenerated per render from a stable counter map.
 */
export function ListControl({ value, onChange, control, disabled, node, id }: ControlProps<Item[] | undefined>) {
  const items = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const [open, setOpen] = useState<number | null>(null);
  const keys = useMemo(() => items.map((_, i) => `${id}-item-${i}`), [items, id]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const commit = (next: Item[], mergeKey?: string) => onChange(next, mergeKey ? { mergeKey } : undefined);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = keys.indexOf(String(e.active.id));
    const to = keys.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    commit(arrayMove(items, from, to));
    if (open === from) setOpen(to);
  };

  const setItemField = (index: number, name: string, v: unknown) => {
    const next = items.slice();
    const cur = next[index];
    if (typeof cur === 'string' || !control.item?.length) next[index] = v as Item;
    else {
      const copy = jsonClone(cur ?? {}) as Record<string, unknown>;
      const parts = name.split('.');
      let t = copy;
      parts.slice(0, -1).forEach((k) => {
        if (!t[k] || typeof t[k] !== 'object') t[k] = {};
        t = t[k] as Record<string, unknown>;
      });
      if (v === undefined) delete t[parts[parts.length - 1]!];
      else t[parts[parts.length - 1]!] = v;
      next[index] = copy;
    }
    commit(next, `list:${node?.id}:${control.name}:${index}:${name}`);
  };

  return (
    <div className="space-y-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableItem key={keys[i]} id={keys[i]!} title={itemTitle(item, control, i)} open={open === i} onToggle={() => setOpen(open === i ? null : i)} disabled={disabled}
              onDuplicate={() => commit([...items.slice(0, i + 1), jsonClone(item), ...items.slice(i + 1)])}
              onRemove={() => {
                commit(items.filter((_, j) => j !== i));
                if (open === i) setOpen(null);
              }}
            >
              {(control.item ?? []).filter((c) => typeof item !== 'object' || conditionMatches(c.showIf, item as Record<string, unknown>, node?.variant)).map((sub) => (
                <ControlField
                  key={sub.name}
                  control={sub}
                  value={typeof item === 'object' && item ? getPath(item, sub.name) : item}
                  onChange={(v) => setItemField(i, sub.name, v)}
                  node={node}
                  disabled={disabled}
                  idPrefix={`${id}-${i}`}
                />
              ))}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      {!items.length && <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-xs text-fg-subtle">No {control.label.toLowerCase()} yet</p>}
      <Btn
        size="xs"
        variant="ghost"
        disabled={disabled}
        icon={<Plus className="size-3.5" />}
        onClick={() => {
          commit([...items, defaultItem(control)]);
          setOpen(items.length);
        }}
      >
        Add {humanize(control.itemLabel ? control.label.replace(/s$/, '') : 'item').toLowerCase()}
      </Btn>
    </div>
  );
}

function SortableItem({ id, title, open, onToggle, onDuplicate, onRemove, disabled, children }: { id: string; title: string; open: boolean; onToggle: () => void; onDuplicate: () => void; onRemove: () => void; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('rounded-md border border-border bg-surface', isDragging && 'z-10 shadow-popover')}>
      <div className="group flex h-7 items-center gap-0.5 pr-1">
        <button type="button" className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-fg-subtle active:cursor-grabbing" aria-label="Reorder" {...attributes} {...listeners}>
          <GripVertical className="size-3.5" />
        </button>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs text-fg">
          {open ? <ChevronDown className="size-3 shrink-0 text-fg-subtle" /> : <ChevronRight className="size-3 shrink-0 text-fg-subtle" />}
          <span className="truncate">{title}</span>
        </button>
        {!disabled && (
          <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button type="button" title="Duplicate" onClick={onDuplicate} className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <CopyPlus className="size-3" />
            </button>
            <button type="button" title="Remove" onClick={onRemove} className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger">
              <Trash2 className="size-3" />
            </button>
          </span>
        )}
      </div>
      {open && <div className="space-y-2 border-t border-border p-2">{children}</div>}
    </div>
  );
}
