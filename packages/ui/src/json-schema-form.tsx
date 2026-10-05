'use client';
import { useId, type ReactNode } from 'react';
import { ChoiceChips, SecretInput, TagInput } from './fields';
import { Field, Input, Textarea } from './input';
import { Select } from './select';
import { Switch } from './controls';
import { cn } from './utils';

/** Minimal JSON Schema subset produced by provider drivers. */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number>;
  enumNames?: string[];
  oneOf?: Array<{ const: string | number; title?: string }>;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchema;
  examples?: unknown[];
  /** UI hints */
  'x-multiline'?: boolean;
  'x-placeholder'?: string;
  'x-order'?: number;
  'x-group'?: string;
  'x-hidden'?: boolean;
  readOnly?: boolean;
  [k: string]: unknown;
}

export interface JsonSchemaPreset {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

export interface JsonSchemaFormProps {
  schema: JsonSchema | Record<string, unknown>;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  /**
   * Secret mode: every string field renders a SecretInput. `value` holds only
   * newly typed secrets (omitted keys keep stored values); `masked` holds the
   * server's masked values.
   */
  secret?: boolean;
  masked?: Record<string, string>;
  errors?: Record<string, string>;
  presets?: JsonSchemaPreset[];
  onPresetApply?: (preset: JsonSchemaPreset) => void;
  disabled?: boolean;
  className?: string;
  /** Use inline label/control rows. */
  inline?: boolean;
}

function typeOf(s: JsonSchema): string {
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type;
  if (t) return t;
  if (s.enum || s.oneOf) return 'string';
  if (s.properties) return 'object';
  return 'string';
}

function humanize(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Render a form from a JSON Schema object (provider config / secrets). */
export function JsonSchemaForm({ schema, value, onChange, secret, masked = {}, errors = {}, presets, onPresetApply, disabled, className, inline }: JsonSchemaFormProps) {
  const s = schema as JsonSchema;
  const idBase = useId();
  const props = Object.entries(s.properties ?? {})
    .filter(([, p]) => !p['x-hidden'])
    .sort(([, a], [, b]) => (a['x-order'] ?? 0) - (b['x-order'] ?? 0));
  const required = new Set(s.required ?? []);

  return (
    <div className={cn(inline ? 'divide-y divide-border' : 'flex flex-col gap-4', className)}>
      {presets && presets.length > 0 && onPresetApply && (
        <Field label="Preset" help="Prefills common settings for well-known providers." inline={inline}>
          <Select
            placeholder="Choose a preset…"
            options={presets.map((p) => ({ value: p.id, label: p.name }))}
            onValueChange={(id) => {
              const p = presets.find((x) => x.id === id);
              if (p) onPresetApply(p);
            }}
            disabled={disabled}
          />
        </Field>
      )}
      {props.length === 0 && <p className="text-sm text-fg-muted">{secret ? 'This driver needs no secrets.' : 'No configuration needed.'}</p>}
      {props.map(([key, p]) => (
        <SchemaField
          key={key}
          id={`${idBase}-${key}`}
          name={key}
          schema={p}
          required={required.has(key)}
          value={value[key]}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) delete next[key];
            else next[key] = v;
            onChange(next);
          }}
          secret={secret}
          masked={masked[key]}
          error={errors[key]}
          disabled={disabled || p.readOnly}
          inline={inline}
        />
      ))}
    </div>
  );
}

interface SchemaFieldProps {
  id: string;
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
  secret?: boolean;
  masked?: string;
  error?: string;
  disabled?: boolean;
  inline?: boolean;
}

function SchemaField({ id, name, schema, required, value, onChange, secret, masked, error, disabled, inline }: SchemaFieldProps) {
  const label = schema.title ?? humanize(name);
  const help = schema.description;
  const t = typeOf(schema);
  const placeholder = schema['x-placeholder'] ?? (schema.default !== undefined && typeof schema.default !== 'object' ? String(schema.default) : schema.examples?.[0] !== undefined ? String(schema.examples[0]) : undefined);
  const wrap = (control: ReactNode) => (
    <Field label={label} help={help} error={error} required={required} htmlFor={id} inline={inline}>
      {control}
    </Field>
  );

  if (secret && t === 'string') {
    return wrap(<SecretInput id={id} maskedValue={masked} value={value as string | undefined} onChange={onChange} placeholder={placeholder ?? 'Enter value'} invalid={!!error} disabled={disabled} multiline={schema['x-multiline'] === true} />);
  }

  if (t === 'boolean') {
    return (
      <div className={cn(inline && 'py-3')}>
        <Switch id={id} label={label} description={help} checked={value === undefined ? schema.default === true : value === true} onCheckedChange={(v) => onChange(v)} disabled={disabled} />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (t === 'object' && schema.properties) {
    return (
      <fieldset className={cn('rounded-md border border-border p-3', inline && 'my-3')}>
        <legend className="px-1 text-xs font-medium text-fg-muted">{label}</legend>
        <JsonSchemaForm schema={schema} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} disabled={disabled} />
      </fieldset>
    );
  }

  const enumValues = schema.enum ?? schema.oneOf?.map((o) => o.const);
  if (enumValues && t !== 'array') {
    const labels = schema.enumNames ?? schema.oneOf?.map((o) => o.title ?? String(o.const));
    return wrap(
      <Select
        id={id}
        value={value === undefined || value === null ? (schema.default !== undefined ? String(schema.default) : undefined) : String(value)}
        onValueChange={(v) => onChange(t === 'number' || t === 'integer' ? Number(v) : v)}
        options={enumValues.map((v, i) => ({ value: String(v), label: labels?.[i] ?? String(v) }))}
        invalid={!!error}
        disabled={disabled}
      />,
    );
  }

  if (t === 'array') {
    const itemEnum = schema.items?.enum;
    if (itemEnum) {
      return wrap(<ChoiceChips multiple options={itemEnum.map((v) => ({ value: String(v), label: String(v) }))} value={((value as string[]) ?? []).map(String)} onChange={(v) => onChange(v)} />);
    }
    return wrap(<TagInput id={id} value={((value as unknown[]) ?? []).map(String)} onChange={onChange} placeholder={placeholder ?? 'Type and press Enter'} disabled={disabled} />);
  }

  if (t === 'number' || t === 'integer') {
    return wrap(
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={schema.minimum}
        max={schema.maximum}
        step={t === 'integer' ? 1 : 'any'}
        value={value === undefined || value === null ? '' : String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : t === 'integer' ? parseInt(e.target.value, 10) : Number(e.target.value))}
        invalid={!!error}
        disabled={disabled}
      />,
    );
  }

  if (schema['x-multiline'] || schema.format === 'textarea' || (schema.maxLength ?? 0) > 500) {
    return wrap(<Textarea id={id} value={(value as string) ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value || undefined)} invalid={!!error} disabled={disabled} mono={schema.format === 'code'} />);
  }

  const inputType = schema.format === 'email' ? 'email' : schema.format === 'uri' || schema.format === 'url' ? 'url' : schema.format === 'password' ? 'password' : 'text';
  return wrap(
    <Input
      id={id}
      type={inputType}
      value={(value as string) ?? ''}
      placeholder={placeholder}
      minLength={schema.minLength}
      maxLength={schema.maxLength}
      pattern={schema.pattern}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      invalid={!!error}
      disabled={disabled}
    />,
  );
}

/** Client-side required-field check for a schema; returns `{ key: message }`. */
export function validateAgainstSchema(schema: JsonSchema | Record<string, unknown>, value: Record<string, unknown>, opts: { masked?: Record<string, string> } = {}): Record<string, string> {
  const s = schema as JsonSchema;
  const errs: Record<string, string> = {};
  for (const key of s.required ?? []) {
    const v = value[key];
    const hasStored = opts.masked && opts.masked[key];
    if ((v === undefined || v === null || v === '') && !hasStored) errs[key] = `${s.properties?.[key]?.title ?? humanize(key)} is required`;
  }
  return errs;
}

/** Apply schema defaults to a config object (missing keys only). */
export function applySchemaDefaults(schema: JsonSchema | Record<string, unknown>, value: Record<string, unknown> = {}): Record<string, unknown> {
  const s = schema as JsonSchema;
  const out = { ...value };
  for (const [k, p] of Object.entries(s.properties ?? {})) if (out[k] === undefined && p.default !== undefined) out[k] = p.default;
  return out;
}
