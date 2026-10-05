'use client';

import {
  closestCenter,
  DndContext,
  pointerWithin,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { FormFieldType } from '@atrium/schema';
import { useEffect, useState } from 'react';
import { createField, duplicateField } from '../form-model';
import { useFormEditor } from './editor-context';
import { FieldPalette, PaletteDragChip } from './field-palette';
import { FieldSettingsPanel } from './field-settings';
import { FormCanvas, type CanvasMode } from './form-canvas';

export function BuildTab() {
  const { draft, setDraft, selectedId, setSelectedId, readOnly } = useFormEditor();
  const [mode, setMode] = useState<CanvasMode>('build');
  const [dragType, setDragType] = useState<FormFieldType | null>(null);
  const [insertAt, setInsertAt] = useState<{ id: string; after: boolean } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Esc deselects (unless typing in a field or a popover is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selectedId) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="listbox"], [role="menu"]')) return;
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, setSelectedId]);

  const insertField = (type: FormFieldType, index?: number) => {
    const f = createField(
      type,
      draft.fields.map((x) => x.name),
    );
    setDraft((d) => {
      const fields = [...d.fields];
      const selIdx = selectedId ? fields.findIndex((x) => x.id === selectedId) : -1;
      const at = index ?? (selIdx >= 0 ? selIdx + 1 : fields.length);
      fields.splice(at, 0, f);
      return { ...d, fields };
    });
    setSelectedId(f.id);
    setMode('build');
  };

  const duplicate = (id: string) => {
    const src = draft.fields.find((f) => f.id === id);
    if (!src) return;
    const copy = duplicateField(
      src,
      draft.fields.map((f) => f.name),
    );
    setDraft((d) => {
      const i = d.fields.findIndex((f) => f.id === id);
      const fields = [...d.fields];
      fields.splice(i + 1, 0, copy);
      return { ...d, fields };
    });
    setSelectedId(copy.id);
  };

  const remove = (id: string) => {
    const i = draft.fields.findIndex((f) => f.id === id);
    setDraft((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== id) }));
    if (selectedId === id) setSelectedId(draft.fields[i + 1]?.id ?? draft.fields[i - 1]?.id ?? null);
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { from?: string; type?: FormFieldType } | undefined;
    if (data?.from === 'palette' && data.type) setDragType(data.type);
  };
  /** Is the dragged item's center below the hovered field's center? */
  const isAfter = (e: DragOverEvent | DragEndEvent) => {
    const r = e.active.rect.current.translated;
    const o = e.over?.rect;
    return !!r && !!o && r.top + r.height / 2 > o.top + o.height / 2;
  };
  const onDragOver = (e: DragOverEvent) => {
    if (!dragType) return;
    const id = e.over ? String(e.over.id) : null;
    const next = id && id !== 'canvas' ? { id, after: isAfter(e) } : null;
    setInsertAt((cur) => (cur?.id === next?.id && cur?.after === next?.after ? cur : next));
  };
  const onDragEnd = (e: DragEndEvent) => {
    const overKey = e.over ? String(e.over.id) : null;
    if (dragType) {
      if (overKey) {
        const idx = overKey === 'canvas' ? draft.fields.length : draft.fields.findIndex((f) => f.id === overKey);
        insertField(dragType, idx < 0 ? draft.fields.length : idx + (overKey !== 'canvas' && isAfter(e) ? 1 : 0));
      }
    } else if (overKey && overKey !== 'canvas' && e.active.id !== overKey) {
      setDraft((d) => {
        const from = d.fields.findIndex((f) => f.id === e.active.id);
        const to = d.fields.findIndex((f) => f.id === overKey);
        return from < 0 || to < 0 ? d : { ...d, fields: arrayMove(d.fields, from, to) };
      });
    }
    setDragType(null);
    setInsertAt(null);
  };

  // Palette drags target whatever is under the pointer (field or empty canvas);
  // field reorders use closest-center among fields only.
  const collision: CollisionDetection = (args) => {
    if ((args.active.data.current as { from?: string } | undefined)?.from !== 'palette') {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== 'canvas') });
    }
    const hits = pointerWithin(args);
    const fieldHits = hits.filter((h) => h.id !== 'canvas');
    if (fieldHits.length) return fieldHits;
    if (hits.length) return hits;
    return args.pointerCoordinates ? [] : closestCenter(args);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragMove={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragType(null);
        setInsertAt(null);
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${labelFor(String(active.id))}.`,
          onDragOver: ({ active, over }) => (over ? `${labelFor(String(active.id))} is over ${labelFor(String(over.id))}.` : `${labelFor(String(active.id))} is no longer over a field.`),
          onDragEnd: ({ active, over }) => (over ? `${labelFor(String(active.id))} was dropped on ${labelFor(String(over.id))}.` : `${labelFor(String(active.id))} was dropped.`),
          onDragCancel: ({ active }) => `Dragging ${labelFor(String(active.id))} was cancelled.`,
        },
      }}
    >
      <div className="grid md:h-full md:min-h-0 md:grid-cols-[200px_minmax(0,1fr)_280px] xl:grid-cols-[232px_minmax(0,1fr)_320px]">
        <aside className="border-b border-border bg-surface md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r" aria-label="Field types">
          <FieldPalette onAdd={(t) => insertField(t)} disabled={readOnly} />
        </aside>
        <section className="min-w-0 bg-bg md:min-h-0 md:overflow-y-auto" aria-label="Form canvas">
          <FormCanvas mode={mode} onModeChange={setMode} insertAt={insertAt} paletteDragging={!!dragType} onDuplicate={duplicate} onDelete={remove} />
        </section>
        <aside className="border-t border-border bg-surface md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0" aria-label="Field settings">
          <FieldSettingsPanel onDuplicate={duplicate} onDelete={remove} />
        </aside>
      </div>
      <DragOverlay dropAnimation={null}>{dragType ? <PaletteDragChip type={dragType} /> : null}</DragOverlay>
    </DndContext>
  );

  function labelFor(id: string): string {
    if (id === 'canvas') return 'the form';
    if (id.startsWith('palette:')) return `new ${id.slice(8)} field`;
    const f = draft.fields.find((x) => x.id === id);
    return f ? `field ${f.label || f.name}` : 'item';
  }
}
