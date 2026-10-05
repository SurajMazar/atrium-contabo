import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { Checkbox } from './controls';
import { cn } from './utils';

/** Dense data table primitives. Wrap in `<TableContainer>` for border + horizontal scroll. */
export function TableContainer({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('overflow-x-auto rounded-lg border border-border bg-surface', className)}>{children}</div>;
}

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table({ className, ...props }, ref) {
  return <table ref={ref} className={cn('w-full border-collapse text-sm', className)} {...props} />;
});

export function THead({ className, sticky, ...props }: HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  return <thead className={cn('border-b border-border bg-surface-2/60 text-left', sticky && 'sticky top-0 z-10', className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  interactive?: boolean;
}

export function TR({ className, selected, interactive, ...props }: TRProps) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn('group/row transition-colors', interactive && 'cursor-pointer hover:bg-surface-2/60', selected && 'bg-accent-soft/50 hover:bg-accent-soft/70', className)}
      {...props}
    />
  );
}

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | false;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}

export function TH({ className, sortable, sorted, onSort, align = 'left', children, ...props }: THProps) {
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      scope="col"
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
      className={cn('h-8 whitespace-nowrap px-3 text-xs font-medium text-fg-muted', alignCls, className)}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn('-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring', align === 'right' && 'flex-row-reverse', sorted && 'text-fg')}
        >
          {children}
          {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TD({ className, align = 'left', muted, mono, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; muted?: boolean; mono?: boolean }) {
  return (
    <td
      className={cn(
        'h-10 px-3 align-middle',
        align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left',
        muted && 'text-fg-muted',
        mono && 'font-mono text-xs',
        className,
      )}
      {...props}
    />
  );
}

/** Header checkbox for row selection (supports indeterminate). */
export function SelectAllCheckbox({ total, selected, onChange }: { total: number; selected: number; onChange: (all: boolean) => void }) {
  const state = selected === 0 ? false : selected === total ? true : 'indeterminate';
  return <Checkbox aria-label="Select all rows" checked={state} onCheckedChange={() => onChange(state !== true)} />;
}

export function RowCheckbox({ checked, onChange, label = 'Select row' }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="flex items-center">
      <Checkbox aria-label={label} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
    </span>
  );
}

export type SortState<K extends string = string> = { key: K; dir: 'asc' | 'desc' } | null;

/** Cycle asc → desc → none. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

export function sortRows<T>(rows: T[], sort: SortState, get: (row: T, key: string) => unknown): T[] {
  if (!sort) return rows;
  const out = [...rows];
  out.sort((a, b) => {
    const av = get(a, sort.key);
    const bv = get(b, sort.key);
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const r = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sort.dir === 'asc' ? r : -r;
  });
  return out;
}

/** Floating bar shown when rows are selected. */
export function BulkBar({ count, onClear, children, className }: { count: number; onClear: () => void; children: ReactNode; className?: string }) {
  if (count === 0) return null;
  return (
    <div className={cn('flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 shadow-popover animate-slide-up', className)} role="region" aria-label="Bulk actions">
      <span className="text-sm font-medium tabular-nums">{count} selected</span>
      <button type="button" onClick={onClear} className="text-xs text-fg-muted hover:text-fg">
        Clear
      </button>
      <span className="mx-1 h-4 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}
