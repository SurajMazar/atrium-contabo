'use client';

import { slugify } from '@atrium/schema';
import { AtriumApiError, type Collection, type CollectionItemDto } from '@atrium/sdk';
import { Banner, Button, ConfirmDialog, CopyButton, EmptyState, Field, Input, Kbd, Select, Sheet, SheetContent, StatusDot, toast, Tooltip } from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Layers, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { ItemFieldInput, type FieldInputContext } from './item-field-input';
import { autoSlug, toFormState, toPayload, validateItem, type ItemFormState } from './item-model';
import { useUnsavedGuard } from './use-unsaved-guard';
import { asStatus, detailMessages, ITEM_STATUSES, itemTitle, mapServerErrors, STATUS_META, textOf } from './values';

export interface ItemEditorSheetProps {
  open: boolean;
  /** Changes every time the editor is opened (remounts the form). */
  sessionKey: number;
  /** Item to edit; null creates a new one. */
  item: CollectionItemDto | null;
  collection: Collection;
  collections: Collection[];
  websiteId: string;
  organizationId: string | undefined;
  singular: string;
  canEdit: boolean;
  canManage: boolean;
  onClose: () => void;
  onSaved: (item: CollectionItemDto, created: boolean) => void;
  onDelete: (item: CollectionItemDto) => Promise<unknown>;
  onOpenSchema: () => void;
}

const STATUS_TONE = { draft: 'neutral', published: 'success', archived: 'warning' } as const;

export function ItemEditorSheet(props: ItemEditorSheetProps) {
  const { open, item, collection, singular, onClose } = props;
  const [confirmClose, setConfirmClose] = useState(false);
  const dirtyRef = useRef(false);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) setConfirmClose(true);
    else onClose();
  }, [onClose]);

  const title = item ? itemTitle(item, collection.fields, collection.titleField) : `New ${singular.toLowerCase()}`;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && requestClose()}>
        <SheetContent
          size="xl"
          data-cms-item-editor=""
          title={title}
          description={item ? `${collection.name} · Updated ${timeAgo(item.updatedAt)}` : collection.name}
          bodyClassName="p-0"
          onOpenAutoFocus={(e) => {
            // Focus the first field instead of the close button.
            const el = document.querySelector<HTMLElement>('[data-cms-item-editor] [data-item-form] :is(input:not([type=hidden]), textarea, [contenteditable=true], button[role=combobox], button[role=switch])');
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          {open && <ItemEditorBody key={props.sessionKey} {...props} dirtyRef={dirtyRef} requestClose={requestClose} />}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard unsaved changes?"
        description="Your edits to this item will be lost."
        confirmLabel="Discard changes"
        tone="danger"
        onConfirm={() => {
          dirtyRef.current = false;
          onClose();
        }}
      />
    </>
  );
}

function ItemEditorBody({ item, collection, collections, websiteId, organizationId, singular, canEdit, canManage, onSaved, onDelete, onOpenSchema, dirtyRef, requestClose }: ItemEditorSheetProps & { dirtyRef: { current: boolean }; requestClose: () => void }) {
  const api = useApi();
  const fields = collection.fields;
  const [current, setCurrent] = useState<CollectionItemDto | null>(item);
  const [initial, setInitial] = useState<ItemFormState>(() => toFormState(fields, item));
  const [form, setForm] = useState<ItemFormState>(initial);
  const [resetKey, setResetKey] = useState(0);
  const [slugTouched, setSlugTouched] = useState(!!item);
  const [touchedSlugFields, setTouchedSlugFields] = useState<Set<string>>(() => new Set(fields.filter((f) => f.type === 'slug' && item?.data[f.key]).map((f) => f.key)));
  const [jsonErrors, setJsonErrors] = useState<Record<string, string | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugError, setSlugError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !current;
  const readOnly = !canEdit;

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Object.values(jsonErrors).some(Boolean);
  dirtyRef.current = dirty && !readOnly;
  useUnsavedGuard(dirty && !readOnly);

  // Live re-validation after the first submit attempt.
  useEffect(() => {
    if (submitted) setErrors(validateItem(fields, form.values, jsonErrors));
  }, [submitted, fields, form.values, jsonErrors]);

  const setValue = (key: string, v: unknown) =>
    setForm((prev) => {
      const values = { ...prev.values, [key]: v };
      let slug = prev.slug;
      if (key === collection.titleField) {
        const s = autoSlug(fields, collection.titleField, values);
        if (!slugTouched && isNew) slug = s;
        for (const f of fields) if (f.type === 'slug' && f.key !== key && !touchedSlugFields.has(f.key)) values[f.key] = s || undefined;
      }
      return { ...prev, values, slug };
    });

  const ctx: FieldInputContext = useMemo(
    () => ({
      organizationId: organizationId ?? '',
      websiteId,
      collections,
      disabled: readOnly,
      onJsonError: (key, e) => setJsonErrors((p) => (p[key] === e ? p : { ...p, [key]: e })),
      onSlugTouched: (key) => setTouchedSlugFields((p) => (p.has(key) ? p : new Set(p).add(key))),
    }),
    [organizationId, websiteId, collections, readOnly],
  );

  const save = useMutation({
    mutationFn: async () => {
      const slug = form.slug ? slugify(form.slug) : undefined;
      if (current) {
        return api.collections.updateItem(current.id, {
          data: toPayload(fields, form.values, 'update'),
          status: form.status,
          ...(slug && slug !== current.slug ? { slug } : {}),
        });
      }
      return api.collections.createItem(collection.id, { data: toPayload(fields, form.values, 'create'), status: form.status, slug });
    },
    onSuccess: (saved) => {
      const created = !current;
      const next = toFormState(fields, saved);
      setCurrent(saved);
      setInitial(next);
      setForm(next);
      setSlugTouched(true);
      setSubmitted(false);
      setErrors({});
      setFormError(undefined);
      setSlugError(undefined);
      dirtyRef.current = false;
      onSaved(saved, created);
      toast.success(created ? `${singular} created` : 'Changes saved');
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.isConflict) {
        setSlugError('This slug is already used by another item');
        return;
      }
      if (err instanceof AtriumApiError && err.isValidation) {
        const msgs = detailMessages(err.details);
        const { byKey, rest } = mapServerErrors(fields, msgs.length ? msgs : [err.message]);
        setErrors(byKey);
        setFormError(rest[0] ?? (Object.keys(byKey).length ? undefined : err.message));
        return;
      }
      toast.error(errorMessage(err, 'Could not save item'));
    },
  });

  const submit = useCallback(() => {
    if (readOnly || save.isPending) return;
    setSubmitted(true);
    const errs = validateItem(fields, form.values, jsonErrors);
    setErrors(errs);
    if (form.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugify(form.slug))) {
      setSlugError('Use lowercase letters, numbers and hyphens');
      return;
    }
    setSlugError(undefined);
    if (Object.keys(errs).length) {
      const firstKey = fields.find((f) => errs[f.key])?.key;
      if (firstKey) document.getElementById(`item-field-${firstKey}`)?.focus();
      return;
    }
    save.mutate();
  }, [readOnly, save, fields, form, jsonErrors]);

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [submit]);

  const discard = () => {
    setForm(initial);
    setJsonErrors({});
    setErrors({});
    setSubmitted(false);
    setResetKey((k) => k + 1);
  };

  const errorCount = Object.keys(errors).length;
  const prefix = collection.routePrefix ? `/${collection.routePrefix}/` : '/';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div data-item-form key={resetKey} className="min-w-0 space-y-5">
            {formError && (
              <Banner tone="danger" icon={<AlertCircle />}>
                {formError}
              </Banner>
            )}
            {submitted && errorCount > 0 && !formError && (
              <Banner tone="danger" icon={<AlertCircle />}>
                {errorCount === 1 ? '1 field needs attention.' : `${errorCount} fields need attention.`}
              </Banner>
            )}
            {fields.length === 0 ? (
              <EmptyState
                compact
                icon={<Layers />}
                title="This collection has no fields"
                description="Add fields in the schema to start entering content."
                action={
                  canManage && (
                    <Button size="sm" onClick={onOpenSchema}>
                      Edit schema
                    </Button>
                  )
                }
              />
            ) : (
              fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} help={f.helpText} error={errors[f.key]} htmlFor={`item-field-${f.key}`} hint={f.localized ? <span className="text-2xs uppercase tracking-wide">Localized</span> : undefined}>
                  <ItemFieldInput field={f} id={`item-field-${f.key}`} value={form.values[f.key]} invalid={!!errors[f.key]} onChange={(v) => setValue(f.key, v)} ctx={ctx} />
                </Field>
              ))
            )}
          </div>

          <aside className="space-y-4 md:sticky md:top-0 md:self-start">
            <div className="space-y-4 rounded-lg border border-border bg-surface-2/40 p-3">
              <Field label="Status">
                <Select
                  size="sm"
                  disabled={readOnly}
                  value={form.status}
                  onValueChange={(v) => setForm((p) => ({ ...p, status: asStatus(v) }))}
                  options={ITEM_STATUSES.map((s) => ({ value: s, label: <StatusDot tone={STATUS_TONE[s]} label={STATUS_META[s].label} /> }))}
                />
              </Field>
              <Field label="Slug" error={slugError} help={slugError ? undefined : isNew && !slugTouched ? 'Generated from the title' : collection.routePrefix ? `${prefix}${form.slug || '…'}` : undefined}>
                <Input
                  size="sm"
                  className="font-mono text-xs"
                  disabled={readOnly}
                  value={form.slug}
                  placeholder={autoSlug(fields, collection.titleField, form.values) || 'item-slug'}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }));
                  }}
                  onBlur={() => setForm((p) => ({ ...p, slug: p.slug ? slugify(p.slug) : p.slug }))}
                />
              </Field>
              {!isNew && current && form.slug !== current.slug && collection.routePrefix && <p className="text-xs text-warning">Changing the slug changes this item’s URL.</p>}
            </div>
            {current && (
              <dl className="space-y-2 px-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">Updated</dt>
                  <dd className="text-fg" title={formatDateTime(current.updatedAt)}>
                    {timeAgo(current.updatedAt)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">ID</dt>
                  <dd className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-mono text-2xs text-fg-subtle">{current.id}</span>
                    <CopyButton value={current.id} label="Copy item ID" />
                  </dd>
                </div>
                {textOf(fields.find((f) => f.key === collection.titleField), form.values[collection.titleField]) === '' && (
                  <p className="text-fg-subtle">No title yet; lists show the slug.</p>
                )}
              </dl>
            )}
          </aside>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3">
        {current && canEdit && (
          <Button variant="danger-ghost" size="sm" leadingIcon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
        <div className="flex-1" />
        {readOnly ? (
          <span className="text-xs text-fg-muted">You can view but not edit items.</span>
        ) : (
          <>
            {dirty && !isNew && (
              <Button variant="ghost" size="sm" onClick={discard} disabled={save.isPending}>
                Discard
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={requestClose}>
              {isNew ? 'Cancel' : 'Close'}
            </Button>
            <Tooltip content="Save" shortcut={<span className="flex gap-0.5"><Kbd>⌘</Kbd><Kbd>S</Kbd></span>}>
              <Button variant="primary" size="sm" loading={save.isPending} disabled={!isNew && !dirty} onClick={submit}>
                {isNew ? `Create ${singular.toLowerCase()}` : 'Save changes'}
              </Button>
            </Tooltip>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title={`Delete “${current ? itemTitle(current, fields, collection.titleField) : ''}”?`}
        description="This permanently deletes the item. References to it from other collections will be empty."
        confirmLabel="Delete item"
        onConfirm={async () => {
          if (!current) return;
          dirtyRef.current = false;
          await onDelete(current);
        }}
      />
    </div>
  );
}
