'use client';

import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { MediaRef } from '@atrium/schema';
import { Button, cn, IconButton } from '@atrium/ui';
import { ImagePlus, X } from 'lucide-react';
import { useState } from 'react';
import { MediaPicker } from '@/components/media/media-picker';
import { announcements, DragHandle, Sortable, useSortSensors } from './sortable';
import { mediaToRef, readGallery } from './values';

/** Ordered image list: add via the media picker (multi-select), drag to reorder, remove. */
export function GalleryInput({ value, onChange, organizationId, websiteId, disabled, id }: { value: unknown; onChange: (v: MediaRef[] | null) => void; organizationId: string; websiteId: string; disabled?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const sensors = useSortSensors();
  const items = readGallery(value);
  // Sortable ids must be unique even if the same image appears twice.
  const keyed = items.map((m, i) => ({ id: `${m.mediaId ?? m.src}#${i}`, m }));

  const commit = (next: MediaRef[]) => onChange(next.length ? next : null);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = keyed.findIndex((k) => k.id === e.active.id);
    const to = keyed.findIndex((k) => k.id === e.over!.id);
    commit(arrayMove(items, from, to));
  };

  return (
    <div id={id} className="space-y-2">
      {items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements: announcements((sid) => `image ${keyed.findIndex((k) => k.id === sid) + 1}`) }}>
          <SortableContext items={keyed.map((k) => k.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Gallery images">
              {keyed.map(({ id: sid, m }, i) => (
                <Sortable key={sid} id={sid} disabled={disabled}>
                  {({ setNodeRef, style, handleProps, isDragging }) => (
                    <li ref={setNodeRef} style={style} className={cn('group relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2', isDragging && 'shadow-popover ring-2 ring-accent')}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.src} alt={m.alt ?? ''} className="size-full object-cover" loading="lazy" />
                      <div className="absolute inset-x-1 top-1 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <DragHandle {...handleProps} disabled={disabled} label={`Reorder image ${i + 1}`} className="bg-surface/90 shadow-xs" />
                        <IconButton label={`Remove image ${i + 1}`} size="xs" variant="secondary" disabled={disabled} onClick={() => commit(items.filter((_, j) => j !== i))}>
                          <X />
                        </IconButton>
                      </div>
                      <span className="absolute bottom-1 left-1 rounded-xs bg-surface/90 px-1 text-2xs tabular-nums text-fg-muted">{i + 1}</span>
                    </li>
                  )}
                </Sortable>
              ))}
              <li>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setOpen(true)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-fg-muted outline-none transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <ImagePlus className="size-4" strokeWidth={1.5} />
                  Add
                </button>
              </li>
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border-strong px-3 py-3">
          <span className="text-xs text-fg-muted">No images yet</span>
          <Button size="xs" leadingIcon={<ImagePlus />} onClick={() => setOpen(true)} disabled={disabled}>
            Add images
          </Button>
        </div>
      )}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        organizationId={organizationId}
        websiteId={websiteId}
        kind="image"
        multiple
        title="Add images to gallery"
        confirmLabel="Add to gallery"
        onSelect={(media) => commit([...items, ...media.map(mediaToRef)])}
      />
    </div>
  );
}
