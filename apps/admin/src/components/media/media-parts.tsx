'use client';

import type { Media } from '@atrium/sdk';
import { Badge, Button, cn, IconButton, Progress } from '@atrium/ui';
import { AlertCircle, Check, File, FileText, Film, RotateCw, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { formatBytes } from '@/lib/format';
import type { UploadItem } from './use-media-uploads';

export function mediaKind(m: Pick<Media, 'mimeType'>): 'image' | 'video' | 'document' {
  if (m.mimeType.startsWith('image/')) return 'image';
  if (m.mimeType.startsWith('video/')) return 'video';
  return 'document';
}

/** Smallest variant at least `min` px wide, or the original. */
export function thumbUrl(m: Media, min = 320): string {
  const v = [...(m.variants ?? [])].filter((x) => x.width >= min).sort((a, b) => a.width - b.width)[0];
  return v?.url ?? m.url;
}

export function MediaThumb({ media, className, fit = 'cover' }: { media: Media; className?: string; fit?: 'cover' | 'contain' }) {
  const kind = mediaKind(media);
  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbUrl(media)}
        alt={media.alt ?? ''}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn('size-full bg-surface-2', fit === 'cover' ? 'object-cover' : 'object-contain', className)}
        style={media.blurDataUrl ? { backgroundImage: `url(${media.blurDataUrl})`, backgroundSize: 'cover' } : undefined}
      />
    );
  }
  return (
    <div className={cn('flex size-full flex-col items-center justify-center gap-1 bg-surface-2 text-fg-subtle', className)}>
      {kind === 'video' ? <Film className="size-5" strokeWidth={1.5} /> : media.mimeType.includes('pdf') ? <FileText className="size-5" strokeWidth={1.5} /> : <File className="size-5" strokeWidth={1.5} />}
      <span className="max-w-[90%] truncate font-mono text-2xs uppercase">{media.filename.split('.').pop()}</span>
    </div>
  );
}

/** Wraps children as a drag-and-drop file target. */
export function Dropzone({ onFiles, children, className, disabled, overlayLabel = 'Drop files to upload' }: { onFiles: (files: File[]) => void; children: ReactNode; className?: string; disabled?: boolean; overlayLabel?: string }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const has = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return (
    <div
      className={cn('relative', className)}
      onDragEnter={(e) => {
        if (disabled || !has(e)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !has(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !has(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent-soft/70">
          <span className="flex items-center gap-2 text-sm font-medium text-accent">
            <Upload className="size-4" strokeWidth={1.5} />
            {overlayLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export function useFilePicker(onFiles: (files: File[]) => void, opts: { accept?: string; multiple?: boolean } = {}) {
  const ref = useRef<HTMLInputElement>(null);
  const open = useCallback(() => ref.current?.click(), []);
  const input = (
    <input
      ref={ref}
      type="file"
      hidden
      accept={opts.accept}
      multiple={opts.multiple ?? true}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length) onFiles(files);
        e.target.value = '';
      }}
    />
  );
  return { open, input };
}

/** Per-file upload progress list with duplicate resolution. */
export function UploadQueue({
  items,
  onResolveDuplicate,
  onRetry,
  onCancel,
  onClear,
  className,
}: {
  items: UploadItem[];
  onResolveDuplicate: (id: string, choice: 'existing' | 'upload') => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onClear: () => void;
  className?: string;
}) {
  if (!items.length) return null;
  const done = items.filter((i) => i.status === 'done').length;
  const settled = items.every((i) => i.status !== 'uploading' && i.status !== 'queued');
  return (
    <div className={cn('rounded-md border border-border bg-surface', className)}>
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-fg">
          Uploads <span className="ml-1 tabular-nums text-fg-muted">{done}/{items.length}</span>
        </span>
        {settled && (
          <Button size="xs" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto">
        {items.map((it) => (
          <li key={it.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{it.file.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{formatBytes(it.file.size)}</span>
              {it.status === 'done' && <Check className="size-4 text-success" strokeWidth={2} aria-label="Uploaded" />}
              {it.status === 'error' && (
                <>
                  <AlertCircle className="size-4 text-danger" strokeWidth={1.5} aria-hidden />
                  <IconButton label="Retry" size="xs" onClick={() => onRetry(it.id)}>
                    <RotateCw />
                  </IconButton>
                </>
              )}
              {it.status === 'cancelled' && <Badge size="xs">Cancelled</Badge>}
              {(it.status === 'uploading' || it.status === 'queued') && (
                <IconButton label="Cancel upload" size="xs" onClick={() => onCancel(it.id)}>
                  <X />
                </IconButton>
              )}
            </div>
            {(it.status === 'uploading' || it.status === 'queued') && <Progress className="mt-1.5" value={it.status === 'queued' ? 0 : Math.round(it.progress * 100)} label={`Uploading ${it.file.name}`} />}
            {it.status === 'error' && <p className="mt-0.5 text-xs text-danger">{it.error}</p>}
            {it.status === 'duplicate' && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-sm bg-warning-soft px-2 py-1.5 text-xs">
                <span className="flex-1 text-fg">
                  An identical file is already in the library{typeof it.duplicateOf === 'object' && it.duplicateOf ? ` (${it.duplicateOf.filename})` : ''}.
                </span>
                <Button size="xs" variant="secondary" onClick={() => onResolveDuplicate(it.id, 'existing')}>
                  Use existing
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onResolveDuplicate(it.id, 'upload')}>
                  Upload anyway
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
