'use client';

import { slugify } from '@atrium/schema';
import { AtriumApiError, type Collection } from '@atrium/sdk';
import { Banner, Button, Field, FieldGroup, Input, Textarea, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { DeleteCollectionDialog } from './collections-screen';
import { normalizeRoutePrefix } from './create-collection-dialog';
import { useSetCollectionCache } from './use-cms';
import { useUnsavedGuard } from './use-unsaved-guard';

interface FormState {
  name: string;
  singularName: string;
  description: string;
  slug: string;
  routePrefix: string;
}

const fromCollection = (c: Collection): FormState => ({ name: c.name, singularName: c.singularName ?? '', description: c.description ?? '', slug: c.slug, routePrefix: c.routePrefix ?? '' });

export function CollectionSettings({ websiteId, collection, collections, canManage }: { websiteId: string; collection: Collection; collections: Collection[]; canManage: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const setCache = useSetCollectionCache(websiteId);
  const [form, setForm] = useState<FormState>(() => fromCollection(collection));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const base = fromCollection(collection);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  useUnsavedGuard(dirty);

  const baseKey = JSON.stringify(base);
  useEffect(() => {
    setForm(JSON.parse(baseKey) as FormState);
  }, [baseKey]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api.collections.update(collection.id, {
        name: form.name.trim(),
        singularName: form.singularName.trim() || null,
        description: form.description.trim() || null,
        routePrefix: form.routePrefix ? normalizeRoutePrefix(form.routePrefix) : null,
        ...(form.slug !== collection.slug ? { slug: slugify(form.slug) } : {}),
      }),
    onSuccess: (c) => {
      setCache(c);
      toast.success('Collection settings saved');
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.isConflict) setErrors({ slug: 'Another collection uses this slug' });
      else toast.error(errorMessage(err, 'Could not save settings'));
    },
  });

  const remove = useMutation({
    mutationFn: () => api.collections.remove(collection.id),
    onSuccess: () => {
      qc.setQueryData<Collection[]>(qk.collections(websiteId), (prev) => prev?.filter((x) => x.id !== collection.id));
      toast.success(`${collection.name} deleted`);
      router.push(`/w/${websiteId}/cms`);
      qc.removeQueries({ queryKey: qk.collection(collection.id) });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete collection')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required';
    const slug = slugify(form.slug);
    if (!slug) next.slug = 'Slug is required';
    else if (collections.some((c) => c.id !== collection.id && c.slug === slug)) next.slug = 'Another collection uses this slug';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };

  const prefix = normalizeRoutePrefix(form.routePrefix);

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <fieldset disabled={!canManage} className="space-y-6">
        <FieldGroup title="General" description="How this collection appears in the admin and templates.">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={errors.name}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Singular name" optional help="Used for buttons like “New room”.">
                <Input value={form.singularName} onChange={(e) => set('singularName', e.target.value)} />
              </Field>
            </div>
            <Field label="Description" optional>
              <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this collection holds and where it’s used" />
            </Field>
            <Field label="Slug" required error={errors.slug} help={errors.slug ? undefined : 'Identifier used by collection lists and the API.'}>
              <Input className="font-mono text-xs" value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} onBlur={() => set('slug', slugify(form.slug))} />
            </Field>
            {form.slug !== collection.slug && (
              <Banner tone="warning" icon={<AlertTriangle />}>
                Pages and reference fields that point to <span className="font-mono text-xs">{collection.slug}</span> must be updated after changing the slug.
              </Banner>
            )}
          </div>
        </FieldGroup>

        <FieldGroup title="Detail pages" description="Give every item its own URL, rendered by the collection template page.">
          <Field label="Route prefix" optional help={prefix ? `Items are served at /${prefix}/item-slug` : 'Leave empty to disable item pages.'}>
            <Input prefix={<span className="font-mono text-xs">/</span>} className="font-mono text-xs" value={form.routePrefix} placeholder={collection.slug} onChange={(e) => set('routePrefix', e.target.value)} />
          </Field>
        </FieldGroup>
      </fieldset>

      {canManage && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || save.isPending} onClick={() => { setForm(base); setErrors({}); }}>
            Discard
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!dirty} loading={save.isPending}>
            Save changes
          </Button>
        </div>
      )}

      {canManage && (
        <section className="rounded-lg border border-danger/30 bg-surface">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg">Delete collection</h3>
              <p className="mt-0.5 text-xs text-fg-muted">Permanently removes the collection, its schema and all items.</p>
            </div>
            <Button variant="danger-ghost" size="sm" leadingIcon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        </section>
      )}

      <DeleteCollectionDialog collection={deleteOpen ? collection : null} onOpenChange={setDeleteOpen} onConfirm={() => remove.mutateAsync()} />
    </form>
  );
}
