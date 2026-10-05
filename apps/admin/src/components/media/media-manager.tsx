'use client';

import type { List, Media, MediaFolder } from '@atrium/sdk';
import {
  Badge,
  Button,
  BulkBar,
  Checkbox,
  cn,
  ConfirmDialog,
  CopyField,
  DescriptionList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
  Table,
  TableContainer,
  TagInput,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  toast,
  CopyButton,
} from '@atrium/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ChevronRight, Folder, FolderInput, FolderOpen, FolderPlus, ImageIcon, Inbox, LayoutGrid, List as ListIcon, MoreHorizontal, Pencil, Replace, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@/lib/api';
import { formatBytes, formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useDebounced } from '@/lib/use-debounced';
import { Dropzone, mediaKind, MediaThumb, UploadQueue, useFilePicker } from './media-parts';
import { useMediaUploads } from './use-media-uploads';

type FolderSel = 'all' | 'root' | string;
type TypeFilter = 'all' | 'image' | 'video' | 'document';
const DRAG_TYPE = 'application/x-atrium-media';

export interface MediaManagerProps {
  organizationId: string;
  /** Scope to a website's media (uploads are attached to it). */
  websiteId?: string;
}

/** Full media library: folders, search/filters, grid/list, bulk upload, detail panel. */
export function MediaManager({ organizationId, websiteId }: MediaManagerProps) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canUpload = can('media.upload', websiteId);
  const canDelete = can('media.delete', websiteId);

  const [folder, setFolder] = useState<FolderSel>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [type, setType] = useState<TypeFilter>('all');
  const [tag, setTag] = useState('');
  const debouncedTag = useDebounced(tag, 300);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const query = {
    websiteId,
    folderId: folder === 'all' ? undefined : folder === 'root' ? 'root' : folder,
    search: debounced || undefined,
    type: type === 'all' ? undefined : type,
    tag: debouncedTag.trim() || undefined,
  };
  const listKey = qk.media(organizationId, query);

  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => api.media.list(organizationId, { ...query, cursor: pageParam, limit: 80 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const folders = useQuery({ queryKey: qk.mediaFolders(organizationId, websiteId), queryFn: () => api.media.folders(organizationId, { websiteId }) });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total;
  const active = items.find((m) => m.id === activeId) ?? null;

  useEffect(() => setSelected(new Set()), [folder, debounced, type, debouncedTag]);

  const uploads = useMediaUploads({ organizationId, websiteId, folderId: folder === 'all' || folder === 'root' ? null : folder });
  const picker = useFilePicker(uploads.upload, { multiple: true });

  /** Patch a media item in every cached list page. */
  const patchCache = (id: string, patch: Partial<Media> | null) => {
    qc.setQueriesData<InfiniteData<List<Media>>>({ queryKey: qk.mediaAll(organizationId) }, (d) =>
      d && 'pages' in d
        ? { ...d, pages: d.pages.map((p) => ({ ...p, items: patch === null ? p.items.filter((m) => m.id !== id) : p.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) })) }
        : d,
    );
  };

  const move = useMutation({
    mutationFn: async ({ ids, folderId }: { ids: string[]; folderId: string | null }) => {
      await Promise.all(ids.map((id) => api.media.update(id, { folderId })));
    },
    onMutate: ({ ids, folderId }) => ids.forEach((id) => patchCache(id, { folderId })),
    onSuccess: (_d, v) => {
      toast.success(v.ids.length === 1 ? 'Moved' : `Moved ${v.ids.length} files`);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Move failed'),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.mediaAll(organizationId) }),
  });

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => api.media.remove(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) throw new Error(`${failed} of ${ids.length} files could not be deleted (they may be in use).`);
    },
    onSuccess: (_d, ids) => {
      ids.forEach((id) => patchCache(id, null));
      toast.success(ids.length === 1 ? 'File deleted' : `${ids.length} files deleted`);
      setSelected(new Set());
      if (activeId && ids.includes(activeId)) setActiveId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.mediaAll(organizationId) }),
  });

  const toggleSel = (id: string, on?: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  const onItemDragStart = (e: React.DragEvent, m: Media) => {
    const ids = selected.has(m.id) ? [...selected] : [m.id];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  const folderList = folders.data ?? [];
  const currentFolderName = folder === 'all' ? 'All media' : folder === 'root' ? 'Unfiled' : (folderList.find((f) => f.id === folder)?.name ?? 'Folder');

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <FolderTree
          organizationId={organizationId}
          websiteId={websiteId}
          folders={folderList}
          loading={folders.isPending}
          value={folder}
          onChange={setFolder}
          canEdit={canUpload}
          onDropMedia={(ids, folderId) => move.mutate({ ids, folderId })}
        />
        <Dropzone onFiles={uploads.upload} disabled={!canUpload} className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <PageHeader
              title="Media"
              description={websiteId ? 'Images, videos and documents used on this website.' : 'Shared library for every website in this organization.'}
              actions={
                canUpload && (
                  <>
                    <Button size="sm" variant="primary" leadingIcon={<Upload />} onClick={picker.open}>
                      Upload
                    </Button>
                    {picker.input}
                  </>
                )
              }
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <FolderSelectMobile folders={folderList} value={folder} onChange={setFolder} />
              <Input size="sm" prefix={<Search />} placeholder="Search name or alt text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" aria-label="Search media" />
              <Select
                size="sm"
                className="w-32"
                aria-label="Type"
                value={type}
                onValueChange={(v) => setType(v as TypeFilter)}
                options={[
                  { value: 'all', label: 'All types' },
                  { value: 'image', label: 'Images' },
                  { value: 'video', label: 'Videos' },
                  { value: 'document', label: 'Documents' },
                ]}
              />
              <Input size="sm" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className="w-28" aria-label="Filter by tag" />
              <div className="flex-1" />
              <span className="hidden text-xs tabular-nums text-fg-subtle sm:inline">
                {currentFolderName}
                {typeof total === 'number' ? ` · ${total} files` : ''}
              </span>
              <SegmentedControl
                size="sm"
                aria-label="View"
                value={view}
                onValueChange={setView}
                options={[
                  { value: 'grid', icon: <LayoutGrid />, ariaLabel: 'Grid view' },
                  { value: 'list', icon: <ListIcon />, ariaLabel: 'List view' },
                ]}
              />
            </div>

            <UploadQueue className="mb-4" items={uploads.items} onResolveDuplicate={uploads.resolveDuplicate} onRetry={uploads.retry} onCancel={uploads.cancel} onClear={uploads.clear} />

            {list.isPending ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {Array.from({ length: 18 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-md" />
                ))}
              </div>
            ) : list.isError ? (
              <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-strong">
                <EmptyState
                  icon={<ImageIcon />}
                  title={debounced || debouncedTag || type !== 'all' ? 'No files match these filters' : folder === 'all' ? 'Your media library is empty' : 'This folder is empty'}
                  description={canUpload ? 'Drag files anywhere on this page, or upload from your computer.' : undefined}
                  action={
                    canUpload &&
                    !(debounced || debouncedTag) && (
                      <Button size="sm" variant="primary" leadingIcon={<Upload />} onClick={picker.open}>
                        Upload files
                      </Button>
                    )
                  }
                />
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {items.map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <div
                      key={m.id}
                      draggable={canUpload}
                      onDragStart={(e) => onItemDragStart(e, m)}
                      className={cn('group relative overflow-hidden rounded-md border bg-surface transition-colors', activeId === m.id ? 'border-accent ring-1 ring-accent' : on ? 'border-accent/60' : 'border-border hover:border-border-strong')}
                    >
                      <button type="button" onClick={() => setActiveId(m.id)} className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Open ${m.filename}`}>
                        <div className="aspect-square w-full overflow-hidden">
                          <MediaThumb media={m} />
                        </div>
                        <div className="border-t border-border px-2 py-1.5">
                          <div className="truncate text-xs text-fg">{m.filename}</div>
                          <div className="flex items-center justify-between gap-1 text-2xs text-fg-subtle">
                            <span className="truncate">{m.width && m.height ? `${m.width}×${m.height}` : m.mimeType.split('/')[1]}</span>
                            <span className="shrink-0">{formatBytes(m.size)}</span>
                          </div>
                        </div>
                      </button>
                      <div className={cn('absolute left-1.5 top-1.5 rounded-xs bg-surface/90 p-0.5 transition-opacity', on || selected.size ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
                        <Checkbox aria-label={`Select ${m.filename}`} checked={on} onCheckedChange={(v) => toggleSel(m.id, v === true)} />
                      </div>
                      {!m.alt && mediaKind(m) === 'image' && (
                        <span className="absolute right-1.5 top-1.5">
                          <Badge tone="warning" size="xs" title="Missing alt text">
                            No alt
                          </Badge>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH className="w-8" />
                      <TH>Name</TH>
                      <TH className="hidden md:table-cell">Type</TH>
                      <TH className="hidden md:table-cell">Dimensions</TH>
                      <TH align="right">Size</TH>
                      <TH className="hidden lg:table-cell">Alt text</TH>
                      <TH align="right">Added</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {items.map((m) => (
                      <TR key={m.id} interactive selected={activeId === m.id} onClick={() => setActiveId(m.id)} draggable={canUpload} onDragStart={(e) => onItemDragStart(e, m)}>
                        <TD onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Select ${m.filename}`} checked={selected.has(m.id)} onCheckedChange={(v) => toggleSel(m.id, v === true)} />
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <div className="size-8 shrink-0 overflow-hidden rounded-sm border border-border">
                              <MediaThumb media={m} />
                            </div>
                            <span className="truncate font-medium">{m.filename}</span>
                          </div>
                        </TD>
                        <TD muted className="hidden md:table-cell">
                          {m.mimeType}
                        </TD>
                        <TD muted className="hidden tabular-nums md:table-cell">
                          {m.width && m.height ? `${m.width}×${m.height}` : '—'}
                        </TD>
                        <TD align="right" muted>
                          {formatBytes(m.size)}
                        </TD>
                        <TD muted className="hidden max-w-[220px] truncate lg:table-cell">
                          {m.alt || <span className="text-warning">Missing</span>}
                        </TD>
                        <TD align="right" muted title={formatDateTime(m.createdAt)}>
                          {timeAgo(m.createdAt)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}

            {list.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button size="sm" variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                  Load more
                </Button>
              </div>
            )}
          </div>

          <div className="pointer-events-none sticky bottom-4 flex justify-center px-4">
            <BulkBar className="pointer-events-auto" count={selected.size} onClear={() => setSelected(new Set())}>
              {canUpload && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" leadingIcon={<FolderInput />}>
                      Move to
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem icon={<Inbox />} onSelect={() => move.mutate({ ids: [...selected], folderId: null })}>
                      Unfiled
                    </DropdownMenuItem>
                    {folderList.length > 0 && <DropdownMenuSeparator />}
                    {folderList.map((f) => (
                      <DropdownMenuItem key={f.id} icon={<Folder />} onSelect={() => move.mutate({ ids: [...selected], folderId: f.id })}>
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button size="xs" variant="ghost" onClick={() => setSelected(new Set(items.map((m) => m.id)))}>
                Select all loaded
              </Button>
              {canDelete && (
                <Button size="xs" variant="danger-ghost" leadingIcon={<Trash2 />} onClick={() => setConfirmBulkDelete(true)}>
                  Delete
                </Button>
              )}
            </BulkBar>
          </div>
        </Dropzone>
      </div>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        {active && (
          <MediaDetail
            key={active.id}
            media={active}
            folders={folderList}
            canEdit={canUpload}
            canDelete={canDelete}
            onPatched={(m) => patchCache(m.id, m)}
            onDeleted={(id) => {
              patchCache(id, null);
              setActiveId(null);
            }}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        tone="danger"
        title={`Delete ${selected.size} ${selected.size === 1 ? 'file' : 'files'}?`}
        description="Files used on published pages keep working until the next publish, then show as broken images. This can’t be undone."
        confirmLabel="Delete"
        onConfirm={() => removeMany.mutateAsync([...selected])}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Folders */

function buildTree(folders: MediaFolder[]) {
  const children = new Map<string | null, MediaFolder[]>();
  for (const f of folders) {
    const k = f.parentId ?? null;
    children.set(k, [...(children.get(k) ?? []), f]);
  }
  for (const v of children.values()) v.sort((a, b) => a.name.localeCompare(b.name));
  return children;
}

function FolderTree({
  organizationId,
  websiteId,
  folders,
  loading,
  value,
  onChange,
  canEdit,
  onDropMedia,
}: {
  organizationId: string;
  websiteId?: string;
  folders: MediaFolder[];
  loading: boolean;
  value: FolderSel;
  onChange: (v: FolderSel) => void;
  canEdit: boolean;
  onDropMedia: (ids: string[], folderId: string | null) => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaFolder | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const key = qk.mediaFolders(organizationId, websiteId);

  const create = useMutation({
    mutationFn: (v: { name: string; parentId: string | null }) => api.media.createFolder(organizationId, { name: v.name, parentId: v.parentId ?? undefined, websiteId }),
    onSuccess: (f) => {
      qc.setQueryData<MediaFolder[]>(key, (d) => [...(d ?? []), f]);
      if (f.parentId) setExpanded((s) => new Set(s).add(f.parentId!));
      onChange(f.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create folder'),
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => api.media.updateFolder(v.id, { name: v.name }),
    onMutate: (v) => qc.setQueryData<MediaFolder[]>(key, (d) => d?.map((f) => (f.id === v.id ? { ...f, name: v.name } : f))),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Rename failed');
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.media.removeFolder(id),
    onSuccess: (_d, id) => {
      qc.setQueryData<MediaFolder[]>(key, (d) => d?.filter((f) => f.id !== id));
      if (value === id) onChange('all');
      void qc.invalidateQueries({ queryKey: qk.mediaAll(organizationId) });
      toast.success('Folder deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  });

  const dropProps = (folderId: string | null, keyId: string) =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(keyId);
          },
          onDragLeave: () => setDropTarget((t) => (t === keyId ? null : t)),
          onDrop: (e: React.DragEvent) => {
            const raw = e.dataTransfer.getData(DRAG_TYPE);
            setDropTarget(null);
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            try {
              onDropMedia(JSON.parse(raw) as string[], folderId);
            } catch {
              /* ignore */
            }
          },
        }
      : {};

  const row = (f: MediaFolder, depth: number): React.ReactNode => {
    const kids = tree.get(f.id) ?? [];
    const open = expanded.has(f.id);
    const isActive = value === f.id;
    return (
      <li key={f.id}>
        {renaming === f.id ? (
          <InlineName
            initial={f.name}
            depth={depth}
            onSubmit={(name) => {
              setRenaming(null);
              if (name && name !== f.name) rename.mutate({ id: f.id, name });
            }}
          />
        ) : (
          <div
            {...dropProps(f.id, f.id)}
            className={cn('group flex h-7 items-center rounded-md pr-1 text-sm', isActive ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg', dropTarget === f.id && 'bg-accent-soft ring-1 ring-accent')}
            style={{ paddingLeft: 4 + depth * 12 }}
          >
            <button
              type="button"
              aria-label={open ? 'Collapse' : 'Expand'}
              onClick={() => setExpanded((s) => {
                const n = new Set(s);
                if (n.has(f.id)) n.delete(f.id);
                else n.add(f.id);
                return n;
              })}
              className={cn('flex size-5 shrink-0 items-center justify-center rounded-xs text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring', !kids.length && 'invisible')}
            >
              <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={() => onChange(f.id)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {isActive ? <FolderOpen className="size-4 shrink-0" strokeWidth={1.5} /> : <Folder className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.5} />}
              <span className="truncate">{f.name}</span>
            </button>
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label={`${f.name} options`} size="xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem icon={<FolderPlus />} onSelect={() => { setExpanded((s) => new Set(s).add(f.id)); setCreatingIn(f.id); }}>
                    New subfolder
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={<Pencil />} onSelect={() => setRenaming(f.id)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(f)}>
                    Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        {(open || creatingIn === f.id) && (
          <ul>
            {kids.map((k) => row(k, depth + 1))}
            {creatingIn === f.id && (
              <li>
                <InlineName
                  depth={depth + 1}
                  onSubmit={(name) => {
                    setCreatingIn(undefined);
                    if (name) create.mutate({ name, parentId: f.id });
                  }}
                />
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const fixed = (id: 'all' | 'root', label: string, Icon: typeof Folder) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      {...(id === 'root' ? dropProps(null, 'root') : {})}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        value === id ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg',
        dropTarget === 'root' && id === 'root' && 'bg-accent-soft ring-1 ring-accent',
      )}
    >
      <Icon className="size-4 text-fg-subtle" strokeWidth={1.5} />
      {label}
    </button>
  );

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface-2/40 md:flex">
      <div className="flex h-10 items-center justify-between px-3 pt-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Folders</span>
        {canEdit && (
          <IconButton label="New folder" size="xs" onClick={() => setCreatingIn(null)}>
            <FolderPlus />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="space-y-px">
          {fixed('all', 'All media', ImageIcon)}
          {fixed('root', 'Unfiled', Inbox)}
        </div>
        <div className="my-2 h-px bg-border" />
        {loading ? (
          <div className="space-y-2 px-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <ul className="space-y-px">
            {(tree.get(null) ?? []).map((f) => row(f, 0))}
            {creatingIn === null && (
              <li>
                <InlineName
                  depth={0}
                  onSubmit={(name) => {
                    setCreatingIn(undefined);
                    if (name) create.mutate({ name, parentId: null });
                  }}
                />
              </li>
            )}
          </ul>
        )}
        {!loading && folders.length === 0 && creatingIn === undefined && <p className="px-2 py-1 text-xs text-fg-subtle">No folders yet. Drag files onto a folder to move them.</p>}
      </div>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        title={`Delete “${deleting?.name}”?`}
        description="Files inside are kept and moved to Unfiled. Subfolders are deleted."
        confirmLabel="Delete folder"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </aside>
  );
}

function InlineName({ initial = '', depth, onSubmit }: { initial?: string; depth: number; onSubmit: (name: string) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div style={{ paddingLeft: 4 + depth * 12 + 20 }} className="py-0.5 pr-1">
      <input
        ref={ref}
        value={v}
        aria-label="Folder name"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSubmit(v.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(v.trim());
          if (e.key === 'Escape') onSubmit('');
        }}
        placeholder="Folder name"
        className="h-6 w-full rounded-sm border border-accent bg-surface px-1.5 text-sm outline-none ring-2 ring-ring"
      />
    </div>
  );
}

function FolderSelectMobile({ folders, value, onChange }: { folders: MediaFolder[]; value: FolderSel; onChange: (v: FolderSel) => void }) {
  return (
    <div className="md:hidden">
      <Select size="sm" className="w-36" aria-label="Folder" value={value} onValueChange={onChange} options={[{ value: 'all', label: 'All media' }, { value: 'root', label: 'Unfiled' }, ...folders.map((f) => ({ value: f.id, label: f.name }))]} />
    </div>
  );
}

/* ----------------------------------------------------------------- Detail */

function MediaDetail({
  media,
  folders,
  canEdit,
  canDelete,
  onPatched,
  onDeleted,
}: {
  media: Media;
  folders: MediaFolder[];
  canEdit: boolean;
  canDelete: boolean;
  onPatched: (m: Media) => void;
  onDeleted: (id: string) => void;
}) {
  const api = useApi();
  const [form, setForm] = useState({ filename: media.filename, alt: media.alt ?? '', title: media.title ?? '', caption: media.caption ?? '', tags: media.tags ?? [], folderId: media.folderId ?? 'root' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);
  const dirty =
    form.filename !== media.filename ||
    form.alt !== (media.alt ?? '') ||
    form.title !== (media.title ?? '') ||
    form.caption !== (media.caption ?? '') ||
    form.folderId !== (media.folderId ?? 'root') ||
    JSON.stringify(form.tags) !== JSON.stringify(media.tags ?? []);
  const kind = mediaKind(media);

  const save = useMutation({
    mutationFn: () =>
      api.media.update(media.id, {
        filename: form.filename.trim() || media.filename,
        alt: form.alt.trim() || null,
        title: form.title.trim() || null,
        caption: form.caption.trim() || null,
        tags: form.tags,
        folderId: form.folderId === 'root' ? null : form.folderId,
      }),
    onSuccess: (m) => {
      onPatched(m);
      toast.success('Saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  });
  const replace = useMutation({
    mutationFn: (file: File) => api.media.replace(media.id, file),
    onSuccess: (m) => {
      onPatched(m);
      toast.success('File replaced. Every page using it now shows the new version.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Replace failed'),
  });
  const del = useMutation({
    mutationFn: () => api.media.remove(media.id),
    onSuccess: () => {
      onDeleted(media.id);
      toast.success('File deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  });

  return (
    <SheetContent
      size="md"
      title={media.filename}
      description={`${media.mimeType} · ${formatBytes(media.size)}`}
      bodyClassName="p-0"
      footer={
        canEdit && (
          <>
            {canDelete && (
              <Button size="sm" variant="danger-ghost" leadingIcon={<Trash2 />} className="mr-auto" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              Save changes
            </Button>
          </>
        )
      }
    >
      <div className="border-b border-border bg-surface-2">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden">
          {kind === 'video' ? <video src={media.url} controls className="max-h-full max-w-full" /> : <MediaThumb media={media} fit="contain" />}
        </div>
      </div>
      <div className="space-y-5 p-4">
        <CopyField value={media.url} label="File URL" />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save.mutate();
          }}
        >
          {kind === 'image' && (
            <Field label="Alt text" help="Describe the image for screen readers and search engines." error={!form.alt.trim() ? undefined : undefined}>
              <Textarea rows={2} value={form.alt} disabled={!canEdit} onChange={(e) => setForm({ ...form, alt: e.target.value })} placeholder="Sunset over the lake from the terrace" />
            </Field>
          )}
          <Field label="File name">
            <Input value={form.filename} disabled={!canEdit} onChange={(e) => setForm({ ...form, filename: e.target.value })} />
          </Field>
          <Field label="Title" optional>
            <Input value={form.title} disabled={!canEdit} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Caption" optional>
            <Textarea rows={2} value={form.caption} disabled={!canEdit} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
          </Field>
          <Field label="Tags">
            <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} disabled={!canEdit} transform={(t) => t.trim().toLowerCase()} />
          </Field>
          <Field label="Folder">
            <Select value={form.folderId} disabled={!canEdit} onValueChange={(v) => setForm({ ...form, folderId: v })} options={[{ value: 'root', label: 'Unfiled' }, ...folders.map((f) => ({ value: f.id, label: f.name }))]} />
          </Field>
          <button type="submit" hidden />
        </form>

        <DescriptionList
          items={[
            { label: 'Dimensions', value: media.width && media.height ? `${media.width} × ${media.height}px` : '—' },
            { label: 'Size', value: formatBytes(media.size) },
            { label: 'Type', value: <span className="font-mono text-xs">{media.mimeType}</span> },
            { label: 'Added', value: formatDateTime(media.createdAt) },
          ]}
        />

        {media.variants?.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Responsive variants</div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {[...media.variants].sort((a, b) => a.width - b.width).map((v) => (
                <li key={v.url} className="flex h-8 items-center gap-2 px-2.5 text-xs">
                  <span className="w-14 tabular-nums text-fg">{v.width}w</span>
                  <Badge size="xs">{v.format}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-subtle">{v.url.split('/').pop()}</span>
                  <CopyButton value={v.url} label="Copy variant URL" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {canEdit && (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm text-fg">Replace file</div>
              <div className="text-xs text-fg-muted">Keeps the same URL and every reference to it.</div>
            </div>
            <Button size="xs" leadingIcon={<Replace />} loading={replace.isPending} onClick={() => replaceRef.current?.click()}>
              Replace
            </Button>
            <input
              ref={replaceRef}
              type="file"
              hidden
              accept={kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : undefined}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) replace.mutate(f);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="Delete this file?"
        description="Pages that use it will show a broken image after the next publish. This can’t be undone."
        confirmLabel="Delete"
        onConfirm={() => del.mutateAsync()}
      />
    </SheetContent>
  );
}
