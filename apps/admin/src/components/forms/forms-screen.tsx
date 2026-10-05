'use client';

import { AtriumApiError, type FormDto } from '@atrium/sdk';
import { slugify } from '@atrium/schema';
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  nextSort,
  PageHeader,
  Skeleton,
  sortRows,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
  type SortState,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Copy, Inbox, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, formatNumber, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { cloneDefinition, DEFAULT_SETTINGS, defaultFields, normalizeForm, uniqueSlug } from './form-model';

export function FormsScreen({ websiteId }: { websiteId: string }) {
  return (
    <PermissionPage permission="form.read" websiteId={websiteId}>
      <FormsList websiteId={websiteId} />
    </PermissionPage>
  );
}

function FormsList({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'updatedAt', dir: 'desc' });
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<FormDto | null>(null);

  const canCreate = can('form.create', websiteId);
  const canDelete = can('form.delete', websiteId);
  const canUpdate = can('form.update', websiteId);
  const canSubmissions = can('submission.read', websiteId);

  const q = useQuery({ queryKey: qk.forms(websiteId), queryFn: () => api.forms.list(websiteId) });

  const rows = useMemo(() => {
    const f = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((x) => !f || x.name.toLowerCase().includes(f) || x.slug.includes(f));
    return sortRows(list, sort ?? { key: 'updatedAt', dir: 'desc' }, (r, k) => (k === 'fields' ? (r.fields?.length ?? 0) : k === 'submissions' ? (r.submissionCount ?? 0) : (r as unknown as Record<string, unknown>)[k]));
  }, [q.data, search, sort]);

  const prefetch = (id: string) => void qc.prefetchQuery({ queryKey: qk.form(id), queryFn: () => api.forms.get(id), staleTime: 30_000 });

  const duplicate = useMutation({
    mutationFn: async (form: FormDto) => {
      const full = form.fields ? form : await api.forms.get(form.id);
      const def = normalizeForm(full);
      const slugs = (q.data ?? []).map((x) => x.slug);
      return api.forms.create(websiteId, cloneDefinition(def, `${def.name} copy`.slice(0, 120), uniqueSlug(`${def.slug}-copy`, slugs)));
    },
    onSuccess: (created) => {
      toast.success('Form duplicated', { action: { label: 'Open', onClick: () => router.push(`/w/${websiteId}/forms/${created.id}`) } });
      void qc.invalidateQueries({ queryKey: qk.forms(websiteId) });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not duplicate the form')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.forms.remove(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.forms(websiteId) });
      const prev = qc.getQueryData<FormDto[]>(qk.forms(websiteId));
      qc.setQueryData<FormDto[]>(qk.forms(websiteId), (list) => list?.filter((f) => f.id !== id));
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.forms(websiteId), ctx.prev);
      toast.error(errorMessage(err, 'Could not delete the form'));
    },
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: qk.form(id) });
      toast.success('Form deleted');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.forms(websiteId) }),
  });

  const sortable = (key: string, label: string, align?: 'right') => (
    <TH sortable align={align} sorted={sort?.key === key && sort.dir} onSort={() => setSort((s) => nextSort(s, key))}>
      {label}
    </TH>
  );

  return (
    <Page width="wide">
      <PageHeader
        title="Forms"
        description="Collect enquiries, bookings and sign-ups, and automate what happens next."
        actions={
          canCreate && (
            <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setCreateOpen(true)}>
              New form
            </Button>
          )
        }
      />

      {(q.data?.length ?? 0) > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <Input size="sm" prefix={<Search />} placeholder="Search forms" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" aria-label="Search forms" />
        </div>
      )}

      {q.isPending ? (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH className="hidden md:table-cell">Slug</TH>
                <TH align="right">Fields</TH>
                <TH align="right">Submissions</TH>
                <TH align="right">Updated</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TR key={i}>
                  <TD>
                    <Skeleton className="h-3.5 w-40" />
                  </TD>
                  <TD className="hidden md:table-cell">
                    <Skeleton className="h-3.5 w-24" />
                  </TD>
                  <TD align="right">
                    <Skeleton className="ml-auto h-3.5 w-6" />
                  </TD>
                  <TD align="right">
                    <Skeleton className="ml-auto h-3.5 w-10" />
                  </TD>
                  <TD align="right">
                    <Skeleton className="ml-auto h-3.5 w-14" />
                  </TD>
                  <TD />
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      ) : q.isError ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<ClipboardList />}
            title="Create your first form"
            description="Start with name, email and message fields, then add conditional logic, spam protection and email notifications."
            action={
              canCreate && (
                <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setCreateOpen(true)}>
                  New form
                </Button>
              )
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="No forms match" description="Try a different search." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                {sortable('name', 'Name')}
                <TH className="hidden md:table-cell">Slug</TH>
                {sortable('fields', 'Fields', 'right')}
                {sortable('submissions', 'Submissions', 'right')}
                {sortable('updatedAt', 'Updated', 'right')}
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((f) => {
                const href = `/w/${websiteId}/forms/${f.id}`;
                return (
                  <TR key={f.id} interactive onClick={() => router.push(href)} onMouseEnter={() => prefetch(f.id)}>
                    <TD>
                      <Link href={href} className="font-medium text-fg outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                        {f.name}
                      </Link>
                      <div className="font-mono text-2xs text-fg-subtle md:hidden">{f.slug}</div>
                    </TD>
                    <TD mono muted className="hidden md:table-cell">
                      {f.slug}
                    </TD>
                    <TD align="right" muted>
                      {f.fields ? formatNumber(f.fields.filter((x) => x.type !== 'heading' && x.type !== 'paragraph').length) : '—'}
                    </TD>
                    <TD align="right">
                      {typeof f.submissionCount === 'number' ? (
                        canSubmissions ? (
                          <Link href={`/w/${websiteId}/submissions?formId=${encodeURIComponent(f.id)}`} onClick={(e) => e.stopPropagation()} className="text-fg hover:underline">
                            {formatNumber(f.submissionCount)}
                          </Link>
                        ) : (
                          formatNumber(f.submissionCount)
                        )
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </TD>
                    <TD align="right" muted>
                      <span title={f.updatedAt ? formatDateTime(f.updatedAt) : undefined}>{f.updatedAt ? timeAgo(f.updatedAt) : '—'}</span>
                    </TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton label={`Actions for ${f.name}`} size="xs">
                            <MoreHorizontal />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem icon={<Pencil />} onSelect={() => router.push(href)}>
                            {canUpdate ? 'Edit' : 'View'}
                          </DropdownMenuItem>
                          {canSubmissions && (
                            <DropdownMenuItem icon={<Inbox />} onSelect={() => router.push(`/w/${websiteId}/submissions?formId=${encodeURIComponent(f.id)}`)}>
                              View submissions
                            </DropdownMenuItem>
                          )}
                          {canCreate && (
                            <DropdownMenuItem icon={<Copy />} disabled={duplicate.isPending} onSelect={() => duplicate.mutate(f)}>
                              Duplicate
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setToDelete(f)}>
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <CreateFormDialog open={createOpen} onOpenChange={setCreateOpen} websiteId={websiteId} existingSlugs={(q.data ?? []).map((f) => f.slug)} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        tone="danger"
        title={`Delete “${toDelete?.name ?? ''}”?`}
        description={
          <>
            The form and its workflows are removed and pages embedding it will stop accepting responses.
            {toDelete?.submissionCount ? ` It has ${formatNumber(toDelete.submissionCount)} submissions.` : ''} This can’t be undone.
          </>
        }
        confirmLabel="Delete form"
        onConfirm={async () => {
          if (toDelete) await remove.mutateAsync(toDelete.id);
        }}
      />
    </Page>
  );
}

function CreateFormDialog({ open, onOpenChange, websiteId, existingSlugs }: { open: boolean; onOpenChange: (o: boolean) => void; websiteId: string; existingSlugs: string[] }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<{ name?: string; slug?: string } | null>(null);

  const effectiveSlug = slugTouched ? slug : uniqueSlug(slugify(name), existingSlugs);

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.forms.create(websiteId, {
        name: name.trim(),
        slug: effectiveSlug,
        fields: defaultFields(),
        settings: { ...DEFAULT_SETTINGS, captcha: { ...DEFAULT_SETTINGS.captcha } },
        rules: [],
      }),
    onSuccess: (form) => {
      qc.setQueryData(qk.form(form.id), form);
      void qc.invalidateQueries({ queryKey: qk.forms(websiteId) });
      toast.success('Form created');
      onOpenChange(false);
      reset();
      router.push(`/w/${websiteId}/forms/${form.id}`);
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && (err.isConflict || /slug/i.test(err.message))) setError({ slug: err.isConflict ? 'Another form already uses this slug' : err.message });
      else toast.error(errorMessage(err, 'Could not create the form'));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: { name?: string; slug?: string } = {};
    if (!name.trim()) errs.name = 'Give the form a name';
    if (!effectiveSlug || !/^[a-z0-9-]+$/.test(effectiveSlug)) errs.slug = 'Use lowercase letters, numbers and dashes';
    else if (existingSlugs.includes(effectiveSlug)) errs.slug = 'Another form already uses this slug';
    if (errs.name || errs.slug) return setError(errs);
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent size="sm">
        <form onSubmit={submit} noValidate>
          <DialogHeader title="New form" description="Starts with name, email and message fields. You can change everything in the builder." />
          <DialogBody className="space-y-4">
            <Field label="Name" error={error?.name}>
              <Input
                autoFocus
                placeholder="Contact us"
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error?.name) setError({ ...error, name: undefined });
                }}
              />
            </Field>
            <Field label="Slug" error={error?.slug} help={!error?.slug ? 'Identifies the form in embeds and the API' : undefined}>
              <Input
                className="font-mono text-xs"
                placeholder="contact-us"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                  if (error?.slug) setError({ ...error, slug: undefined });
                }}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" variant="primary" type="submit" loading={create.isPending}>
              Create form
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
