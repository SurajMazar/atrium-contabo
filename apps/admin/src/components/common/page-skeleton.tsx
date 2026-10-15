'use client';

import { Skeleton, Spinner } from '@atrium/ui';
import { Page } from './page';

/** Generic screen placeholder: route `loading.tsx` fallbacks and data boundaries. */
export function PageSkeleton() {
  return (
    <Page>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </Page>
  );
}

/** Full-screen placeholder while switching between the shell, the builder and focus screens. */
export function ScreenSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center text-fg-muted">
      <Spinner className="size-5" />
    </div>
  );
}
