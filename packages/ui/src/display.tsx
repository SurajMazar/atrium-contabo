import { ChevronRight } from 'lucide-react';
import { Avatar as A, ScrollArea as SA, Separator as Sep, Tabs as Tb } from 'radix-ui';
import { forwardRef, Fragment, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './utils';

/* ------------------------------------------------------------------- Badge */

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'outline';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-border text-fg-muted',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  size?: 'xs' | 'sm';
}

export function Badge({ tone = 'neutral', dot, size = 'sm', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm font-medium [&_svg]:size-3 [&_svg]:stroke-[1.75]',
        size === 'xs' ? 'h-4 px-1 text-2xs' : 'h-5 px-1.5 text-xs',
        badgeTones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const dotTones = { neutral: 'bg-fg-subtle', accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const;

export function StatusDot({ tone = 'neutral', pulse, label, className }: { tone?: keyof typeof dotTones; pulse?: boolean; label?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className="relative flex size-2">
        {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', dotTones[tone])} />}
        <span className={cn('relative inline-flex size-2 rounded-full', dotTones[tone])} />
      </span>
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-3', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

/** Compact KPI tile. */
export function Stat({ label, value, sub, className, children }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-border bg-surface px-4 py-3', className)}>
      <div className="truncate text-xs text-fg-muted">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-fg-subtle">{sub}</div>}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */

export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;

export const TabsList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Tb.List> & { variant?: 'underline' | 'pill' }>(function TabsList({ className, variant = 'underline', ...props }, ref) {
  return (
    <Tb.List
      ref={ref}
      data-variant={variant}
      className={cn(
        'group/tabs flex items-center',
        variant === 'underline' ? 'gap-4 border-b border-border' : 'gap-0.5 rounded-md bg-surface-3/70 p-0.5',
        'overflow-x-auto [scrollbar-width:none]',
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Tb.Trigger> & { count?: number }>(function TabsTrigger({ className, count, children, ...props }, ref) {
  return (
    <Tb.Trigger
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        'group-data-[variant=underline]/tabs:-mb-px group-data-[variant=underline]/tabs:h-9 group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent',
        'group-data-[variant=underline]/tabs:data-[state=active]:border-fg group-data-[variant=underline]/tabs:data-[state=active]:text-fg',
        'group-data-[variant=pill]/tabs:h-6 group-data-[variant=pill]/tabs:rounded-sm group-data-[variant=pill]/tabs:px-2.5',
        'group-data-[variant=pill]/tabs:data-[state=active]:bg-surface group-data-[variant=pill]/tabs:data-[state=active]:text-fg group-data-[variant=pill]/tabs:data-[state=active]:shadow-sm',
        '[&_svg]:size-4 [&_svg]:stroke-[1.5]',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="rounded-sm bg-surface-3 px-1 text-2xs tabular-nums text-fg-muted">{count}</span>}
    </Tb.Trigger>
  );
});

/* ------------------------------------------------------------------ Avatar */

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

const avatarSizes = { xs: 'size-5 text-2xs', sm: 'size-6 text-2xs', md: 'size-8 text-xs', lg: 'size-10 text-sm' } as const;

export function Avatar({ src, name, size = 'sm', className, square }: { src?: string | null; name?: string | null; size?: keyof typeof avatarSizes; className?: string; square?: boolean }) {
  return (
    <A.Root className={cn('inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-surface-3 font-medium text-fg-muted', square ? 'rounded-sm' : 'rounded-full', avatarSizes[size], className)}>
      {src && <A.Image src={src} alt={name ?? ''} className="size-full object-cover" />}
      <A.Fallback delayMs={src ? 300 : 0}>{initials(name)}</A.Fallback>
    </A.Root>
  );
}

/* ------------------------------------------------------------- Breadcrumbs */

export interface Crumb {
  label: ReactNode;
  href?: string;
}

/** Pass `renderLink` to use the framework router (e.g. next/link). */
export function Breadcrumbs({ items, renderLink, className }: { items: Crumb[]; renderLink?: (c: Crumb, cls: string) => ReactNode; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center text-sm', className)}>
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const cls = cn('truncate rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring', last ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg');
          return (
            <Fragment key={i}>
              <li className="flex min-w-0 items-center">
                {c.href && !last ? (
                  renderLink ? (
                    renderLink(c, cls)
                  ) : (
                    <a href={c.href} className={cls}>
                      {c.label}
                    </a>
                  )
                ) : (
                  <span className={cls} aria-current={last ? 'page' : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-fg-subtle">
                  <ChevronRight className="size-3.5" strokeWidth={1.5} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------- PageHeader */

export function PageHeader({ title, description, actions, meta, className, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function SectionHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- Toolbar */

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="toolbar" className={cn('flex flex-wrap items-center gap-2', className)} {...props} />;
}

export function ToolbarSpacer() {
  return <div className="flex-1" />;
}

/* --------------------------------------------------------------- Separator */

export function Separator({ orientation = 'horizontal', className }: { orientation?: 'horizontal' | 'vertical'; className?: string }) {
  return <Sep.Root orientation={orientation} className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-4 w-px', className)} />;
}

/* -------------------------------------------------------------- ScrollArea */

export function ScrollArea({ className, viewportClassName, children, orientation = 'vertical' }: { className?: string; viewportClassName?: string; children: ReactNode; orientation?: 'vertical' | 'horizontal' | 'both' }) {
  return (
    <SA.Root className={cn('relative overflow-hidden', className)} type="hover">
      <SA.Viewport className={cn('size-full rounded-[inherit]', viewportClassName)}>{children}</SA.Viewport>
      {(orientation === 'vertical' || orientation === 'both') && (
        <SA.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none p-0.5 transition-colors">
          <SA.Thumb className="relative flex-1 rounded-full bg-border-strong" />
        </SA.Scrollbar>
      )}
      {(orientation === 'horizontal' || orientation === 'both') && (
        <SA.Scrollbar orientation="horizontal" className="flex h-2 touch-none select-none flex-col p-0.5">
          <SA.Thumb className="relative flex-1 rounded-full bg-border-strong" />
        </SA.Scrollbar>
      )}
    </SA.Root>
  );
}

/* ----------------------------------------------------- Description list row */

export function DescriptionList({ items, className }: { items: Array<{ label: ReactNode; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn('divide-y divide-border text-sm', className)}>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2">
          <dt className="text-fg-muted">{it.label}</dt>
          <dd className="min-w-0 break-words text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
