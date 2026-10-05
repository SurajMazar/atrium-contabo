'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-xs text-fg-subtle">500</p>
      <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
      <p className="max-w-md text-sm text-fg-muted">An unexpected error occurred while rendering this screen. Your work on the server is safe.</p>
      {error.digest && <p className="font-mono text-2xs text-fg-subtle">Reference {error.digest}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={reset} className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent/90">
          Try again
        </button>
        <a href="/" className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg hover:bg-surface-2">
          Go home
        </a>
      </div>
    </div>
  );
}
