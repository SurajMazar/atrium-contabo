'use client';

import { useDroppable } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { evaluateConditionGroup, validateSubmission, type FormField } from '@atrium/schema';
import { Badge, Banner, Button, cn, EmptyState, IconButton, SegmentedControl, Tooltip } from '@atrium/ui';
import { CircleCheck, Copy, Eye, GitBranch, GripVertical, LayoutList, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type PointerEventHandler } from 'react';
import { FieldPreview } from './field-preview';
import { useFormEditor } from './editor-context';

export type CanvasMode = 'build' | 'preview';

const SPAN: Record<FormField['width'], string> = {
  full: 'col-span-6',
  half: 'col-span-6 sm:col-span-3',
  third: 'col-span-6 sm:col-span-2',
};

export function FormCanvas({
  mode,
  onModeChange,
  insertAt,
  paletteDragging,
  onDuplicate,
  onDelete,
}: {
  mode: CanvasMode;
  onModeChange: (m: CanvasMode) => void;
  /** Field the palette item is hovering, and which side it would land on. */
  insertAt: { id: string; after: boolean } | null;
  paletteDragging: boolean;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { draft, selectedId, setSelectedId, readOnly } = useFormEditor();
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas', disabled: readOnly });
  const stacked = draft.settings.layout === 'stacked';
  const span = (f: FormField) => (stacked ? 'col-span-6' : SPAN[f.width ?? 'full']);

  // Preview state
  const initialValues = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of draft.fields) if (f.defaultValue !== undefined && f.defaultValue !== '') v[f.name] = f.defaultValue;
    return v;
  }, [draft.fields]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const data = { ...initialValues, ...values };

  const reset = () => {
    setValues({});
    setErrors({});
    setSubmitted(false);
  };

  const submit = () => {
    const res = validateSubmission(draft, data);
    const map: Record<string, string> = {};
    for (const e of res.errors) if (!map[e.field]) map[e.field] = e.message;
    setErrors(map);
    if (res.valid) setSubmitted(true);
  };

  const visibleInPreview = draft.fields.filter((f) => evaluateConditionGroup(f.showIf, data));

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-border bg-bg/95 px-4">
        <SegmentedControl
          size="sm"
          aria-label="Canvas mode"
          value={mode}
          onValueChange={(m) => {
            onModeChange(m);
            reset();
          }}
          options={[
            { value: 'build', label: 'Build', icon: <Pencil /> },
            { value: 'preview', label: 'Preview', icon: <Eye /> },
          ]}
        />
        <span className="ml-2 hidden text-xs text-fg-muted sm:inline">
          {mode === 'build' ? `${draft.fields.length} ${draft.fields.length === 1 ? 'field' : 'fields'}` : 'Interactive preview · conditions and validation run live'}
        </span>
        <div className="flex-1" />
        {mode === 'preview' && (
          <Button size="xs" variant="ghost" leadingIcon={<RotateCcw />} onClick={reset}>
            Reset
          </Button>
        )}
        {stacked && mode === 'build' && (
          <Tooltip content="Layout is set to stacked in Settings, so field widths are ignored">
            <Badge tone="outline">
              <LayoutList /> Stacked
            </Badge>
          </Tooltip>
        )}
      </div>

      <div className="flex-1 px-4 py-6 sm:px-8">
        <div
          ref={setNodeRef}
          className={cn('mx-auto max-w-2xl rounded-lg border border-border bg-surface p-5 sm:p-8 transition-colors', isOver && paletteDragging && draft.fields.length === 0 && 'border-accent')}
          onClick={(e) => {
            if (e.target === e.currentTarget && mode === 'build') setSelectedId(null);
          }}
        >
          {mode === 'preview' && submitted ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CircleCheck className="size-6 text-success" strokeWidth={1.5} />
              <p className="max-w-sm text-sm text-fg">{draft.settings.successMessage || 'Thank you.'}</p>
              {draft.settings.redirectUrl && <p className="text-xs text-fg-muted">Visitors are then redirected to {draft.settings.redirectUrl}</p>}
              <Button size="sm" variant="ghost" className="mt-2" onClick={reset}>
                Submit another response
              </Button>
            </div>
          ) : draft.fields.length === 0 ? (
            <EmptyState
              compact
              icon={<LayoutList />}
              title="Add your first field"
              description={readOnly ? 'This form has no fields yet.' : 'Drag a field type from the left, or click one to add it.'}
              className={cn('rounded-md border border-dashed border-border-strong', isOver && paletteDragging && 'border-accent bg-accent-soft/30')}
            />
          ) : mode === 'build' ? (
            <SortableContext items={draft.fields.map((f) => f.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-6 gap-x-4 gap-y-3">
                {draft.fields.map((f) => (
                  <SortableFieldCard
                    key={f.id}
                    field={f}
                    className={span(f)}
                    selected={selectedId === f.id}
                    readOnly={readOnly}
                    insert={paletteDragging && insertAt?.id === f.id ? (insertAt.after ? 'after' : 'before') : null}
                    onSelect={() => setSelectedId(f.id)}
                    onDuplicate={() => onDuplicate(f.id)}
                    onDelete={() => onDelete(f.id)}
                  />
                ))}
                {paletteDragging && insertAt === null && isOver && <div className="col-span-6 h-0.5 rounded-full bg-accent" aria-hidden />}
              </div>
            </SortableContext>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="grid grid-cols-6 gap-x-4 gap-y-5"
            >
              {visibleInPreview.map((f) => (
                <div key={f.id} className={span(f)}>
                  <FieldPreview
                    field={f}
                    interactive
                    value={data[f.name]}
                    error={errors[f.name]}
                    onChange={(v) => {
                      setValues((s) => ({ ...s, [f.name]: v }));
                      if (errors[f.name]) setErrors(({ [f.name]: _drop, ...rest }) => rest);
                    }}
                  />
                </div>
              ))}
              {Object.keys(errors).length > 0 && (
                <div className="col-span-6">
                  <Banner tone="danger">Fix the highlighted fields to continue.</Banner>
                </div>
              )}
              <div className="col-span-6 pt-1">
                {/* Inverted, neutral style: this is the visitor's button, not an admin action. */}
                <button type="submit" className="inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg outline-none hover:bg-fg/90 focus-visible:ring-2 focus-visible:ring-ring">
                  {draft.settings.submitLabel || 'Send'}
                </button>
              </div>
            </form>
          )}

          {mode === 'build' && draft.fields.length > 0 && (
            <div className="mt-6 border-t border-border pt-5">
              <span className="inline-flex h-9 items-center rounded-md bg-fg/90 px-4 text-sm font-medium text-bg opacity-60" aria-hidden>
                {draft.settings.submitLabel || 'Send'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableFieldCard({
  field,
  className,
  selected,
  readOnly,
  insert,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  field: FormField;
  className: string;
  selected: boolean;
  readOnly: boolean;
  insert: 'before' | 'after' | null;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, disabled: readOnly });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) {
      e.preventDefault();
      onDelete();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', className, isDragging && 'z-20')}
    >
      {insert && <div className={cn('absolute left-0 right-0 h-0.5 rounded-full bg-accent', insert === 'before' ? '-top-2' : '-bottom-2')} aria-hidden />}
      <div
        role="group"
        tabIndex={0}
        aria-label={`${field.label || field.name} field${selected ? ', selected' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onKeyDown={onKeyDown}
        // Whole card is a pointer drag surface; keyboard drags use the handle.
        onPointerDown={readOnly ? undefined : (listeners?.onPointerDown as PointerEventHandler<HTMLDivElement> | undefined)}
        className={cn(
          'group/field relative cursor-default rounded-md border px-3 py-2.5 outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring',
          selected ? 'border-accent bg-accent-soft/20' : 'border-transparent hover:border-border',
          isDragging && 'border-border bg-surface shadow-popover',
        )}
      >
        {field.showIf && field.showIf.conditions.length > 0 && (
          <span className="absolute -top-2 left-2">
            <Badge size="xs" tone="outline" className="bg-surface">
              <GitBranch /> Conditional
            </Badge>
          </span>
        )}
        {!readOnly && (
          <div
            className={cn(
              'absolute -top-3 right-2 z-10 flex items-center rounded-md border border-border bg-surface shadow-xs transition-opacity',
              selected ? 'opacity-100' : 'opacity-0 group-hover/field:opacity-100 group-focus-within/field:opacity-100',
            )}
          >
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${field.label || field.name}`}
              className="inline-flex size-6 cursor-grab items-center justify-center rounded-l-md text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" strokeWidth={1.5} />
            </button>
            <IconButton
              label="Duplicate field"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
            >
              <Copy />
            </IconButton>
            <IconButton
              label="Delete field"
              size="xs"
              className="hover:text-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 />
            </IconButton>
          </div>
        )}
        <FieldPreview field={field} />
      </div>
    </div>
  );
}
