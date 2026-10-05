'use client';
import { Check, Copy, Eye, EyeOff, Pencil, X } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconButton } from './button';
import { Input } from './input';
import { cn, fieldBase } from './utils';

/* --------------------------------------------------------------- CopyField */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function useCopy(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setCopied(false), timeout);
    }
    return ok;
  };
  return { copied, copy };
}

export function CopyButton({ value, label = 'Copy', size = 'xs', className }: { value: string; label?: string; size?: 'xs' | 'sm'; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <IconButton label={copied ? 'Copied' : label} size={size} className={className} onClick={() => void copy(value)}>
      {copied ? <Check className="!text-success" /> : <Copy />}
    </IconButton>
  );
}

export function CopyField({ value, mono = true, className, size = 'md', label }: { value: string; mono?: boolean; className?: string; size?: 'sm' | 'md'; label?: string }) {
  return (
    <div className={cn('flex items-center rounded-md border border-border bg-surface-2/60', size === 'sm' ? 'h-7' : 'h-8', className)}>
      <input
        readOnly
        value={value}
        aria-label={label ?? 'Value'}
        onFocus={(e) => e.currentTarget.select()}
        className={cn('h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-fg outline-none', mono && 'font-mono text-xs')}
      />
      <CopyButton value={value} className="mr-0.5" />
    </div>
  );
}

/* ------------------------------------------------------------- SecretInput */

export interface SecretInputProps {
  /** Masked value from the server (e.g. ••••••••abcd) or empty when unset. */
  maskedValue?: string | null;
  /** New value typed by the user; undefined = keep stored value. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}

/**
 * Write-only secret. Shows the stored masked value with a "Replace" action;
 * leaving it untouched keeps the server-side value (field is omitted on save).
 */
export function SecretInput({ maskedValue, value, onChange, placeholder = 'Enter secret', id, invalid, disabled, multiline }: SecretInputProps) {
  const [reveal, setReveal] = useState(false);
  const editing = value !== undefined || !maskedValue;
  if (!editing) {
    return (
      <div className={cn('flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2/60 pl-2.5 pr-1')}>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted" aria-label="Stored secret (masked)">
          {maskedValue}
        </span>
        <Button size="xs" variant="ghost" leadingIcon={<Pencil />} disabled={disabled} onClick={() => onChange('')}>
          Replace
        </Button>
      </div>
    );
  }
  const common = {
    id,
    value: value ?? '',
    disabled,
    autoComplete: 'off',
    spellCheck: false,
    placeholder,
    'aria-invalid': invalid || undefined,
  } as const;
  return (
    <div className="flex items-start gap-1">
      {multiline ? (
        <textarea {...common} rows={4} onChange={(e) => onChange(e.target.value)} className={cn(fieldBase, 'px-2.5 py-1.5 font-mono text-xs', !reveal && '[-webkit-text-security:disc]')} />
      ) : (
        <Input
          {...common}
          type={reveal ? 'text' : 'password'}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 font-mono"
          suffix={
            <IconButton label={reveal ? 'Hide' : 'Show'} size="xs" onClick={() => setReveal((r) => !r)}>
              {reveal ? <EyeOff /> : <Eye />}
            </IconButton>
          }
        />
      )}
      {maskedValue && (
        <IconButton label="Keep stored value" size="md" onClick={() => onChange(undefined)}>
          <X />
        </IconButton>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- ColorInput */

export interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  presets?: string[];
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function ColorInput({ value, onChange, id, disabled, className, presets }: ColorInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = HEX.test(draft) || draft.startsWith('var(') || draft.startsWith('rgb') || draft.startsWith('hsl') || draft.startsWith('oklch');
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('flex h-8 items-center gap-2 rounded-md border border-border bg-surface pl-1 pr-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-ring', !valid && 'border-danger')}>
        <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-border" style={{ background: valid ? draft : 'transparent' }}>
          <input
            type="color"
            disabled={disabled}
            aria-label="Pick color"
            value={HEX.test(draft) && draft.length === 7 ? draft : '#000000'}
            onChange={(e) => {
              setDraft(e.target.value);
              onChange(e.target.value);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <input
          id={id}
          disabled={disabled}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => (valid ? onChange(draft) : setDraft(value))}
          onKeyDown={(e) => e.key === 'Enter' && valid && onChange(draft)}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs uppercase outline-none"
        />
      </div>
      {presets && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button key={p} type="button" aria-label={p} title={p} onClick={() => onChange(p)} className={cn('size-5 rounded-sm border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring', p === value && 'ring-2 ring-accent')} style={{ background: p }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- TagInput */

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  id?: string;
  suggestions?: string[];
  disabled?: boolean;
  className?: string;
  /** Normalize tags (e.g. lower-case). */
  transform?: (t: string) => string;
  max?: number;
}

export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput({ value, onChange, placeholder = 'Add…', id, suggestions, disabled, className, transform = (t) => t.trim(), max }, ref) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map(transform).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.includes(p) && (!max || next.length < max)) next.push(p);
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const listId = id ? `${id}-suggestions` : undefined;
  return (
    <div className={cn(fieldBase, 'flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-ring', className)}>
      {value.map((t) => (
        <span key={t} className="inline-flex h-5 items-center gap-0.5 rounded-sm bg-surface-3 pl-1.5 pr-0.5 text-xs text-fg">
          {t}
          <button type="button" disabled={disabled} aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="inline-flex size-4 items-center justify-center rounded-xs text-fg-subtle hover:bg-surface-2 hover:text-fg">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={ref}
        id={id}
        list={listId}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? '' : placeholder}
        className="h-5 min-w-[80px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-fg-subtle"
      />
      {suggestions && listId && (
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
});

/* ---------------------------------------------------------------- CodeEditor */

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  language?: string;
  placeholder?: string;
  minRows?: number;
  maxHeight?: number | string;
  readOnly?: boolean;
  className?: string;
  invalid?: boolean;
  'aria-label'?: string;
}

/** Lightweight code editor: mono textarea with synced line numbers and Tab indentation. */
export function CodeEditor({ value, onChange, id, language, placeholder, minRows = 8, maxHeight = 480, readOnly, className, invalid, ...aria }: CodeEditorProps) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = Math.max(value.split('\n').length, minRows);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !readOnly) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = el;
      const next = `${value.slice(0, s)}  ${value.slice(en)}`;
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };
  return (
    <div
      className={cn('relative flex overflow-hidden rounded-md border border-border bg-surface-2/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-ring', invalid && 'border-danger', className)}
      style={{ maxHeight }}
    >
      <div ref={gutter} aria-hidden className="select-none overflow-hidden border-r border-border bg-surface-2/70 py-2 text-right font-mono text-[11px] leading-5 text-fg-subtle">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="px-2 tabular-nums">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={placeholder}
        aria-label={aria['aria-label']}
        data-language={language}
        rows={minRows}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        className="min-w-0 flex-1 resize-none whitespace-pre bg-transparent px-3 py-2 font-mono text-xs leading-5 text-fg outline-none placeholder:text-fg-subtle"
        style={{ minHeight: `${minRows * 20 + 16}px` }}
      />
      {language && <span className="pointer-events-none absolute right-2 top-1.5 font-mono text-2xs uppercase text-fg-subtle">{language}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ Stepper */

export interface StepItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  status: 'complete' | 'current' | 'upcoming';
  action?: ReactNode;
}

export function Stepper({ steps, orientation = 'vertical', className }: { steps: StepItem[]; orientation?: 'vertical' | 'horizontal'; className?: string }) {
  if (orientation === 'horizontal') {
    return (
      <ol className={cn('flex items-center gap-2', className)}>
        {steps.map((s, i) => (
          <li key={s.id} className="flex min-w-0 items-center gap-2" aria-current={s.status === 'current' ? 'step' : undefined}>
            <StepMarker index={i} status={s.status} />
            <span className={cn('truncate text-sm', s.status === 'upcoming' ? 'text-fg-subtle' : 'text-fg', s.status === 'current' && 'font-medium')}>{s.label}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 shrink-0 bg-border" />}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cn('relative', className)}>
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.status === 'current' ? 'step' : undefined}>
          {i < steps.length - 1 && <span aria-hidden className={cn('absolute left-[9px] top-6 h-[calc(100%-20px)] w-px', s.status === 'complete' ? 'bg-accent/50' : 'bg-border')} />}
          <StepMarker index={i} status={s.status} />
          <div className="min-w-0 flex-1 pt-px">
            <div className={cn('text-sm', s.status === 'upcoming' ? 'text-fg-muted' : 'text-fg', s.status === 'current' && 'font-medium')}>{s.label}</div>
            {s.description && <div className="mt-0.5 text-xs text-fg-muted">{s.description}</div>}
            {s.action && <div className="mt-2">{s.action}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepMarker({ index, status }: { index: number; status: StepItem['status'] }) {
  return (
    <span
      className={cn(
        'relative z-[1] flex size-[19px] shrink-0 items-center justify-center rounded-full border text-2xs font-medium tabular-nums',
        status === 'complete' && 'border-accent bg-accent text-accent-fg',
        status === 'current' && 'border-accent bg-surface text-accent',
        status === 'upcoming' && 'border-border-strong bg-surface text-fg-subtle',
      )}
    >
      {status === 'complete' ? <Check className="size-3" strokeWidth={2.5} /> : index + 1}
    </span>
  );
}

/* ---------------------------------------------------------- DateRangePicker */

export interface DateRange {
  from: string;
  to: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function presetRange(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: iso(from), to: iso(to) };
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: Array<{ label: string; days: number }>;
  className?: string;
}

/** Preset chips + two native date inputs (dates as YYYY-MM-DD). */
export function DateRangePicker({ value, onChange, presets = [{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }], className }: DateRangePickerProps) {
  const activePreset = presets.find((p) => {
    const r = presetRange(p.days);
    return r.from === value.from && r.to === value.to;
  });
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="inline-flex items-center gap-0.5 rounded-md bg-surface-3/70 p-0.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(presetRange(p.days))}
            className={cn('h-6 rounded-sm px-2 text-xs font-medium text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring', activePreset === p && 'bg-surface text-fg shadow-sm')}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 text-sm">
        <input type="date" aria-label="From" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className={cn(fieldBase, 'h-7 w-[132px] px-2 text-xs')} />
        <span className="text-fg-subtle">–</span>
        <input type="date" aria-label="To" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className={cn(fieldBase, 'h-7 w-[132px] px-2 text-xs')} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Chips */

export function ChoiceChips<T extends string>({ options, value, onChange, multiple, className }: { options: Array<{ value: T; label: ReactNode; description?: ReactNode }>; value: T | T[] | null; onChange: (v: T | T[]) => void; multiple?: boolean; className?: string }) {
  const sel = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role={multiple ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const on = sel.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => (multiple ? onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value]) : onChange(o.value))}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
            )}
            title={typeof o.description === 'string' ? o.description : undefined}
          >
            {on && <Check className="size-3.5" strokeWidth={2} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
