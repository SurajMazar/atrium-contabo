'use client';

import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { createId, slugify } from '@atrium/schema';
import { Button, cn, IconButton, Input } from '@atrium/ui';
import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { announcements, DragHandle, restrictToVerticalAxis, Sortable, useSortSensors } from './sortable';

interface Row {
  id: string;
  label: string;
  value: string;
  touched: boolean;
}

/** Label/value rows for select & multiselect options, with add/remove/reorder. */
export function OptionsEditor({ value, onChange, invalid }: { value: Array<{ label: string; value: string }>; onChange: (v: Array<{ label: string; value: string }>) => void; invalid?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => value.map((o) => ({ id: createId('opt'), label: o.label, value: o.value, touched: true })));
  const sensors = useSortSensors();
  const lastAdded = useRef<string | null>(null);

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(next.map(({ label, value: v }) => ({ label, value: v })));
  };

  const update = (id: string, patch: Partial<Row>) => commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const add = () => {
    const id = createId('opt');
    lastAdded.current = id;
    commit([...rows, { id, label: '', value: '', touched: false }]);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.findIndex((r) => r.id === e.active.id);
    const to = rows.findIndex((r) => r.id === e.over!.id);
    commit(arrayMove(rows, from, to));
  };

  const dupValues = new Set(rows.map((r) => r.value).filter((v, i, a) => v && a.indexOf(v) !== i));

  return (
    <div className="space-y-1.5">
      {rows.length > 0 && (
        <div className="grid grid-cols-[24px_1fr_1fr_28px] gap-1.5 px-0 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
          <span />
          <span>Label</span>
          <span>Value</span>
          <span />
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        accessibility={{ announcements: announcements((id) => rows.find((r) => r.id === id)?.label || 'option') }}
      >
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <Sortable key={r.id} id={r.id}>
                {({ setNodeRef, style, handleProps, isDragging }) => (
                  <div ref={setNodeRef} style={style} className={cn('grid grid-cols-[24px_1fr_1fr_28px] items-center gap-1.5 rounded-md', isDragging && 'bg-surface shadow-popover')}>
                    <DragHandle {...handleProps} label={`Reorder ${r.label || 'option'}`} />
                    <Input
                      size="sm"
                      aria-label="Option label"
                      placeholder="Label"
                      autoFocus={lastAdded.current === r.id}
                      value={r.label}
                      invalid={invalid && !r.label.trim()}
                      onChange={(e) => update(r.id, { label: e.target.value, ...(r.touched ? {} : { value: slugify(e.target.value) }) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          add();
                        }
                      }}
                    />
                    <Input
                      size="sm"
                      aria-label="Option value"
                      placeholder="value"
                      className="font-mono text-xs"
                      value={r.value}
                      invalid={(invalid && !r.value.trim()) || dupValues.has(r.value)}
                      onChange={(e) => update(r.id, { value: e.target.value, touched: true })}
                    />
                    <IconButton label="Remove option" size="xs" onClick={() => commit(rows.filter((x) => x.id !== r.id))}>
                      <X />
                    </IconButton>
                  </div>
                )}
              </Sortable>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button size="xs" variant="ghost" leadingIcon={<Plus />} onClick={add}>
        Add option
      </Button>
    </div>
  );
}
