'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '../dnd';
import { Button, cn, IconButton, Input, Textarea } from '@atrium/ui';
import { GripVertical, ListPlus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { optionValue } from '../form-model';

export interface FieldOption {
  label: string;
  value: string;
}

function parseBulk(text: string): FieldOption[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, value] = line.split(/\s*[|\t]\s*/);
      const l = (label ?? '').trim();
      return { label: l, value: (value ?? '').trim() || optionValue(l) };
    });
}

/** Label/value rows with drag reorder, add/remove and bulk paste. */
export function OptionsEditor({ options, onChange, disabled }: { options: FieldOption[]; onChange: (o: FieldOption[]) => void; disabled?: boolean }) {
  const [bulk, setBulk] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = options.map((_, i) => `opt-${i}`);

  const setAt = (i: number, patch: Partial<FieldOption>) => {
    const next = options.map((o, j) => (j === i ? { ...o, ...patch } : o));
    onChange(next);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onChange(arrayMove(options, from, to));
  };

  if (bulk !== null) {
    return (
      <div className="space-y-2">
        <Textarea
          autoFocus
          rows={Math.min(12, Math.max(4, bulk.split('\n').length + 1))}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          className="font-mono text-xs"
          aria-label="Options, one per line"
          placeholder={'One option per line\nLabel | value'}
        />
        <p className="text-xs text-fg-muted">One per line. Add “| value” to set a custom value.</p>
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => setBulk(null)}>
            Cancel
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              onChange(parseBulk(bulk));
              setBulk(null);
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)_24px] gap-1.5 px-0.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
        <span />
        <span>Label</span>
        <span>Value</span>
        <span />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {options.map((o, i) => (
              <OptionRow
                key={ids[i]}
                id={ids[i]!}
                option={o}
                disabled={disabled}
                onLabel={(label) => setAt(i, { label, ...(o.value === '' || o.value === optionValue(o.label) ? { value: optionValue(label) } : {}) })}
                onValue={(value) => setAt(i, { value })}
                onRemove={() => onChange(options.filter((_, j) => j !== i))}
                onPasteLines={(lines) => {
                  const parsed = parseBulk(lines);
                  const next = [...options];
                  next.splice(i, 1, ...parsed);
                  onChange(next);
                }}
                duplicate={!!o.value && options.findIndex((x) => x.value === o.value) !== i}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          leadingIcon={<Plus />}
          disabled={disabled}
          onClick={() => {
            const label = `Option ${options.length + 1}`;
            onChange([...options, { label, value: optionValue(label) }]);
          }}
        >
          Add option
        </Button>
        <Button size="xs" variant="ghost" leadingIcon={<ListPlus />} disabled={disabled} onClick={() => setBulk(options.map((o) => (o.value === optionValue(o.label) ? o.label : `${o.label} | ${o.value}`)).join('\n'))}>
          Bulk edit
        </Button>
      </div>
    </div>
  );
}

function OptionRow({
  id,
  option,
  disabled,
  duplicate,
  onLabel,
  onValue,
  onRemove,
  onPasteLines,
}: {
  id: string;
  option: FieldOption;
  disabled?: boolean;
  duplicate: boolean;
  onLabel: (v: string) => void;
  onValue: (v: string) => void;
  onRemove: () => void;
  onPasteLines: (text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-1.5', isDragging && 'relative z-10 opacity-80')}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${option.label}`}
        className="inline-flex h-7 w-4 cursor-grab items-center justify-center rounded-sm text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVertical className="size-3.5" strokeWidth={1.5} />
      </button>
      <Input
        size="sm"
        aria-label="Option label"
        value={option.label}
        disabled={disabled}
        onChange={(e) => onLabel(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.includes('\n')) {
            e.preventDefault();
            onPasteLines(text);
          }
        }}
      />
      <Input size="sm" aria-label="Option value" className="font-mono text-xs" value={option.value} invalid={duplicate || !option.value} disabled={disabled} onChange={(e) => onValue(e.target.value)} />
      <IconButton label="Remove option" size="xs" onClick={onRemove} disabled={disabled}>
        <X />
      </IconButton>
    </li>
  );
}
