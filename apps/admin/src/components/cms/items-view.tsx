'use client';

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Collection, CollectionItemDto, List } from '@atrium/sdk';
import {
  Badge,
  BulkBar,
  Button,
  cn,
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
  RowCheckbox,
  Select,
  SelectAllCheckbox,
  Skeleton,
  Spinner,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  toast,
  Tooltip,
} from '@atrium/ui';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { Archive, Copy, Eye, EyeOff, FileText, Layers, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, formatNumber, pluralize, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';
import { useWebsite } from '@/lib/website-context';
import { CELL_TYPES } from './field-types';
import { ItemCell } from './item-cell';
import { ItemEditorSheet } from './item-editor-sheet';
import { announcements, DragHandle, restrictToVerticalAxis, Sortable, useSortSensors } from './sortable';
import { setUrlParam } from './url-state';
import { itemsQueryOptions } from './use-cms';
import { asStatus, itemTitle, readMediaRef, STATUS_META, type ItemStatus } from './values';

type ItemsData = InfiniteData<List<CollectionItemDto>, string | undefined>;
type StatusFilter = 'all' | ItemStatus;

function isInfinite(d: unknown): d is ItemsData {
  return !!d && typeof d === 'object' && Array.isArray((d as ItemsData).pages);
}
function isList(d: unknown): d is List<CollectionItemDto> {
  return !!d && typeof d === 'object' && Array.isArray((d as List<CollectionItemDto>).items);
}

/** Apply a transform to every cached item list for a collection (infinite pages and plain lists). */
function patchCachedItems(qc: ReturnType<typeof useQueryClient>, cid: string, fn: (items: CollectionItemDto[]) => CollectionItemDto[]) {
  qc.setQueriesData({ queryKey: qk.collectionItemsAll(cid) }, (d: unknown) => {
    if (isInfinite(d)) return { ...d, pages: d.pages.map((p) => ({ ...p, items: fn(p.items) })) };
    if (isList(d)) return { ...d, items: fn(d.items) };
    return d;
  });
}

export function ItemsView({
  websiteId,
  collection,
  collections,
  canEdit,
  canManage,
  singular,
  initialItemId,
  onOpenSchema,
}: {
  websiteId: string;
  collection: Collection;
  collections: Collection[];
  canEdit: boolean;
  canManage: boolean;
  singular: string;
  initialItemId?: string;
  onOpenSchema: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { organizationId } = useWebsite();
  const sensors = useSortSensors();
  const cid = collection.id;
  const fields = collection.fields;

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ open: boolean; item: CollectionItemDto | null; session: number }>({ open: false, item: null, session: 0 });
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [toDelete, setToDelete] = useState<CollectionItemDto | null>(null);

  const filters = { search: debounced, status };
  const options = itemsQueryOptions(api, cid, filters);
  const q = useInfiniteQuery({ ...options, placeholderData: (prev) => prev });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total ?? collection.itemCount;
  const filtered = !!debounced || status !== 'all';
  const canReorder = canEdit && !filtered;

  // Columns: title (+ optional thumbnail) and up to three compact fields.
  const titleField = fields.find((f) => f.key === collection.titleField);
  const thumbField = fields.find((f) => f.type === 'image' && f.key !== collection.titleField);
  const extra = fields.filter((f) => f.key !== collection.titleField && f !== thumbField && CELL_TYPES.includes(f.type) && f.type !== 'image').slice(0, 3);

  // Drop selections that are no longer visible.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // Deep link: ?item=<id> or ?item=new
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialItemId) return;
    if (initialItemId === 'new') {
      deepLinked.current = true;
      if (canEdit) setEditor((e) => ({ open: true, item: null, session: e.session + 1 }));
      return;
    }
    if (!q.data) return;
    deepLinked.current = true;
    const found = items.find((i) => i.id === initialItemId);
    if (found) {
      setEditor((e) => ({ open: true, item: found, session: e.session + 1 }));
      return;
    }
    // Not in the loaded page: fetch the single item.
    qc.fetchQuery({ queryKey: ['collection-item', initialItemId], queryFn: () => api.collections.getItem(initialItemId), staleTime: 15_000 }).then(
      (item) => setEditor((e) => ({ open: true, item, session: e.session + 1 })),
      () => {
        setUrlParam('item', null);
        toast.error('That item could not be found');
      },
    );
  }, [initialItemId, q.data, items, canEdit, qc, api]);

  const openEditor = (item: CollectionItemDto | null) => {
    setEditor((e) => ({ open: true, item, session: e.session + 1 }));
    setUrlParam('item', item ? item.id : 'new');
  };
  const closeEditor = () => {
    setEditor((e) => ({ ...e, open: false }));
    setUrlParam('item', null);
  };

  const refreshCounts = () => {
    void qc.invalidateQueries({ queryKey: qk.collection(cid), exact: true });
    void qc.invalidateQueries({ queryKey: qk.collections(websiteId) });
  };

  /* -------------------------------------------------------------- mutations */

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.collections.reorder(cid, ids),
    onMutate: async (ids) => {
      const key: QueryKey = options.queryKey;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ItemsData>(key);
      if (prev) {
        const byId = new Map(prev.pages.flatMap((p) => p.items).map((i) => [i.id, i]));
        const ordered = ids.map((id) => byId.get(id)!).filter(Boolean);
        let offset = 0;
        const pages = prev.pages.map((p) => {
          const slice = ordered.slice(offset, offset + p.items.length).map((it, i) => ({ ...it, position: offset + i }));
          offset += p.items.length;
          return { ...p, items: slice };
        });
        qc.setQueryData<ItemsData>(key, { ...prev, pages });
      }
      return { prev, key };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(errorMessage(err, 'Could not reorder items'));
    },
    onSettled: () => {
      // Other filtered views now have a stale order.
      void qc.invalidateQueries({ queryKey: qk.collectionItemsAll(cid), predicate: (query) => query.queryKey[3] !== undefined && JSON.stringify(query.queryKey) !== JSON.stringify(options.queryKey) });
    },
  });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    reorder.mutate(next);
  };

  const setItemStatus = useMutation({
    mutationFn: async ({ ids, status: s }: { ids: string[]; status: ItemStatus }) => {
      const results = await Promise.allSettled(ids.map((id) => api.collections.updateItem(id, { status: s })));
      return { results, status: s };
    },
    onMutate: ({ ids, status: s }) => {
      const set = new Set(ids);
      patchCachedItems(qc, cid, (list) => list.map((i) => (set.has(i.id) ? { ...i, status: s } : i)));
    },
    onSuccess: ({ results, status: s }) => {
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      const verb = s === 'published' ? 'published' : s === 'draft' ? 'unpublished' : 'archived';
      if (ok) toast.success(results.length === 1 ? `Item ${verb}` : `${formatNumber(ok)} ${pluralize(ok, 'item')} ${verb}`);
      if (failed) toast.error(`${formatNumber(failed)} ${pluralize(failed, 'item')} could not be updated`);
      setSelected(new Set());
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.collectionItemsAll(cid) }),
  });

  const removeItems = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.collections.removeItem(id)));
      return { ids, results };
    },
    onSuccess: ({ ids, results }) => {
      const removed = new Set(ids.filter((_, i) => results[i]?.status === 'fulfilled'));
      patchCachedItems(qc, cid, (list) => list.filter((i) => !removed.has(i.id)));
      qc.setQueriesData({ queryKey: qk.collectionItemsAll(cid) }, (d: unknown) => (isInfinite(d) && d.pages[0] && typeof d.pages[0].total === 'number' ? { ...d, pages: d.pages.map((p, i) => (i === 0 ? { ...p, total: Math.max(0, (p.total ?? 0) - removed.size) } : p)) } : d));
      const failed = ids.length - removed.size;
      if (removed.size) toast.success(removed.size === 1 ? 'Item deleted' : `${formatNumber(removed.size)} items deleted`);
      if (failed) toast.error(`${formatNumber(failed)} ${pluralize(failed, 'item')} could not be deleted`);
      setSelected(new Set());
      refreshCounts();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete')),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.collectionItemsAll(cid) }),
  });

  const duplicate = useMutation({
    mutationFn: (item: CollectionItemDto) => api.collections.createItem(cid, { data: item.data, status: 'draft' }),
    onSuccess: (created) => {
      toast.success('Duplicated as draft', { action: { label: 'Open', onClick: () => openEditor(created) } });
      void qc.invalidateQueries({ queryKey: qk.collectionItemsAll(cid) });
      refreshCounts();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not duplicate item')),
  });

  const onSaved = (saved: CollectionItemDto, created: boolean) => {
    qc.setQueryData(['collection-item', saved.id], saved);
    if (created) {
      void qc.invalidateQueries({ queryKey: qk.collectionItemsAll(cid) });
      refreshCounts();
      setEditor((e) => ({ ...e, item: saved }));
      setUrlParam('item', saved.id);
    } else {
      setEditor((e) => (e.item?.id === saved.id ? { ...e, item: saved } : e));
      patchCachedItems(qc, cid, (list) => list.map((i) => (i.id === saved.id ? saved : i)));
      if (status !== 'all' && asStatus(saved.status) !== status) void qc.invalidateQueries({ queryKey: options.queryKey });
    }
  };

  /* ------------------------------------------------------------------ view */

  const selectedIds = [...selected];
  const allSelected = items.length > 0 && selected.size === items.length;
  const newLabel = `New ${singular.toLowerCase()}`;

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong">
        <EmptyState
          icon={<Layers />}
          title="Add fields before creating items"
          description="Define what each item contains, like a name, photo and price."
          action={
            canManage && (
              <Button size="sm" variant="primary" onClick={onOpenSchema}>
                Edit schema
              </Button>
            )
          }
        />
      </div>
    );
  }

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        size="sm"
        prefix={q.isFetching && debounced && !q.isFetchingNextPage ? <Spinner className="size-3.5" /> : <Search />}
        suffix={
          search ? (
            <IconButton label="Clear search" size="xs" onClick={() => setSearch('')}>
              <X />
            </IconButton>
          ) : undefined
        }
        placeholder={`Search ${collection.name.toLowerCase()}`}
        aria-label="Search items"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-64"
      />
      <Select
        size="sm"
        aria-label="Filter by status"
        value={status}
        onValueChange={(v) => setStatus(v as StatusFilter)}
        className="w-36"
        options={[
          { value: 'all', label: 'All statuses' },
          { value: 'published', label: 'Published' },
          { value: 'draft', label: 'Draft' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {filtered && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSearch('');
            setStatus('all');
          }}
        >
          Clear filters
        </Button>
      )}
      <div className="flex-1" />
      {total !== undefined && (
        <span className="text-xs tabular-nums text-fg-muted">
          {formatNumber(total)} {pluralize(total, 'item')}
        </span>
      )}
      {canEdit && (
        <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => openEditor(null)}>
          {newLabel}
        </Button>
      )}
    </div>
  );

  const header = (
    <THead>
      <tr>
        {canEdit && (
          <TH className="w-8 px-1">
            <span className="sr-only">Reorder</span>
          </TH>
        )}
        {canEdit && (
          <TH className="w-8 pl-1 pr-0">
            <SelectAllCheckbox total={items.length} selected={selected.size} onChange={(all) => setSelected(all ? new Set(items.map((i) => i.id)) : new Set())} />
          </TH>
        )}
        <TH>{titleField?.label ?? 'Title'}</TH>
        {extra.map((f, i) => (
          <TH key={f.key} align={f.type === 'number' ? 'right' : 'left'} className={cn(i === 0 ? 'hidden md:table-cell' : 'hidden lg:table-cell')}>
            {f.label}
          </TH>
        ))}
        <TH>Status</TH>
        <TH align="right" className="hidden sm:table-cell">
          Updated
        </TH>
        <TH className="w-10">
          <span className="sr-only">Actions</span>
        </TH>
      </tr>
    </THead>
  );

  let body: ReactNode;
  if (q.isPending) {
    body = (
      <TableContainer>
        <Table>
          {header}
          <TBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {canEdit && <TD className="px-1" />}
                {canEdit && (
                  <TD className="pl-1 pr-0">
                    <Skeleton className="size-4" />
                  </TD>
                )}
                <TD>
                  <div className="flex items-center gap-2.5">
                    {thumbField && <Skeleton className="size-7 rounded-sm" />}
                    <Skeleton className="h-3.5 w-40" />
                  </div>
                </TD>
                {extra.map((f, j) => (
                  <TD key={f.key} className={cn(j === 0 ? 'hidden md:table-cell' : 'hidden lg:table-cell')}>
                    <Skeleton className="h-3 w-20" />
                  </TD>
                ))}
                <TD>
                  <Skeleton className="h-5 w-16" />
                </TD>
                <TD align="right" className="hidden sm:table-cell">
                  <Skeleton className="ml-auto h-3 w-12" />
                </TD>
                <TD />
              </tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
    );
  } else if (q.isError) {
    body = <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />;
  } else if (items.length === 0 && !filtered) {
    body = (
      <div className="rounded-lg border border-dashed border-border-strong">
        <EmptyState
          icon={<FileText />}
          title={`No ${collection.name.toLowerCase()} yet`}
          description={`Add your first ${singular.toLowerCase()} to start filling this collection.`}
          action={
            canEdit && (
              <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => openEditor(null)}>
                {newLabel}
              </Button>
            )
          }
        />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState
          compact
          title="No items match"
          description="Try a different search or status."
          action={
            <Button
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      </div>
    );
  } else {
    body = (
      <>
        <TableContainer className={cn(q.isPlaceholderData && 'opacity-70 transition-opacity')}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd} accessibility={{ announcements: announcements((id) => { const it = items.find((i) => i.id === id); return it ? itemTitle(it, fields, collection.titleField) : 'item'; }) }}>
            <Table>
              {header}
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <TBody>
                  {items.map((item) => {
                    const s = asStatus(item.status);
                    const title = itemTitle(item, fields, collection.titleField);
                    const thumb = thumbField ? readMediaRef(item.data[thumbField.key]) : null;
                    const isSel = selected.has(item.id);
                    return (
                      <Sortable key={item.id} id={item.id} disabled={!canReorder}>
                        {({ setNodeRef, style, handleProps, isDragging }) => (
                          <tr
                            ref={setNodeRef}
                            style={style}
                            data-selected={isSel || undefined}
                            onClick={() => openEditor(item)}
                            className={cn(
                              'group/row cursor-pointer transition-colors hover:bg-surface-2/60',
                              isSel && 'bg-accent-soft/50 hover:bg-accent-soft/70',
                              isDragging && 'bg-surface shadow-popover',
                              editor.open && editor.item?.id === item.id && 'bg-surface-2/60',
                            )}
                          >
                            {canEdit && (
                              <TD className="w-8 px-1" onClick={(e) => e.stopPropagation()}>
                                <Tooltip content={canReorder ? undefined : 'Clear search and filters to reorder'}>
                                  <span className="inline-flex">
                                    <DragHandle {...(canReorder ? handleProps : {})} disabled={!canReorder} label={`Reorder ${title}`} />
                                  </span>
                                </Tooltip>
                              </TD>
                            )}
                            {canEdit && (
                              <TD className="w-8 pl-1 pr-0">
                                <RowCheckbox
                                  label={`Select ${title}`}
                                  checked={isSel}
                                  onChange={(v) =>
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      if (v) next.add(item.id);
                                      else next.delete(item.id);
                                      return next;
                                    })
                                  }
                                />
                              </TD>
                            )}
                            <TD className="max-w-0 min-w-[200px]">
                              <div className="flex min-w-0 items-center gap-2.5">
                                {thumbField &&
                                  (thumb ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumb.src} alt="" loading="lazy" className="size-7 shrink-0 rounded-sm border border-border object-cover" />
                                  ) : (
                                    <span className="size-7 shrink-0 rounded-sm border border-dashed border-border bg-surface-2" />
                                  ))}
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditor(item);
                                    }}
                                    className="block max-w-full truncate text-left font-medium text-fg outline-none focus-visible:underline"
                                  >
                                    {title}
                                  </button>
                                  <div className="truncate font-mono text-2xs text-fg-subtle">{item.slug}</div>
                                </div>
                              </div>
                            </TD>
                            {extra.map((f, i) => (
                              <TD key={f.key} align={f.type === 'number' ? 'right' : 'left'} muted className={cn(i === 0 ? 'hidden md:table-cell' : 'hidden lg:table-cell')}>
                                <ItemCell field={f} value={item.data[f.key]} />
                              </TD>
                            ))}
                            <TD>
                              <Badge tone={STATUS_META[s].tone} dot>
                                {STATUS_META[s].label}
                              </Badge>
                            </TD>
                            <TD align="right" muted className="hidden whitespace-nowrap sm:table-cell">
                              <span title={formatDateTime(item.updatedAt)}>{timeAgo(item.updatedAt)}</span>
                            </TD>
                            <TD align="right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton label={`Actions for ${title}`} size="xs">
                                    <MoreHorizontal />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem icon={<Pencil />} onSelect={() => openEditor(item)}>
                                    {canEdit ? 'Edit' : 'View'}
                                  </DropdownMenuItem>
                                  {canEdit && (
                                    <>
                                      {s === 'published' ? (
                                        <DropdownMenuItem icon={<EyeOff />} onSelect={() => setItemStatus.mutate({ ids: [item.id], status: 'draft' })}>
                                          Unpublish
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem icon={<Eye />} onSelect={() => setItemStatus.mutate({ ids: [item.id], status: 'published' })}>
                                          Publish
                                        </DropdownMenuItem>
                                      )}
                                      {s !== 'archived' && (
                                        <DropdownMenuItem icon={<Archive />} onSelect={() => setItemStatus.mutate({ ids: [item.id], status: 'archived' })}>
                                          Archive
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem icon={<Copy />} onSelect={() => duplicate.mutate(item)}>
                                        Duplicate
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setToDelete(item)}>
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TD>
                          </tr>
                        )}
                      </Sortable>
                    );
                  })}
                </TBody>
              </SortableContext>
            </Table>
          </DndContext>
          <span className="sr-only" aria-live="polite">
            {q.isFetching && !q.isPending ? 'Loading items' : ''}
          </span>
        </TableContainer>
        {(q.hasNextPage || items.length > 0) && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-muted">
            <span className="tabular-nums">
              Showing {formatNumber(items.length)}
              {total !== undefined ? ` of ${formatNumber(total)}` : ''}
            </span>
            {q.hasNextPage && (
              <Button size="sm" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Load more
              </Button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      {toolbar}
      {body}

      {canEdit && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())} className="pointer-events-auto">
            <Button size="xs" variant="ghost" leadingIcon={<Eye />} loading={setItemStatus.isPending && setItemStatus.variables?.status === 'published'} onClick={() => setItemStatus.mutate({ ids: selectedIds, status: 'published' })}>
              Publish
            </Button>
            <Button size="xs" variant="ghost" leadingIcon={<EyeOff />} loading={setItemStatus.isPending && setItemStatus.variables?.status === 'draft'} onClick={() => setItemStatus.mutate({ ids: selectedIds, status: 'draft' })}>
              Unpublish
            </Button>
            <Button size="xs" variant="ghost" leadingIcon={<Archive />} loading={setItemStatus.isPending && setItemStatus.variables?.status === 'archived'} onClick={() => setItemStatus.mutate({ ids: selectedIds, status: 'archived' })}>
              Archive
            </Button>
            <Button size="xs" variant="danger-ghost" leadingIcon={<Trash2 />} onClick={() => setConfirmBulkDelete(true)}>
              Delete
            </Button>
            {allSelected && q.hasNextPage && <span className="pl-1 text-2xs text-fg-subtle">Only loaded items are selected</span>}
          </BulkBar>
        </div>
      )}

      <ItemEditorSheet
        open={editor.open}
        sessionKey={editor.session}
        item={editor.item}
        collection={collection}
        collections={collections}
        websiteId={websiteId}
        organizationId={organizationId}
        singular={singular}
        canEdit={canEdit}
        canManage={canManage}
        onClose={closeEditor}
        onSaved={onSaved}
        onDelete={async (item) => {
          await removeItems.mutateAsync([item.id]);
          closeEditor();
        }}
        onOpenSchema={() => {
          closeEditor();
          onOpenSchema();
        }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        tone="danger"
        title={`Delete ${formatNumber(selected.size)} ${pluralize(selected.size, 'item')}?`}
        description="This permanently deletes the selected items. References to them from other collections will be empty."
        confirmLabel="Delete items"
        onConfirm={() => removeItems.mutateAsync(selectedIds)}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        tone="danger"
        title={`Delete “${toDelete ? itemTitle(toDelete, fields, collection.titleField) : ''}”?`}
        description="This permanently deletes the item. References to it from other collections will be empty."
        confirmLabel="Delete item"
        onConfirm={() => (toDelete ? removeItems.mutateAsync([toDelete.id]) : undefined)}
      />
    </div>
  );
}
