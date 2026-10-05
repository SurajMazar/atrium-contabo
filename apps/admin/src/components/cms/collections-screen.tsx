'use client';

import type { Collection } from '@atrium/sdk';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, ListTree, MoreHorizontal, Plus, Rows3, Search, Settings2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { formatNumber, pluralize } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useWebsite } from '@/lib/website-context';
import { CreateCollectionDialog } from './create-collection-dialog';
import { itemsQueryOptions, useCmsPermissions, useCollections } from './use-cms';

export function CollectionsScreen() {
  const { websiteId } = useWebsite();
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const { canManage } = useCmsPermissions(websiteId);
  const q = useCollections(websiteId);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Collection | null>(null);

  const base = `/w/${websiteId}/cms`;

  const rows = useMemo(() => {
    const f = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((c) => !f || c.name.toLowerCase().includes(f) || c.slug.includes(f));
    return sortRows(list, sort, (r, k) => (k === 'fields' ? r.fields.length : k === 'items' ? (r.itemCount ?? 0) : (r as unknown as Record<string, unknown>)[k]));
  }, [q.data, search, sort]);

  const remove = useMutation({
    mutationFn: (c: Collection) => api.collections.remove(c.id),
    onSuccess: (_, c) => {
      qc.setQueryData<Collection[]>(qk.collections(websiteId), (prev) => prev?.filter((x) => x.id !== c.id));
      qc.removeQueries({ queryKey: qk.collection(c.id) });
      toast.success(`${c.name} deleted`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete collection')),
  });

  const prefetch = (c: Collection) => {
    qc.setQueryData(qk.collection(c.id), (prev: Collection | undefined) => prev ?? c);
    void qc.prefetchInfiniteQuery({ ...itemsQueryOptions(api, c.id, { search: '', status: 'all' }), staleTime: 20_000 });
  };

  const sortable = (key: string, label: string, align?: 'right') => (
    <TH sortable align={align} sorted={sort?.key === key && sort.dir} onSort={() => setSort((s) => nextSort(s, key))}>
      {label}
    </TH>
  );

  return (
    <Page>
      <PageHeader
        title="CMS"
        description="Collections of structured content used across your pages."
        actions={
          canManage && (q.data?.length ?? 0) > 0 ? (
            <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setCreateOpen(true)}>
              New collection
            </Button>
          ) : null
        }
      />

      {(q.data?.length ?? 0) > 3 && (
        <div className="mb-4 flex items-center gap-2">
          <Input size="sm" prefix={<Search />} placeholder="Search collections" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" aria-label="Search collections" />
        </div>
      )}

      {q.isPending ? (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Slug</TH>
                <TH align="right">Items</TH>
                <TH align="right">Fields</TH>
                <TH className="hidden md:table-cell">Route</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="size-7 rounded-md" />
                      <Skeleton className="h-3.5 w-32" />
                    </div>
                  </TD>
                  <TD><Skeleton className="h-3 w-20" /></TD>
                  <TD align="right"><Skeleton className="ml-auto h-3 w-8" /></TD>
                  <TD align="right"><Skeleton className="ml-auto h-3 w-6" /></TD>
                  <TD className="hidden md:table-cell"><Skeleton className="h-3 w-24" /></TD>
                  <TD />
                </tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      ) : q.isError ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<Database />}
            title="No collections yet"
            description="Create a collection to manage structured content like rooms, team members or events."
            action={
              canManage && (
                <Button variant="primary" size="sm" leadingIcon={<Plus />} onClick={() => setCreateOpen(true)}>
                  New collection
                </Button>
              )
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="No collections match" description="Try a different search." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                {sortable('name', 'Name')}
                {sortable('slug', 'Slug')}
                {sortable('items', 'Items', 'right')}
                {sortable('fields', 'Fields', 'right')}
                <TH className="hidden md:table-cell">Route</TH>
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => (
                <TR key={c.id} interactive onClick={() => router.push(`${base}/${c.id}`)} onMouseEnter={() => prefetch(c)}>
                  <TD>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted">
                        <Rows3 className="size-3.5" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0">
                        <Link href={`${base}/${c.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-fg outline-none focus-visible:underline">
                          {c.name}
                        </Link>
                        {c.description && <div className="max-w-[360px] truncate text-xs text-fg-muted">{c.description}</div>}
                      </div>
                    </div>
                  </TD>
                  <TD mono muted>
                    {c.slug}
                  </TD>
                  <TD align="right">{c.itemCount === undefined ? <span className="text-fg-subtle">—</span> : formatNumber(c.itemCount)}</TD>
                  <TD align="right" muted>
                    {c.fields.length}
                  </TD>
                  <TD className="hidden md:table-cell">
                    {c.routePrefix ? <span className="font-mono text-xs text-fg-muted">/{c.routePrefix}/:slug</span> : <Badge tone="outline" size="xs">No detail pages</Badge>}
                  </TD>
                  <TD align="right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton label={`Actions for ${c.name}`} size="xs">
                          <MoreHorizontal />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem icon={<ListTree />} onSelect={() => router.push(`${base}/${c.id}`)}>
                          Open items
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem icon={<Settings2 />} onSelect={() => router.push(`${base}/${c.id}?tab=schema`)}>
                              Edit schema
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setToDelete(c)}>
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} websiteId={websiteId} existing={q.data ?? []} onCreated={(c) => router.push(`${base}/${c.id}?tab=schema`)} />
      <DeleteCollectionDialog collection={toDelete} onOpenChange={(o) => !o && setToDelete(null)} onConfirm={(c) => remove.mutateAsync(c)} />
    </Page>
  );
}

export function DeleteCollectionDialog({ collection, onOpenChange, onConfirm }: { collection: Collection | null; onOpenChange: (o: boolean) => void; onConfirm: (c: Collection) => Promise<unknown> }) {
  const count = collection?.itemCount ?? 0;
  return (
    <ConfirmDialog
      open={!!collection}
      onOpenChange={onOpenChange}
      tone="danger"
      title={`Delete ${collection?.name ?? 'collection'}?`}
      description={
        count > 0
          ? `This permanently deletes the collection and its ${formatNumber(count)} ${pluralize(count, 'item')}. Pages that list this collection will render empty.`
          : 'This permanently deletes the collection. Pages that list this collection will render empty.'
      }
      confirmLabel="Delete collection"
      confirmText={collection?.slug ?? ''}
      onConfirm={() => (collection ? onConfirm(collection) : undefined)}
    />
  );
}
