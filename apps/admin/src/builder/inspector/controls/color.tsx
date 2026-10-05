'use client';

import { X } from 'lucide-react';
import { useDocumentStore } from '../../store/document';
import { cn } from '../../lib/cn';
import { Popover, PopoverContent, PopoverTrigger, TextInput } from '../../ui/primitives';
import { humanize } from '../../lib/controls';
import type { ControlProps } from './types';

const EMPTY: Record<string, string> = {};

/** Resolve `@color.key` against the theme for display. */
export function useResolvedColor(value: string | undefined): string | undefined {
  const colors = useDocumentStore((s) => (s.definition?.theme.colors as Record<string, string> | undefined) ?? EMPTY);
  if (!value) return undefined;
  const m = /^@color\.([\w-]+)$/.exec(value);
  return m ? colors[m[1]!] : value;
}

export function ColorSwatch({ value, className }: { value: string | undefined; className?: string }) {
  const resolved = useResolvedColor(value);
  return (
    <span
      className={cn('inline-block size-4 shrink-0 rounded-[3px] border border-black/10', !resolved && 'bg-[linear-gradient(135deg,transparent_45%,#d33_45%,#d33_55%,transparent_55%)]', className)}
      style={resolved ? { background: resolved } : undefined}
    />
  );
}

/**
 * Theme-aware color picker: token swatches (`@color.*`, so theme changes
 * propagate) plus custom hex/rgba with the native picker.
 */
export function ColorField({ value, onChange, disabled, placeholder }: { value: string | undefined; onChange: (v: string | undefined, opts?: { mergeKey?: string }) => void; disabled?: boolean; placeholder?: string }) {
  const colors = useDocumentStore((s) => (s.definition?.theme.colors as Record<string, string> | undefined) ?? EMPTY);
  const resolved = useResolvedColor(value);
  const token = value?.startsWith('@color.') ? value.slice(7) : null;
  const hex = resolved && /^#[0-9a-f]{3,8}$/i.test(resolved) ? (resolved.length === 4 ? `#${[...resolved.slice(1)].map((c) => c + c).join('')}` : resolved.slice(0, 7)) : '#000000';
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" disabled={disabled} className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2 text-left text-[13px] hover:border-border-strong disabled:opacity-50">
          <ColorSwatch value={value} />
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-fg-subtle')}>{token ? humanize(token) : (value ?? placeholder ?? 'None')}</span>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear color"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Theme colors</p>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(colors).map(([key, c]) => (
              <button
                key={key}
                type="button"
                title={humanize(key)}
                onClick={() => onChange(`@color.${key}`)}
                className={cn('size-6 rounded-[4px] border border-black/10 outline-offset-1', token === key && 'outline outline-2 outline-accent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Custom</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(e.target.value, { mergeKey: 'color-drag' })}
              className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5"
              aria-label="Pick custom color"
            />
            <TextInput
              mono
              key={value}
              defaultValue={token ? '' : (value ?? '')}
              placeholder="#hex, rgb(), transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onChange((e.target as HTMLInputElement).value.trim() || undefined);
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== value) onChange(v);
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ColorControl({ value, onChange, disabled }: ControlProps<string | undefined>) {
  return <ColorField value={value} onChange={onChange} disabled={disabled} />;
}
