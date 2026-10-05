'use client';

import { useDraggable } from '@dnd-kit/core';
import { FORM_FIELD_TYPES, type FormFieldType } from '@atrium/schema';
import { cn, Input } from '@atrium/ui';
import { GripVertical, Search } from 'lucide-react';
import { useMemo, useState, type PointerEventHandler } from 'react';
import { FIELD_GROUPS, FIELD_TYPE_META } from '../form-model';

export function FieldPalette({ onAdd, disabled }: { onAdd: (type: FormFieldType) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELD_GROUPS.map((g) => ({
      ...g,
      types: FORM_FIELD_TYPES.filter((t) => FIELD_TYPE_META[t].group === g.key && (!q || FIELD_TYPE_META[t].label.toLowerCase().includes(q) || t.includes(q))),
    })).filter((g) => g.types.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-surface p-3">
        <Input size="sm" prefix={<Search />} placeholder="Find a field" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a field type" />
      </div>
      <div className="space-y-4 p-3">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-1 px-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{g.label}</div>
            <ul className="space-y-px">
              {g.types.map((t) => (
                <li key={t}>
                  <PaletteItem type={t} onAdd={onAdd} disabled={disabled} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && <p className="px-1 text-xs text-fg-muted">No field types match “{query}”.</p>}
      </div>
      <p className="mt-auto border-t border-border px-4 py-3 text-xs text-fg-subtle">Click to add below the selected field, or drag onto the form.</p>
    </div>
  );
}

function PaletteItem({ type, onAdd, disabled }: { type: FormFieldType; onAdd: (t: FormFieldType) => void; disabled?: boolean }) {
  const meta = FIELD_TYPE_META[type];
  const Icon = meta.icon;
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `palette:${type}`, data: { from: 'palette', type }, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      title={meta.description}
      // Pointer drags only: Enter/Space must keep adding via click for keyboard users.
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
      onClick={() => onAdd(type)}
      className={cn(
        'group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg outline-none transition-colors',
        'hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        isDragging && 'opacity-50',
      )}
    >
      <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
      <span className="flex-1 truncate">{meta.label}</span>
      <GripVertical className="size-3.5 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

export function PaletteDragChip({ type }: { type: FormFieldType }) {
  const meta = FIELD_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div className="flex h-8 w-48 cursor-grabbing items-center gap-2 rounded-md border border-border bg-surface px-2 text-sm text-fg shadow-popover">
      <Icon className="size-4 text-fg-muted" strokeWidth={1.5} />
      {meta.label}
    </div>
  );
}
