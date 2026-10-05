'use client';

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CollectionFieldType } from '@atrium/schema';
import type { Collection } from '@atrium/sdk';
import {
  Badge,
  Banner,
  Button,
  cn,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Kbd,
  Select,
  toast,
  Tooltip,
} from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowDown, ArrowUp, Copy, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatNumber, pluralize } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { FIELD_TYPE_META, uniqueKey } from './field-types';
import { FieldSettingsSheet } from './field-settings-sheet';
import { FieldTypeIcon, FieldTypePicker } from './field-type-picker';
import { fromDraft, newDraftField, schemaSignature, titleCandidates, toDraft, validateDraft, type DraftField } from './schema-model';
import { announcements, DragHandle, restrictToVerticalAxis, Sortable, useSortSensors } from './sortable';
import { useSetCollectionCache } from './use-cms';
import { useUnsavedGuard } from './use-unsaved-guard';
import { isEmptyValue } from './values';

interface PendingRemoval {
  field: DraftField;
  withData: number;
  scanned: number;
  total: number;
}

export function SchemaEditor({ websiteId, collection, collections, canManage, active = true, onDirtyChange }: { websiteId: string; collection: Collection; collections: Collection[]; canManage: boolean; active?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const setCache = useSetCollectionCache(websiteId);
  const sensors = useSortSensors();
  const [draft, setDraft] = useState<DraftField[]>(() => toDraft(collection.fields));
  const [titleId, setTitleId] = useState<string | null>(() => `saved:${collection.titleField}`);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const baseline = useMemo(() => schemaSignature(fromDraft(toDraft(collection.fields)), collection.titleField), [collection.fields, collection.titleField]);
  const titleField = draft.find((f) => f._id === titleId);
  const resolvedTitleKey = titleField?.key ?? titleCandidates(draft)[0]?.key ?? draft[0]?.key ?? collection.titleField;
  const signature = schemaSignature(fromDraft(draft), resolvedTitleKey);
  const dirty = signature !== baseline;
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const errorCount = Object.keys(errors).length;

  // Re-seed from the server when it changes underneath us and the draft had no pending edits.
  const lastBaseline = useRef(baseline);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  useEffect(() => {
    if (lastBaseline.current === baseline) return;
    const hadEdits = signatureRef.current !== lastBaseline.current;
    lastBaseline.current = baseline;
    if (!hadEdits) {
      setDraft(toDraft(collection.fields));
      setTitleId(`saved:${collection.titleField}`);
    }
  }, [baseline, collection.fields, collection.titleField]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const save = useMutation({
    mutationFn: () => api.collections.update(collection.id, { fields: fromDraft(draft), titleField: resolvedTitleKey }),
    onSuccess: (c) => {
      setCache(c);
      lastBaseline.current = schemaSignature(fromDraft(toDraft(c.fields)), c.titleField);
      setDraft(toDraft(c.fields));
      setTitleId(`saved:${c.titleField}`);
      setShowErrors(false);
      void qc.invalidateQueries({ queryKey: qk.collectionItemsAll(c.id) });
      toast.success('Schema saved');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save schema')),
  });

  const trySave = useCallback(() => {
    if (!dirty || save.isPending) return;
    if (errorCount > 0) {
      setShowErrors(true);
      const first = draft.find((f) => errors[f._id]);
      if (first) setEditingId(first._id);
      toast.error(`Fix ${errorCount} ${pluralize(errorCount, 'field')} before saving`);
      return;
    }
    save.mutate();
  }, [dirty, save, errorCount, draft, errors]);

  const discard = () => {
    setDraft(toDraft(collection.fields));
    setTitleId(`saved:${collection.titleField}`);
    setShowErrors(false);
    setEditingId(null);
  };

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && canManage) {
        e.preventDefault();
        trySave();
      }
    };
    if (!active) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trySave, canManage, active]);

  const patchField = (id: string, patch: Partial<DraftField>) => setDraft((d) => d.map((f) => (f._id === id ? { ...f, ...patch } : f)));

  const addField = (type: CollectionFieldType) => {
    const f = newDraftField(type, draft);
    setDraft((d) => [...d, f]);
    setEditingId(f._id);
  };

  const duplicate = (f: DraftField) => {
    const copy = newDraftField(f.type, draft);
    const { _id, _orig, _keyTouched, ...rest } = f;
    const next: DraftField = { ...rest, _id: copy._id, key: uniqueKey(`${f.key}Copy`, draft.map((x) => x.key)), label: `${f.label} copy`, _keyTouched: true };
    setDraft((d) => {
      const i = d.findIndex((x) => x._id === f._id);
      const out = [...d];
      out.splice(i + 1, 0, next);
      return out;
    });
    setEditingId(next._id);
  };

  const move = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.findIndex((f) => f._id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.length) return d;
      return arrayMove(d, i, j);
    });

  const doRemove = (f: DraftField) => {
    const index = draft.findIndex((x) => x._id === f._id);
    setDraft((d) => d.filter((x) => x._id !== f._id));
    if (editingId === f._id) setEditingId(null);
    toast(`Removed “${f.label || f.key}”`, {
      description: 'Save the schema to apply.',
      action: {
        label: 'Undo',
        onClick: () =>
          setDraft((d) => {
            if (d.some((x) => x._id === f._id)) return d;
            const out = [...d];
            out.splice(Math.min(index, out.length), 0, f);
            return out;
          }),
      },
    });
  };

  /** Removing a saved field: check whether existing items hold data for it first. */
  const requestRemove = async (f: DraftField) => {
    if (draft.length <= 1) return;
    const origKey = f._orig?.key;
    if (!origKey || !collection.itemCount) return doRemove(f);
    setCheckingId(f._id);
    try {
      const page = await qc.fetchQuery({
        queryKey: [...qk.collectionItemsAll(collection.id), 'usage-scan'],
        queryFn: () => api.collections.items(collection.id, { limit: 200 }),
        staleTime: 30_000,
      });
      const withData = page.items.filter((i) => !isEmptyValue(i.data[origKey])).length;
      if (withData === 0 && !page.nextCursor) return doRemove(f);
      setPendingRemoval({ field: f, withData, scanned: page.items.length, total: page.total ?? collection.itemCount ?? page.items.length });
    } catch {
      setPendingRemoval({ field: f, withData: -1, scanned: 0, total: collection.itemCount ?? 0 });
    } finally {
      setCheckingId(null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setDraft((d) => arrayMove(d, d.findIndex((f) => f._id === e.active.id), d.findIndex((f) => f._id === e.over!.id)));
  };

  const candidates = titleCandidates(draft);
  const editing = draft.find((f) => f._id === editingId) ?? null;
  const visibleErrors = showErrors ? errors : Object.fromEntries(Object.entries(errors).filter(([id]) => id === editingId || draft.find((f) => f._id === id)?._orig));

  const removalCopy = (p: PendingRemoval) => {
    if (p.withData < 0) return `Existing items may contain values for “${p.field.label}”. They will no longer be shown, and are dropped the next time each item is saved.`;
    const partial = p.scanned < p.total;
    return `${partial ? 'At least ' : ''}${formatNumber(p.withData)} of ${formatNumber(p.total)} ${pluralize(p.total, 'item')} ${p.withData === 1 && !partial ? 'has' : 'have'} a value for “${p.field.label}”. Those values will no longer be shown, and are dropped the next time each item is saved.`;
  };

  return (
    <div className="pb-16">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 rounded-lg border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">Fields</h3>
              <span className="rounded-sm bg-surface-3 px-1 text-2xs tabular-nums text-fg-muted">{draft.length}</span>
            </div>
            {canManage && (
              <FieldTypePicker onPick={addField}>
                <Button size="sm" leadingIcon={<Plus />}>
                  Add field
                </Button>
              </FieldTypePicker>
            )}
          </header>

          {draft.length === 0 ? (
            <EmptyState
              compact
              icon={<Layers />}
              title="No fields yet"
              description="Fields define what every item in this collection contains."
              action={
                canManage && (
                  <FieldTypePicker onPick={addField} align="start">
                    <Button size="sm" variant="primary" leadingIcon={<Plus />}>
                      Add field
                    </Button>
                  </FieldTypePicker>
                )
              }
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd} accessibility={{ announcements: announcements((id) => draft.find((f) => f._id === id)?.label || 'field') }}>
              <SortableContext items={draft.map((f) => f._id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-border" aria-label="Fields">
                  {draft.map((f, i) => {
                    const err = visibleErrors[f._id];
                    const isTitle = f.key === resolvedTitleKey;
                    const isNew = !f._orig;
                    const changed = !!f._orig && JSON.stringify(fromDraft([f])[0]) !== JSON.stringify(fromDraft(toDraft([f._orig]))[0]);
                    return (
                      <Sortable key={f._id} id={f._id} disabled={!canManage}>
                        {({ setNodeRef, style, handleProps, isDragging }) => (
                          <li
                            ref={setNodeRef}
                            style={style}
                            className={cn('group flex items-center gap-2 bg-surface px-2 py-2 transition-colors hover:bg-surface-2/50', isDragging && 'rounded-md shadow-popover', editingId === f._id && 'bg-accent-soft/40')}
                          >
                            {canManage ? <DragHandle {...handleProps} label={`Reorder ${f.label || f.key}`} /> : <span className="w-1" />}
                            <FieldTypeIcon type={f.type} />
                            <button type="button" onClick={() => setEditingId(f._id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-medium text-fg">{f.label || <span className="text-fg-subtle">Untitled field</span>}</span>
                                  {f.required && (
                                    <span className="text-danger" aria-label="Required">
                                      *
                                    </span>
                                  )}
                                  {isNew && <Badge tone="accent" size="xs">New</Badge>}
                                  {changed && <Badge tone="warning" size="xs">Edited</Badge>}
                                </span>
                                <span className="block truncate font-mono text-2xs text-fg-subtle">{f.key || '—'}</span>
                              </span>
                              <span className="hidden items-center gap-1 sm:flex">
                                {isTitle && <Badge tone="outline" size="xs">Title</Badge>}
                                {f.unique && <Badge tone="outline" size="xs">Unique</Badge>}
                                {f.localized && <Badge tone="outline" size="xs">Localized</Badge>}
                                {f.relation && <Badge tone="outline" size="xs" className="font-mono">→ {f.relation}</Badge>}
                                <Badge size="xs">{FIELD_TYPE_META[f.type]?.label ?? f.type}</Badge>
                              </span>
                              {err && (
                                <Tooltip content={Object.values(err)[0]}>
                                  <span className="text-danger" aria-label={`Has errors: ${Object.values(err).join(', ')}`}>
                                    <AlertCircle className="size-4" strokeWidth={1.5} />
                                  </span>
                                </Tooltip>
                              )}
                            </button>
                            {canManage && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton label={`Actions for ${f.label || f.key}`} size="xs" loading={checkingId === f._id}>
                                    <MoreHorizontal />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditingId(f._id)}>
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem icon={<Copy />} onSelect={() => duplicate(f)}>
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuItem icon={<ArrowUp />} disabled={i === 0} onSelect={() => move(f._id, -1)}>
                                    Move up
                                  </DropdownMenuItem>
                                  <DropdownMenuItem icon={<ArrowDown />} disabled={i === draft.length - 1} onSelect={() => move(f._id, 1)}>
                                    Move down
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem icon={<Trash2 />} tone="danger" disabled={draft.length <= 1} onSelect={() => void requestRemove(f)}>
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </li>
                        )}
                      </Sortable>
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <Field label="Title field" help="Identifies items in lists, references and the browser tab.">
              {candidates.length > 0 ? (
                <Select
                  disabled={!canManage}
                  value={titleField && candidates.includes(titleField) ? titleField._id : candidates[0]?._id}
                  onValueChange={setTitleId}
                  options={candidates.map((f) => ({ value: f._id, label: f.label || f.key, description: f.key }))}
                />
              ) : (
                <Banner tone="warning">Add a text field to use as the item title.</Banner>
              )}
            </Field>
          </section>
          <section className="rounded-lg border border-border bg-surface p-4 text-xs text-fg-muted">
            <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Tips</div>
            <ul className="space-y-1.5">
              <li>Drag fields to set their order in the item editor.</li>
              <li>Keys are what templates and the API use; labels can change freely.</li>
              <li>
                Press <Kbd>⌘</Kbd>
                <Kbd>S</Kbd> to save.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {canManage && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 pointer-events-none">
          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 shadow-popover animate-slide-up" role="region" aria-label="Unsaved schema changes">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
            <span className="flex-1 text-sm text-fg">
              Unsaved schema changes
              {errorCount > 0 && showErrors && <span className="ml-2 text-xs text-danger">{errorCount} with errors</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={discard} disabled={save.isPending}>
              Discard
            </Button>
            <Button size="sm" variant="primary" loading={save.isPending} onClick={trySave}>
              Save schema
            </Button>
          </div>
        </div>
      )}

      <FieldSettingsSheet
        field={editing}
        errors={editing ? visibleErrors[editing._id] ?? (showErrors ? errors[editing._id] : undefined) : undefined}
        allFields={draft}
        collections={collections}
        currentCollectionId={collection.id}
        isTitle={!!editing && editing.key === resolvedTitleKey}
        readOnly={!canManage}
        onChange={patchField}
        onRemove={(f) => void requestRemove(f)}
        onClose={() => setEditingId(null)}
      />

      <ConfirmDialog
        open={!!pendingRemoval}
        onOpenChange={(o) => !o && setPendingRemoval(null)}
        tone="danger"
        title={`Remove “${pendingRemoval?.field.label ?? ''}”?`}
        description={pendingRemoval ? removalCopy(pendingRemoval) : undefined}
        confirmLabel="Remove field"
        onConfirm={() => {
          if (pendingRemoval) doRemove(pendingRemoval.field);
        }}
      />
    </div>
  );
}
