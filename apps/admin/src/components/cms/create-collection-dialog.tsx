'use client';

import { slugify, type CollectionField } from '@atrium/schema';
import { AtriumApiError, type Collection } from '@atrium/sdk';
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export function normalizeRoutePrefix(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-/]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[/-]+|[/-]+$/g, '');
}

function singularize(name: string): string {
  const n = name.trim();
  if (/ies$/i.test(n)) return n.replace(/ies$/i, 'y');
  if (/(ss|us)$/i.test(n)) return n;
  if (/s$/i.test(n)) return n.slice(0, -1);
  return n;
}

const DEFAULT_FIELDS: CollectionField[] = [{ key: 'name', label: 'Name', type: 'text', required: true }];

export function CreateCollectionDialog({ open, onOpenChange, websiteId, existing, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; websiteId: string; existing: Collection[]; onCreated: (c: Collection) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [singular, setSingular] = useState('');
  const [singularTouched, setSingularTouched] = useState(false);
  const [routePrefix, setRoutePrefix] = useState('');
  const [errors, setErrors] = useState<{ name?: string; slug?: string; routePrefix?: string }>({});

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugTouched(false);
      setSingular('');
      setSingularTouched(false);
      setRoutePrefix('');
      setErrors({});
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      api.collections.create(websiteId, {
        name: name.trim(),
        slug,
        singularName: singular.trim() || undefined,
        routePrefix: routePrefix ? normalizeRoutePrefix(routePrefix) : undefined,
        fields: DEFAULT_FIELDS,
        titleField: 'name',
      }),
    onSuccess: (c) => {
      qc.setQueryData<Collection[]>(qk.collections(websiteId), (prev) => (prev ? [...prev, c] : [c]));
      qc.setQueryData(qk.collection(c.id), c);
      void qc.invalidateQueries({ queryKey: qk.collections(websiteId) });
      toast.success(`${c.name} created`);
      onOpenChange(false);
      onCreated(c);
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.isConflict) setErrors({ slug: 'A collection with this slug already exists' });
      else toast.error(errorMessage(err, 'Could not create collection'));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Name is required';
    if (!slug) next.slug = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(slug)) next.slug = 'Use lowercase letters, numbers and hyphens';
    else if (existing.some((c) => c.slug === slug)) next.slug = 'A collection with this slug already exists';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="New collection" description="Structured content you can list on pages and give its own detail page." />
          <DialogBody className="space-y-4">
            <Field label="Name" required error={errors.name}>
              <Input
                autoFocus
                placeholder="Rooms"
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  if (!slugTouched) setSlug(slugify(v));
                  if (!singularTouched) setSingular(singularize(v));
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug" required error={errors.slug} help="Used in the API and templates">
                <Input
                  className="font-mono text-xs"
                  placeholder="rooms"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                  }}
                  onBlur={() => setSlug((s) => slugify(s))}
                />
              </Field>
              <Field label="Singular name" optional>
                <Input
                  placeholder="Room"
                  value={singular}
                  onChange={(e) => {
                    setSingularTouched(true);
                    setSingular(e.target.value);
                  }}
                />
              </Field>
            </div>
            <Field label="Route prefix" optional error={errors.routePrefix} help={`Item pages are served at /${normalizeRoutePrefix(routePrefix) || slug || 'prefix'}/item-slug`}>
              <Input prefix={<span className="font-mono text-xs">/</span>} className="font-mono text-xs" placeholder={slug || 'rooms'} value={routePrefix} onChange={(e) => setRoutePrefix(e.target.value)} />
            </Field>
            <p className="text-xs text-fg-muted">
              Starts with a required <span className="font-mono text-fg">name</span> text field. Add more fields in the schema editor.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={create.isPending}>
              Create collection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
