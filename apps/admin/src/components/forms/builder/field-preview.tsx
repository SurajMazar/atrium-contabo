'use client';

import type { FormField } from '@atrium/schema';
import { Checkbox, cn, Combobox, Input, NativeSelect, Textarea } from '@atrium/ui';
import { EyeOff, Paperclip, Puzzle, Star } from 'lucide-react';
import { useId } from 'react';

export interface FieldPreviewProps {
  field: FormField;
  /** Live, editable controls (preview mode). Otherwise rendered inert. */
  interactive?: boolean;
  value?: unknown;
  onChange?: (v: unknown) => void;
  error?: string;
}

/** Renders a form field the way a visitor would see it. */
export function FieldPreview({ field, interactive, value, onChange, error }: FieldPreviewProps) {
  const id = useId();
  const set = (v: unknown) => onChange?.(v);

  if (field.type === 'heading') {
    return (
      <div className="pt-1">
        <h3 className="text-base font-semibold text-fg">{field.label || 'Heading'}</h3>
        {field.helpText && <p className="mt-0.5 text-sm text-fg-muted">{field.helpText}</p>}
      </div>
    );
  }
  if (field.type === 'paragraph') {
    return <p className="whitespace-pre-wrap text-sm text-fg-muted">{field.helpText || field.label}</p>;
  }
  if (field.type === 'hidden') {
    if (interactive) return null;
    return (
      <div className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border px-2.5 text-xs text-fg-muted">
        <EyeOff className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">
          Hidden · <span className="font-mono">{field.name}</span>
          {field.defaultValue !== undefined && field.defaultValue !== '' && (
            <>
              {' '}
              = <span className="font-mono">{String(field.defaultValue)}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  const label = (
    <div className="mb-1.5 flex items-baseline gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {field.label || <span className="text-fg-subtle">Untitled field</span>}
      </label>
      {field.required && (
        <span className="text-danger" aria-hidden>
          *
        </span>
      )}
    </div>
  );

  const help = error ? <p className="mt-1 text-xs text-danger">{error}</p> : field.helpText ? <p className="mt-1 text-xs text-fg-muted">{field.helpText}</p> : null;
  const control = renderControl();

  if (field.type === 'consent') {
    return (
      <div>
        <div inert={!interactive || undefined}>{control}</div>
        {help}
      </div>
    );
  }

  return (
    <div>
      {label}
      <div inert={!interactive || undefined}>{control}</div>
      {help}
    </div>
  );

  function renderControl() {
    const str = value === undefined || value === null ? '' : String(value);
    const arr = Array.isArray(value) ? value.map(String) : [];
    const opts = field.options ?? [];
    const invalid = !!error;
    const common = { id, invalid, placeholder: field.placeholder, 'aria-required': field.required || undefined } as const;
    switch (field.type) {
      case 'textarea':
        return <Textarea {...common} rows={4} value={str} onChange={(e) => set(e.target.value)} />;
      case 'number':
        return <Input {...common} type="number" min={field.validation?.min} max={field.validation?.max} value={str} onChange={(e) => set(e.target.value)} />;
      case 'email':
        return <Input {...common} type="email" value={str} onChange={(e) => set(e.target.value)} />;
      case 'phone':
        return <Input {...common} type="tel" value={str} onChange={(e) => set(e.target.value)} />;
      case 'url':
        return <Input {...common} type="url" value={str} onChange={(e) => set(e.target.value)} />;
      case 'date':
        return <Input {...common} type="date" value={str} onChange={(e) => set(e.target.value)} />;
      case 'time':
        return <Input {...common} type="time" value={str} onChange={(e) => set(e.target.value)} />;
      case 'datetime':
        return <Input {...common} type="datetime-local" value={str} onChange={(e) => set(e.target.value)} />;
      case 'select':
        return (
          <NativeSelect id={id} invalid={invalid} value={str} onChange={(e) => set(e.target.value)} className={cn(!str && 'text-fg-subtle')}>
            <option value="">{field.placeholder || 'Select…'}</option>
            {opts.map((o, i) => (
              <option key={`${o.value}-${i}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        );
      case 'multiselect':
        return (
          <Combobox
            multiple
            id={id}
            invalid={invalid}
            value={arr}
            onChange={(v) => set(v)}
            placeholder={field.placeholder || 'Select…'}
            options={opts.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label }))}
          />
        );
      case 'radio':
        return (
          <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-1.5">
            {opts.map((o, i) => (
              <label key={`${o.value}-${i}`} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input type="radio" name={id} value={o.value} checked={str === o.value} onChange={() => set(o.value)} className="size-4 accent-accent" />
                {o.label}
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        if (!opts.length) return <Checkbox label={field.placeholder || field.label} checked={value === true} onCheckedChange={(v) => set(v === true)} />;
        return (
          <div className="flex flex-col gap-1.5">
            {opts.map((o, i) => (
              <Checkbox
                key={`${o.value}-${i}`}
                label={o.label}
                checked={arr.includes(o.value)}
                onCheckedChange={(v) => set(v === true ? [...arr, o.value] : arr.filter((x) => x !== o.value))}
              />
            ))}
          </div>
        );
      case 'consent':
        return (
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(v) => set(v === true)}
            label={
              <>
                {field.label}
                {field.required && <span className="ml-0.5 text-danger">*</span>}
              </>
            }
          />
        );
      case 'rating': {
        const max = Math.min(10, Math.max(1, field.validation?.max ?? 5));
        const n = Number(value) || 0;
        return (
          <div className="flex items-center gap-0.5" role="radiogroup" aria-label={field.label}>
            {Array.from({ length: max }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={n === i + 1}
                aria-label={`${i + 1} of ${max}`}
                onClick={() => set(i + 1)}
                className="rounded-sm p-0.5 text-fg-subtle outline-none hover:text-warning focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star className={cn('size-5', i < n && 'fill-warning text-warning')} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        );
      }
      case 'file': {
        const v = field.validation ?? {};
        const hints = [v.accept?.length ? v.accept.join(', ') : null, v.maxFileSizeMb ? `up to ${v.maxFileSizeMb} MB` : null, v.maxFiles && v.maxFiles > 1 ? `${v.maxFiles} files max` : null].filter(Boolean);
        return (
          <label htmlFor={id} className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-4 py-5 text-center', invalid && 'border-danger')}>
            <Paperclip className="size-4 text-fg-subtle" strokeWidth={1.5} />
            <span className="text-sm text-fg">
              Drop files or <span className="text-accent">browse</span>
            </span>
            {hints.length > 0 && <span className="text-xs text-fg-subtle">{hints.join(' · ')}</span>}
            {Array.isArray(value) && value.length > 0 && <span className="text-xs text-fg-muted">{value.length} selected</span>}
            <input
              id={id}
              type="file"
              className="sr-only"
              multiple={(v.maxFiles ?? 1) > 1}
              accept={v.accept?.join(',')}
              onChange={(e) => set(Array.from(e.target.files ?? []).map((f) => f.name))}
            />
          </label>
        );
      }
      case 'custom':
        return (
          <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-border px-3 text-xs text-fg-muted">
            <Puzzle className="size-3.5" strokeWidth={1.5} />
            Custom renderer{field.component ? <span className="font-mono">{field.component}</span> : ' (not set)'}
          </div>
        );
      default:
        return <Input {...common} value={str} onChange={(e) => set(e.target.value)} />;
    }
  }
}
