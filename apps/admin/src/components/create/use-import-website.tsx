'use client';

import type { Website } from '@atrium/sdk';
import { cn } from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { API_BASE_URL, uploadWithProgress } from '@/lib/api';

/** Upload a site bundle (.zip / site.json) with upload progress; the server then builds the site. */
export function useImportWebsite(orgId: string | null | undefined, opts: { onSuccess: (w: Website) => void; onError: (e: unknown) => void }) {
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (name?.trim()) fd.append('name', name.trim());
      setProgress(0);
      return uploadWithProgress<Website>(`${API_BASE_URL}/organizations/${orgId}/websites/import`, fd, { onProgress: setProgress });
    },
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
  return { ...mutation, progress };
}

/** "Uploading 45%" while the file goes up, then "Building the website…" while the server imports media and pages. */
export function ImportProgress({ pending, progress, className }: { pending: boolean; progress: number; className?: string }) {
  if (!pending) return null;
  const uploading = progress < 1;
  return (
    <div className={cn('space-y-1.5', className)} role="status" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full bg-accent transition-[width] duration-200', !uploading && 'animate-pulse')}
          style={{ width: `${Math.max(4, Math.round((uploading ? progress : 1) * 100))}%` }}
        />
      </div>
      <p className="text-xs text-fg-muted">{uploading ? `Uploading ${Math.round(progress * 100)}%` : 'Building the website — importing pages and media…'}</p>
    </div>
  );
}
