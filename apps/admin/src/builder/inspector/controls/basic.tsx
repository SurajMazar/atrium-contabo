'use client';

import type { RewriteMode } from '@atrium/sdk';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { REWRITE_MODES, rewriteText } from '../../ai/actions';
import { usePerms } from '../../store/editor';
import { useDocumentStore } from '../../store/document';
import { CommitInput, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, NativeSelect, NumberInput, RangeSlider, Segmented, Switch, TextArea } from '../../ui/primitives';
import type { ControlProps } from './types';

const NO_LOCALES: string[] = [];

/** AI rewrite actions for text props (rewrite, shorten, … translate). */
export function RewriteMenu({ value, onResult, disabled }: { value: string; onResult: (v: string) => void; disabled?: boolean }) {
  const perms = usePerms();
  const [busy, setBusy] = useState(false);
  const locales = useDocumentStore((s) => s.definition?.settings.localization.locales ?? NO_LOCALES);
  if (!perms.ai || disabled) return null;
  const run = async (mode: RewriteMode, locale?: string) => {
    setBusy(true);
    const out = await rewriteText(value, mode, locale);
    setBusy(false);
    if (out) onResult(out);
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" title="Rewrite with AI" disabled={!value.trim() || busy} className="flex size-5 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 hover:text-accent disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Rewrite with AI</MenuLabel>
        {REWRITE_MODES.filter((m) => m.mode !== 'translate').map((m) => (
          <MenuItem key={m.mode} onSelect={() => run(m.mode)}>
            {m.label}
          </MenuItem>
        ))}
        {(locales.length > 1 ? locales : ['en', 'fr', 'de', 'es', 'it']).map((l) => (
          <MenuItem key={l} onSelect={() => run('translate', l)}>
            Translate to {l.toUpperCase()}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function TextControl({ value, onChange, control, disabled, id }: ControlProps<string | undefined>) {
  return <CommitInput id={id} value={value ?? ''} placeholder={control.placeholder} disabled={disabled} onCommit={(v) => onChange(v === '' ? undefined : v)} />;
}

export function TextareaControl({ value, onChange, control, disabled }: ControlProps<string | undefined>) {
  return <CommitInput multiline rows={3} value={value ?? ''} placeholder={control.placeholder} disabled={disabled} onCommit={(v) => onChange(v === '' ? undefined : v)} />;
}

export function NumberControl({ value, onChange, control, disabled }: ControlProps<number | undefined>) {
  return <NumberInput value={typeof value === 'number' ? value : undefined} onCommit={(v) => onChange(v)} min={control.min} max={control.max} step={control.step} unit={control.unit} disabled={disabled} />;
}

export function SliderControl({ value, onChange, control, disabled, node }: ControlProps<number | undefined>) {
  const min = control.min ?? 0;
  const max = control.max ?? 100;
  const step = control.step ?? 1;
  const v = typeof value === 'number' ? value : min;
  const mergeKey = `slider:${node?.id}:${control.name}`;
  return (
    <div className="flex items-center gap-2">
      <RangeSlider value={v} min={min} max={max} step={step} disabled={disabled} onChange={(n) => onChange(n, { mergeKey })} />
      <NumberInput className="w-14 shrink-0" value={typeof value === 'number' ? value : undefined} min={min} max={max} step={step} disabled={disabled} onCommit={(n) => onChange(n)} />
    </div>
  );
}

const optionKey = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

export function SelectControl({ value, onChange, control, disabled }: ControlProps<unknown>) {
  const options = control.options ?? [];
  return (
    <NativeSelect
      value={value === undefined ? '' : optionKey(value)}
      disabled={disabled}
      placeholder={options.some((o) => optionKey(o.value) === optionKey(value)) ? undefined : 'Default'}
      options={options.map((o) => ({ label: o.label, value: optionKey(o.value) }))}
      onChange={(k) => onChange(options.find((o) => optionKey(o.value) === k)?.value)}
    />
  );
}

export function SegmentedControl({ value, onChange, control, disabled }: ControlProps<unknown>) {
  const options = control.options ?? [];
  if (options.length > 5 && !options.every((o) => String(o.label).length <= 3)) return <SelectControl value={value} onChange={onChange} control={control} disabled={disabled} id="" />;
  return (
    <Segmented
      value={optionKey(value)}
      disabled={disabled}
      onChange={(k) => onChange(options.find((o) => optionKey(o.value) === k)?.value)}
      options={options.map((o) => ({ label: o.label, value: optionKey(o.value), icon: o.icon, title: o.label }))}
    />
  );
}

export function ToggleControl({ value, onChange, disabled, control }: ControlProps<boolean | undefined>) {
  return (
    <div className="flex h-7 items-center justify-end">
      <Switch checked={!!value} onChange={(v) => onChange(v)} disabled={disabled} label={control.label} />
    </div>
  );
}

export function CodeControl({ value, onChange, disabled, control }: ControlProps<string | undefined>) {
  const perms = usePerms();
  const locked = disabled || !perms.code;
  return (
    <div className="space-y-1">
      <CommitInput multiline mono rows={6} value={value ?? ''} placeholder={control.placeholder} disabled={locked} onCommit={(v) => onChange(v === '' ? undefined : v)} />
      {!perms.code && <p className="text-[11px] text-fg-subtle">Requires the “Add custom code” permission.</p>}
    </div>
  );
}

export function DateControl({ value, onChange, disabled }: ControlProps<string | undefined>) {
  const isDateTime = typeof value === 'string' && value.includes('T');
  const local = typeof value === 'string' ? (isDateTime ? value.slice(0, 16) : value.slice(0, 10)) : '';
  return (
    <input
      type={isDateTime ? 'datetime-local' : 'date'}
      value={local}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? (isDateTime ? new Date(e.target.value).toISOString() : e.target.value) : undefined)}
      className="h-7 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-fg outline-none focus:border-accent"
    />
  );
}

export { TextArea };
