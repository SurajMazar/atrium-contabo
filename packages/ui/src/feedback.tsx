import { Progress as ProgressPrimitive } from 'radix-ui';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <svg className={cn('size-4 animate-spin text-current', className)} viewBox="0 0 16 16" fill="none" role="status" aria-label={label}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-surface-3/70', className)} {...props} />;
}

/** A few stacked skeleton rows for list/table loading states. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-border', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-1/6" />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Compact variant for panels and drawers. */
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-4 py-8' : 'gap-2 px-6 py-16', className)}>
      {icon && (
        <div className="mb-1 flex size-9 items-center justify-center rounded-md border border-border bg-surface text-fg-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Could not load this', description, onRetry, className }: { title?: string; description?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 text-sm font-medium text-accent hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-border bg-surface-2 px-1 font-sans text-2xs font-medium text-fg-muted', className)}>
      {children}
    </kbd>
  );
}

export interface ProgressProps {
  value: number | null;
  max?: number;
  className?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  label?: string;
}

const toneClass = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const;

export function Progress({ value, max = 100, className, tone = 'accent', size = 'sm', label }: ProgressProps) {
  const pct = value === null ? null : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <ProgressPrimitive.Root
      aria-label={label}
      value={value}
      max={max}
      className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', size === 'sm' ? 'h-1' : 'h-1.5', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-[width] duration-300', toneClass[tone], pct === null && 'w-1/3 animate-pulse')}
        style={pct === null ? undefined : { width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export function Banner({ tone = 'neutral', icon, children, action, className }: { tone?: 'neutral' | 'info' | 'warning' | 'danger' | 'success'; icon?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  const tones = {
    neutral: 'border-border bg-surface-2 text-fg',
    info: 'border-accent/20 bg-accent-soft text-fg',
    warning: 'border-warning/25 bg-warning-soft text-fg',
    danger: 'border-danger/25 bg-danger-soft text-fg',
    success: 'border-success/25 bg-success-soft text-fg',
  } as const;
  const iconTone = { neutral: 'text-fg-muted', info: 'text-accent', warning: 'text-warning', danger: 'text-danger', success: 'text-success' } as const;
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm', tones[tone], className)}>
      {icon && <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.5]', iconTone[tone])}>{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
