'use client';

import type { Media } from '@atrium/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { API_BASE_URL, UploadError, uploadWithProgress } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'duplicate' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  media?: Media;
  /** Existing media the server flagged as identical (409 duplicateOf). */
  duplicateOf?: Media | string;
}

export interface UseMediaUploadsOptions {
  organizationId: string;
  websiteId?: string;
  folderId?: string | null;
  /** Called for every successfully uploaded (or reused) media item. */
  onUploaded?: (media: Media, item: UploadItem) => void;
  concurrency?: number;
  /** Accept filter applied before upload, e.g. 'image/' */
  acceptPrefix?: string[];
  maxSizeMb?: number;
}

let seq = 0;

/** Upload queue with XHR progress, cancellation and duplicate detection. */
export function useMediaUploads({ organizationId, websiteId, folderId, onUploaded, concurrency = 3, acceptPrefix, maxSizeMb = 100 }: UseMediaUploadsOptions) {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const active = useRef(0);
  const queue = useRef<Array<{ id: string; allowDuplicate: boolean }>>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const patch = useCallback((id: string, p: Partial<UploadItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, ...p } : it));
      itemsRef.current = next;
      return next;
    });
  }, []);

  const pump = useCallback(() => {
    while (active.current < concurrency && queue.current.length) {
      const job = queue.current.shift()!;
      const item = itemsRef.current.find((i) => i.id === job.id);
      if (!item || item.status === 'cancelled') continue;
      active.current++;
      const ctrl = new AbortController();
      controllers.current.set(job.id, ctrl);
      patch(job.id, { status: 'uploading', progress: 0, error: undefined });
      const fd = new FormData();
      fd.append('file', item.file, item.file.name);
      if (folderId) fd.append('folderId', folderId);
      if (websiteId) fd.append('websiteId', websiteId);
      if (job.allowDuplicate) fd.append('allowDuplicate', 'true');
      uploadWithProgress<Media>(`${API_BASE_URL}/organizations/${organizationId}/media/upload`, fd, {
        signal: ctrl.signal,
        onProgress: (f) => patch(job.id, { progress: f }),
      })
        .then((media) => {
          patch(job.id, { status: 'done', progress: 1, media });
          onUploadedRef.current?.(media, { ...item, media, status: 'done' });
          void qc.invalidateQueries({ queryKey: qk.mediaAll(organizationId) });
        })
        .catch((err: unknown) => {
          if (err instanceof UploadError && err.status === 409) {
            const d = err.details as { duplicateOf?: Media | string } | undefined;
            patch(job.id, { status: 'duplicate', duplicateOf: d?.duplicateOf, progress: 1 });
          } else if (err instanceof UploadError && err.status === -1) {
            patch(job.id, { status: 'cancelled' });
          } else {
            patch(job.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
          }
        })
        .finally(() => {
          active.current--;
          controllers.current.delete(job.id);
          pump();
        });
    }
  }, [concurrency, folderId, organizationId, patch, qc, websiteId]);

  const upload = useCallback(
    (files: File[] | FileList) => {
      const list = Array.from(files);
      const created: UploadItem[] = list.map((file) => {
        const id = `up_${++seq}`;
        const tooBig = file.size > maxSizeMb * 1024 * 1024;
        const badType = acceptPrefix && !acceptPrefix.some((p) => file.type.startsWith(p));
        return {
          id,
          file,
          progress: 0,
          status: tooBig || badType ? 'error' : 'queued',
          error: tooBig ? `Larger than ${maxSizeMb} MB` : badType ? 'File type not allowed here' : undefined,
        };
      });
      setItems((prev) => {
        const next = [...created, ...prev];
        itemsRef.current = next;
        return next;
      });
      for (const it of created) if (it.status === 'queued') queue.current.push({ id: it.id, allowDuplicate: false });
      pump();
      return created;
    },
    [acceptPrefix, maxSizeMb, pump],
  );

  const resolveDuplicate = useCallback(
    (id: string, choice: 'existing' | 'upload') => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      if (choice === 'existing') {
        const dup = item.duplicateOf;
        if (dup && typeof dup === 'object') {
          patch(id, { status: 'done', media: dup });
          onUploadedRef.current?.(dup, { ...item, media: dup, status: 'done' });
        } else {
          patch(id, { status: 'done' });
        }
      } else {
        patch(id, { status: 'queued', duplicateOf: undefined, progress: 0 });
        queue.current.push({ id, allowDuplicate: true });
        pump();
      }
    },
    [patch, pump],
  );

  const retry = useCallback(
    (id: string) => {
      patch(id, { status: 'queued', progress: 0, error: undefined });
      queue.current.push({ id, allowDuplicate: false });
      pump();
    },
    [patch, pump],
  );

  const cancel = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort();
      patch(id, { status: 'cancelled' });
    },
    [patch],
  );

  const clear = useCallback(() => {
    setItems((prev) => {
      const next = prev.filter((i) => i.status === 'uploading' || i.status === 'queued' || i.status === 'duplicate');
      itemsRef.current = next;
      return next;
    });
  }, []);

  const busy = items.some((i) => i.status === 'uploading' || i.status === 'queued');
  return { items, upload, resolveDuplicate, retry, cancel, clear, busy };
}

/** Accept strings for the native file input by picker kind. */
export function acceptFor(kind: 'image' | 'video' | 'any' = 'any'): string | undefined {
  if (kind === 'image') return 'image/*';
  if (kind === 'video') return 'video/*';
  return undefined;
}
