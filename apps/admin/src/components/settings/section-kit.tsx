'use client';

import { Banner, cn, ErrorState, Skeleton, Tooltip, useCopy } from '@atrium/ui';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionHeading({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionSkeleton({ groups = 2 }: { groups?: number }) {
  return (
    <div className="space-y-4" aria-busy>
      <div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1.5 h-3.5 w-72" />
      </div>
      {Array.from({ length: groups }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Shared loading / error handling for draft-backed sections. */
export function SectionState({ isPending, isError, error, onRetry, groups, children }: { isPending: boolean; isError: boolean; error?: Error | null; onRetry: () => void; groups?: number; children: () => ReactNode }) {
  if (isPending) return <SectionSkeleton groups={groups} />;
  if (isError) return <ErrorState description={error?.message} onRetry={onRetry} />;
  return <>{children()}</>;
}

export function ReadOnlyBanner({ permission, children }: { permission: string; children?: ReactNode }) {
  return (
    <Banner tone="neutral" icon={<Lock />} className="mb-4">
      {children ?? 'You can view these settings but not change them.'} Requires <code className="font-mono text-xs">{permission}</code>.
    </Banner>
  );
}

/** Small click-to-copy chip showing the builder binding for a field, e.g. {{business.phone}}. */
export function BindingHint({ path, className }: { path: string; className?: string }) {
  const { copied, copy } = useCopy();
  const token = `{{${path}}}`;
  return (
    <Tooltip content={copied ? 'Copied' : 'Copy binding'}>
      <button
        type="button"
        onClick={() => void copy(token)}
        className={cn('rounded-xs px-1 font-mono text-2xs text-fg-subtle outline-none hover:bg-surface-3 hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring', className)}
      >
        {token}
      </button>
    </Tooltip>
  );
}
