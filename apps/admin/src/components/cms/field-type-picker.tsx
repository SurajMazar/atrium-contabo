'use client';

import type { CollectionFieldType } from '@atrium/schema';
import { cn, Input, Popover, PopoverContent, PopoverTrigger } from '@atrium/ui';
import { Search } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FIELD_TYPE_GROUPS, FIELD_TYPE_META } from './field-types';

/** Popover grid of every collection field type, filterable, with arrow-key navigation. */
export function FieldTypePicker({ children, onPick, align = 'end' }: { children: ReactNode; onPick: (t: CollectionFieldType) => void; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELD_TYPE_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) => !q || t.includes(q) || FIELD_TYPE_META[t].label.toLowerCase().includes(q) || FIELD_TYPE_META[t].description.toLowerCase().includes(q)),
    })).filter((g) => g.types.length > 0);
  }, [query]);

  const pick = (t: CollectionFieldType) => {
    onPick(t);
    setOpen(false);
    setQuery('');
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-type-option]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 2 : e.key === 'ArrowUp' ? -2 : 0;
    if (!step) return;
    e.preventDefault();
    const next = items[Math.min(items.length - 1, Math.max(0, i + step))];
    next?.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-[min(520px,calc(100vw-32px))] p-0">
        <div className="border-b border-border p-2">
          <Input
            size="sm"
            autoFocus
            prefix={<Search />}
            placeholder="Search field types"
            aria-label="Search field types"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                gridRef.current?.querySelector<HTMLButtonElement>('[data-type-option]')?.focus();
              } else if (e.key === 'Enter') {
                const first = groups[0]?.types[0];
                if (first) {
                  e.preventDefault();
                  pick(first);
                }
              }
            }}
          />
        </div>
        <div ref={gridRef} onKeyDown={onGridKey} className="max-h-[min(440px,60vh)] overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-2 py-6 text-center text-sm text-fg-muted">No field types match “{query}”</p>}
          {groups.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <div className="px-1.5 pb-1 pt-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{g.label}</div>
              <div className="grid grid-cols-2 gap-1">
                {g.types.map((t) => {
                  const meta = FIELD_TYPE_META[t];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={t}
                      type="button"
                      data-type-option
                      onClick={() => pick(t)}
                      className={cn('flex items-start gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring')}
                    >
                      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-fg-muted">
                        <Icon className="size-4" strokeWidth={1.5} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-fg">{meta.label}</span>
                        <span className="block text-xs leading-4 text-fg-muted">{meta.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FieldTypeIcon({ type, className }: { type: CollectionFieldType; className?: string }) {
  const Icon = FIELD_TYPE_META[type]?.icon;
  return (
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted', className)}>
      {Icon && <Icon className="size-3.5" strokeWidth={1.5} />}
    </span>
  );
}
