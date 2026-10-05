'use client';
import { Check, ChevronDown, X } from 'lucide-react';
import { Popover as P } from 'radix-ui';
import { useMemo, useState, type ReactNode } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { cn, fieldBase } from './utils';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface BaseProps {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
  loading?: boolean;
  /** Async search: called with the query; disables built-in filtering. */
  onSearch?: (q: string) => void;
  /** Allow creating a value not in options. */
  creatable?: boolean;
  'aria-label'?: string;
}

export interface ComboboxSingleProps extends BaseProps {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
  clearable?: boolean;
}

export interface ComboboxMultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultiProps;

/** Searchable select (single or multi) built on Popover + cmdk. */
export function Combobox(props: ComboboxProps) {
  const { options, placeholder = 'Select…', searchPlaceholder = 'Search…', emptyText = 'No matches', disabled, invalid, size = 'md', className, id, loading, onSearch, creatable } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  const toggle = (v: string) => {
    if (props.multiple) {
      props.onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      props.onChange(v === props.value && props.clearable ? null : v);
      setOpen(false);
    }
  };

  const label = props.multiple ? null : props.value ? (byValue.get(props.value)?.label ?? props.value) : null;
  const showCreate = creatable && query.trim() && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label={props['aria-label']}
          aria-invalid={invalid || undefined}
          className={cn(fieldBase, 'flex items-center gap-1.5 px-2 text-left text-sm', props.multiple ? 'min-h-8 flex-wrap py-1' : size === 'sm' ? 'h-7' : 'h-8', className)}
        >
          {props.multiple ? (
            selected.length ? (
              selected.map((v) => (
                <span key={v} className="inline-flex h-5 items-center gap-1 rounded-sm bg-surface-3 pl-1.5 pr-0.5 text-xs text-fg">
                  {byValue.get(v)?.label ?? v}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${byValue.get(v)?.label ?? v}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(v);
                    }}
                    className="inline-flex size-4 items-center justify-center rounded-xs text-fg-subtle hover:bg-surface-2 hover:text-fg"
                  >
                    <X className="size-3" />
                  </span>
                </span>
              ))
            ) : (
              <span className="px-0.5 text-fg-subtle">{placeholder}</span>
            )
          ) : (
            <span className={cn('flex-1 truncate px-0.5', !label && 'text-fg-subtle')}>{label ?? placeholder}</span>
          )}
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={4} className="z-50 w-[max(var(--radix-popover-trigger-width),240px)] overflow-hidden rounded-md border border-border bg-surface shadow-popover animate-fade-in">
          <Command shouldFilter={!onSearch} loop>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={(q) => {
                setQuery(q);
                onSearch?.(q);
              }}
            />
            <CommandList className="max-h-64">
              {loading ? <div className="px-3 py-3 text-sm text-fg-muted">Loading…</div> : <CommandEmpty>{emptyText}</CommandEmpty>}
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.value}`} disabled={o.disabled} onSelect={() => toggle(o.value)} icon={o.icon} hint={o.description}>
                    <span className="flex items-center gap-2">
                      <Check className={cn('size-3.5 !text-accent', selected.includes(o.value) ? 'opacity-100' : 'opacity-0')} strokeWidth={2} />
                      {o.label}
                    </span>
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem value={`__create__${query}`} onSelect={() => { toggle(query.trim()); setQuery(''); }}>
                    Create “{query.trim()}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
