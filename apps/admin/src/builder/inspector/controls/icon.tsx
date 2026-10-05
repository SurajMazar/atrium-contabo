'use client';

import { iconNames } from 'lucide-react/dynamic';
import { X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { Icon, Popover, PopoverContent, PopoverTrigger, SearchInput } from '../../ui/primitives';
import type { ControlProps } from './types';

const POPULAR = [
  'sparkle', 'star', 'heart', 'check', 'leaf', 'sun', 'moon', 'coffee', 'utensils', 'wine', 'bed-double', 'bath', 'wifi', 'car', 'plane',
  'map-pin', 'phone', 'mail', 'calendar', 'clock', 'users', 'gift', 'camera', 'music', 'mountain', 'waves', 'flower-2', 'trees', 'dumbbell',
  'shield-check', 'award', 'gem', 'crown', 'arrow-right', 'arrow-up-right', 'chevron-right', 'plus', 'minus', 'quote', 'globe',
];

export function IconPicker({ value, onChange, disabled }: { value: string | undefined; onChange: (v: string | undefined) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const list = useMemo(() => {
    if (!dq) return POPULAR.filter((n) => (iconNames as readonly string[]).includes(n));
    return (iconNames as readonly string[]).filter((n) => n.includes(dq)).slice(0, 120);
  }, [dq]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2 text-left text-[13px] hover:border-border-strong disabled:opacity-50">
          <Icon name={value} size={15} />
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-fg-subtle')}>{value ?? 'Choose icon'}</span>
          {value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear icon"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="rounded p-0.5 text-fg-subtle hover:bg-surface-2"
            >
              <X className="size-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search 1,500+ icons" autoFocus />
        <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto">
          {list.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onChange(name)}
              className={cn('flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg', name === value && 'bg-accent-soft text-accent')}
            >
              <Icon name={name} size={16} />
            </button>
          ))}
          {!list.length && <p className="col-span-8 py-6 text-center text-xs text-fg-muted">No icons match “{q}”.</p>}
        </div>
        {!dq && <p className="px-1 text-[11px] text-fg-subtle">Popular icons · search to see all</p>}
      </PopoverContent>
    </Popover>
  );
}

export function IconControl({ value, onChange, disabled }: ControlProps<string | undefined>) {
  return <IconPicker value={value} onChange={onChange} disabled={disabled} />;
}
