'use client';

import type { Media } from '@atrium/sdk';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
} from '@atrium/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Check, ImageIcon, Search, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';
import { Dropzone, MediaThumb, UploadQueue, useFilePicker } from './media-parts';
import { acceptFor, useMediaUploads } from './use-media-uploads';

export interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  websiteId?: string;
  kind?: 'image' | 'video' | 'any';
  multiple?: boolean;
  /** Called with the chosen media when the user confirms. The dialog closes afterwards. */
  onSelect: (media: Media[]) => void;
  title?: string;
  confirmLabel?: string;
}

type TypeFilter = 'all' | 'image' | 'video' | 'document';

/**
 * Reusable media library picker (used by the builder, CMS, settings, SEO…).
 * Supports search, folders, type filter, drag-and-drop upload with progress and
 * duplicate detection. Newly uploaded files are auto-selected.
 */
export function MediaPicker({ open, onOpenChange, organizationId, websiteId, kind = 'any', multiple = false, onSelect, title, confirmLabel }: MediaPickerProps) {
  const api = useApi();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [type, setType] = useState<TypeFilter>(kind === 'any' ? 'all' : kind);
  const [folderId, setFolderId] = useState<string>('all');
  const [scope, setScope] = useState<'site' | 'org'>(websiteId ? 'site' : 'org');
  const [selected, setSelected] = useState<Map<string, Media>>(new Map());

  useEffect(() => {
    if (open) {
      setSelected(new Map());
      setType(kind === 'any' ? 'all' : kind);
    }
  }, [open, kind]);

  const query = {
    websiteId: scope === 'site' ? websiteId : undefined,
    folderId: folderId === 'all' ? undefined : folderId,
    search: debounced || undefined,
    type: type === 'all' ? undefined : type,
  };

  const list = useInfiniteQuery({
    queryKey: qk.media(organizationId, { ...query, picker: true }),
    queryFn: ({ pageParam }) => api.media.list(organizationId, { ...query, cursor: pageParam, limit: 60 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open && !!organizationId,
  });

  const folders = useQuery({
    queryKey: qk.mediaFolders(organizationId, scope === 'site' ? websiteId : undefined),
    queryFn: () => api.media.folders(organizationId, { websiteId: scope === 'site' ? websiteId : undefined }),
    enabled: open && !!organizationId,
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const toggle = (m: Media) => {
    setSelected((prev) => {
      const next = new Map(multiple ? prev : []);
      if (prev.has(m.id)) next.delete(m.id);
      else next.set(m.id, m);
      return next;
    });
  };

  const uploads = useMediaUploads({
    organizationId,
    websiteId: scope === 'site' ? websiteId : undefined,
    folderId: folderId === 'all' || folderId === 'root' ? null : folderId,
    acceptPrefix: kind === 'image' ? ['image/'] : kind === 'video' ? ['video/'] : undefined,
    onUploaded: (m) =>
      setSelected((prev) => {
        const next = new Map(multiple ? prev : []);
        next.set(m.id, m);
        return next;
      }),
  });
  const picker = useFilePicker(uploads.upload, { accept: acceptFor(kind), multiple: true });

  const confirm = () => {
    if (!selected.size) return;
    onSelect([...selected.values()]);
    onOpenChange(false);
  };

  const noun = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="h-[min(720px,calc(100vh-64px))]" aria-describedby={undefined}>
        <DialogHeader title={title ?? (multiple ? `Select ${noun}s` : `Select ${noun}`)} />
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
          <Input
            size="sm"
            prefix={<Search />}
            placeholder="Search by name, alt text or tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
            aria-label="Search media"
          />
          {kind === 'any' && (
            <Select
              size="sm"
              value={type}
              onValueChange={(v) => setType(v as TypeFilter)}
              className="w-32"
              aria-label="File type"
              options={[
                { value: 'all', label: 'All types' },
                { value: 'image', label: 'Images' },
                { value: 'video', label: 'Videos' },
                { value: 'document', label: 'Documents' },
              ]}
            />
          )}
          <Select
            size="sm"
            value={folderId}
            onValueChange={setFolderId}
            className="w-40"
            aria-label="Folder"
            options={[{ value: 'all', label: 'All folders' }, { value: 'root', label: 'Unfiled' }, ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name }))]}
          />
          {websiteId && (
            <SegmentedControl
              size="sm"
              aria-label="Library scope"
              value={scope}
              onValueChange={setScope}
              options={[
                { value: 'site', label: 'This site' },
                { value: 'org', label: 'Organization' },
              ]}
            />
          )}
          <div className="flex-1" />
          <Button size="sm" leadingIcon={<Upload />} onClick={picker.open}>
            Upload
          </Button>
          {picker.input}
        </div>
        <Dropzone onFiles={uploads.upload} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 p-5">
            <UploadQueue items={uploads.items} onResolveDuplicate={uploads.resolveDuplicate} onRetry={uploads.retry} onCancel={uploads.cancel} onClear={uploads.clear} />
            {list.isPending ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-md" />
                ))}
              </div>
            ) : list.isError ? (
              <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<ImageIcon />}
                title={debounced ? 'No matches' : `No ${noun}s yet`}
                description={debounced ? 'Try a different search or folder.' : 'Drag files here or upload from your computer.'}
                action={
                  !debounced && (
                    <Button size="sm" variant="primary" leadingIcon={<Upload />} onClick={picker.open}>
                      Upload {noun}s
                    </Button>
                  )
                }
              />
            ) : (
              <div role="listbox" aria-multiselectable={multiple} aria-label="Media" className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
                {items.map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => toggle(m)}
                      onDoubleClick={() => {
                        if (!multiple) {
                          onSelect([m]);
                          onOpenChange(false);
                        }
                      }}
                      className={cn(
                        'group relative flex flex-col overflow-hidden rounded-md border bg-surface text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        on ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-border-strong',
                      )}
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <MediaThumb media={m} />
                      </div>
                      <div className="border-t border-border px-2 py-1.5">
                        <div className="truncate text-xs text-fg">{m.filename}</div>
                        <div className="truncate text-2xs text-fg-subtle">
                          {m.width && m.height ? `${m.width}×${m.height} · ` : ''}
                          {formatBytes(m.size)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border transition-opacity',
                          on ? 'border-accent bg-accent text-accent-fg opacity-100' : 'border-white/80 bg-black/20 opacity-0 group-hover:opacity-100',
                        )}
                      >
                        {on && <Check className="size-3" strokeWidth={2.5} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {list.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button size="sm" variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        </Dropzone>
        <DialogFooter className="justify-between">
          <span className="text-xs text-fg-muted">{selected.size ? `${selected.size} selected` : multiple ? 'Select one or more' : 'Double-click to choose quickly'}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!selected.size || uploads.busy} onClick={confirm}>
              {confirmLabel ?? (multiple && selected.size > 1 ? `Insert ${selected.size}` : 'Insert')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
