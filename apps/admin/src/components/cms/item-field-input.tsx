'use client';

import type { CollectionField } from '@atrium/schema';
import type { Collection } from '@atrium/sdk';
import { Button, CodeEditor, ColorInput, Combobox, IconButton, Input, Select, Switch, Textarea } from '@atrium/ui';
import { MapPin, Palette, X } from 'lucide-react';
import { useState } from 'react';
import { RichTextEditor } from '@/components/common/rich-text';
import { MediaField } from '@/components/media/media-field';
import { GalleryInput } from './gallery-input';
import { RelationInput } from './relation-input';
import { fromDatetimeLocal, mediaToRef, readLocation, readMediaRef, toDateInput, toDatetimeLocal, type LocationValue } from './values';

export interface FieldInputContext {
  organizationId: string;
  websiteId: string;
  collections: Collection[];
  disabled?: boolean;
  onJsonError: (key: string, error: string | undefined) => void;
  /** Mark a slug field as manually edited (stops auto-generation). */
  onSlugTouched: (key: string) => void;
}

export interface ItemFieldInputProps {
  field: CollectionField;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid?: boolean;
  id?: string;
  ctx: FieldInputContext;
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Renders the right control for a collection field type. */
export function ItemFieldInput({ field, value, onChange, invalid, id, ctx }: ItemFieldInputProps) {
  const { disabled } = ctx;
  switch (field.type) {
    case 'text':
      return <Input id={id} invalid={invalid} disabled={disabled} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <Input id={id} type="email" autoComplete="off" invalid={invalid} disabled={disabled} value={str(value)} onChange={(e) => onChange(e.target.value.trim())} placeholder="name@example.com" />;
    case 'url':
      return <Input id={id} type="url" invalid={invalid} disabled={disabled} value={str(value)} onChange={(e) => onChange(e.target.value.trim())} placeholder="https://" />;
    case 'slug':
      return (
        <Input
          id={id}
          className="font-mono text-xs"
          invalid={invalid}
          disabled={disabled}
          value={str(value)}
          onChange={(e) => {
            ctx.onSlugTouched(field.key);
            onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
          }}
          onBlur={(e) => onChange(e.target.value.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, ''))}
        />
      );
    case 'textarea':
      return <Textarea id={id} rows={4} invalid={invalid} disabled={disabled} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'richtext':
      return <RichTextEditor id={id} value={str(value)} onChange={onChange} disabled={disabled} minHeight={160} />;
    case 'number':
      return <NumberInput id={id} value={value} onChange={onChange} invalid={invalid} disabled={disabled} />;
    case 'boolean':
      return <Switch id={id} checked={value === true} disabled={disabled} onCheckedChange={(v) => onChange(v)} aria-label={field.label} />;
    case 'date':
      return <Input id={id} type="date" invalid={invalid} disabled={disabled} value={toDateInput(value)} onChange={(e) => onChange(e.target.value || null)} className="w-48" />;
    case 'datetime':
      return <Input id={id} type="datetime-local" invalid={invalid} disabled={disabled} value={toDatetimeLocal(value)} onChange={(e) => onChange(fromDatetimeLocal(e.target.value))} className="w-60" />;
    case 'image':
    case 'video':
    case 'media': {
      const ref = readMediaRef(value);
      return (
        <MediaField
          id={id}
          value={ref?.src}
          disabled={disabled}
          organizationId={ctx.organizationId}
          websiteId={ctx.websiteId}
          kind={field.type === 'media' ? 'any' : field.type}
          placeholder={field.type === 'image' ? 'Choose image' : field.type === 'video' ? 'Choose video' : 'Choose file'}
          onChange={(_url, media) => onChange(media ? mediaToRef(media) : null)}
        />
      );
    }
    case 'gallery':
      return <GalleryInput id={id} value={value} onChange={onChange} organizationId={ctx.organizationId} websiteId={ctx.websiteId} disabled={disabled} />;
    case 'relation':
    case 'multirelation':
      return <RelationInput id={id} field={field} value={value} onChange={onChange} collections={ctx.collections} invalid={invalid} disabled={disabled} />;
    case 'select': {
      const options = (field.options ?? []).filter((o) => o.value);
      const v = typeof value === 'string' && value ? value : undefined;
      if (options.length > 8) return <Combobox id={id} options={options} value={v ?? null} clearable invalid={invalid} disabled={disabled} onChange={(x) => onChange(x)} />;
      return (
        <div className="flex items-center gap-2">
          <Select id={id} value={v ?? '__none__'} invalid={invalid} disabled={disabled} onValueChange={(x) => onChange(x === '__none__' ? null : x)} options={[{ value: '__none__', label: <span className="text-fg-subtle">None</span> }, ...options]} className="w-full max-w-xs" />
        </div>
      );
    }
    case 'multiselect': {
      const v = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
      return <Combobox id={id} multiple options={(field.options ?? []).filter((o) => o.value)} value={v} invalid={invalid} disabled={disabled} onChange={(x) => onChange(x.length ? x : null)} placeholder="Choose options" />;
    }
    case 'color':
      return str(value) ? (
        <div className="flex items-start gap-1">
          <ColorInput id={id} value={str(value)} disabled={disabled} onChange={(x) => onChange(x || null)} className="w-[200px]" />
          <IconButton label="Clear color" size="sm" disabled={disabled} onClick={() => onChange(null)}>
            <X />
          </IconButton>
        </div>
      ) : (
        <Button id={id} size="sm" leadingIcon={<Palette />} disabled={disabled} onClick={() => onChange('#000000')}>
          Choose color
        </Button>
      );
    case 'location':
      return <LocationInput id={id} value={value} onChange={onChange} invalid={invalid} disabled={disabled} />;
    case 'json':
      return <JsonInput id={id} value={value} onChange={onChange} invalid={invalid} disabled={disabled} onError={(e) => ctx.onJsonError(field.key, e)} />;
    default:
      return <Input id={id} disabled={disabled} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function NumberInput({ id, value, onChange, invalid, disabled }: { id?: string; value: unknown; onChange: (v: unknown) => void; invalid?: boolean; disabled?: boolean }) {
  const [text, setText] = useState(() => (typeof value === 'number' ? String(value) : str(value)));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // External change (reset/discard): resync unless it matches what we typed.
    setSeen(value);
    if (!(typeof value === 'number' && Number(text) === value)) setText(typeof value === 'number' ? String(value) : str(value));
  }
  return (
    <Input
      id={id}
      inputMode="decimal"
      invalid={invalid}
      disabled={disabled}
      className="w-48 tabular-nums"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') onChange(null);
        else {
          const n = Number(t.replace(',', '.'));
          onChange(Number.isFinite(n) ? n : t);
        }
      }}
    />
  );
}

function LocationInput({ id, value, onChange, invalid, disabled }: { id?: string; value: unknown; onChange: (v: unknown) => void; invalid?: boolean; disabled?: boolean }) {
  const loc = readLocation(value);
  const set = (patch: Partial<LocationValue>) => {
    const next: LocationValue = { ...loc, ...patch };
    const clean: LocationValue = {};
    if (next.address?.trim()) clean.address = next.address;
    if (typeof next.lat === 'number' && Number.isFinite(next.lat)) clean.lat = next.lat;
    if (typeof next.lng === 'number' && Number.isFinite(next.lng)) clean.lng = next.lng;
    onChange(Object.keys(clean).length ? clean : null);
  };
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  return (
    <div className="space-y-2" id={id}>
      <Input prefix={<MapPin />} placeholder="Address" aria-label="Address" invalid={invalid} disabled={disabled} value={loc.address ?? ''} onChange={(e) => set({ address: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" step="any" min={-90} max={90} prefix={<span className="text-2xs font-medium">LAT</span>} placeholder="0.0000" aria-label="Latitude" invalid={invalid} disabled={disabled} className="tabular-nums" value={loc.lat ?? ''} onChange={(e) => set({ lat: num(e.target.value) })} />
        <Input type="number" step="any" min={-180} max={180} prefix={<span className="text-2xs font-medium">LNG</span>} placeholder="0.0000" aria-label="Longitude" invalid={invalid} disabled={disabled} className="tabular-nums" value={loc.lng ?? ''} onChange={(e) => set({ lng: num(e.target.value) })} />
      </div>
    </div>
  );
}

function JsonInput({ id, value, onChange, onError, invalid, disabled }: { id?: string; value: unknown; onChange: (v: unknown) => void; onError: (e: string | undefined) => void; invalid?: boolean; disabled?: boolean }) {
  const [text, setText] = useState(() => (value === undefined || value === null ? '' : JSON.stringify(value, null, 2)));
  return (
    <CodeEditor
      id={id}
      language="json"
      minRows={6}
      readOnly={disabled}
      invalid={invalid}
      value={text}
      placeholder="{ }"
      onChange={(t) => {
        setText(t);
        if (!t.trim()) {
          onError(undefined);
          onChange(null);
          return;
        }
        try {
          onChange(JSON.parse(t));
          onError(undefined);
        } catch (err) {
          onError(`Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
        }
      }}
    />
  );
}
