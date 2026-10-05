'use client';

import { FORM_FIELD_TYPES, type FormField, type FormFieldType } from '@atrium/schema';
import { Button, cn, Combobox, EmptyState, Field, IconButton, Input, SegmentedControl, Select, Switch, TagInput, Textarea, Tooltip } from '@atrium/ui';
import { Copy, MousePointerClick, Trash2, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { ConditionGroupEditor, type ConditionFieldOption } from '../condition-group-editor';
import {
  CHOICE_TYPES,
  FIELD_NAME_RE,
  FIELD_TYPE_META,
  isInputField,
  LAYOUT_TYPES,
  NUMERIC_TYPES,
  PATTERN_TYPES,
  TEXT_LENGTH_TYPES,
  toCamelCase,
  uniqueName,
} from '../form-model';
import { useFormEditor } from './editor-context';
import { OptionsEditor } from './options-editor';

type Validation = NonNullable<FormField['validation']>;

export function conditionFieldsFor(fields: FormField[], excludeId?: string): ConditionFieldOption[] {
  return fields
    .filter((f) => f.id !== excludeId && isInputField(f))
    .map((f) => ({ value: f.name, label: f.label || f.name, type: f.type, options: f.options }));
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="mb-3 flex min-h-5 items-center justify-between gap-2">
        <h4 className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{title}</h4>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function NumberInput({ value, onChange, min, max, step, placeholder, id, invalid }: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string; id?: string; invalid?: boolean }) {
  return (
    <Input
      id={id}
      size="sm"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      invalid={invalid}
      placeholder={placeholder}
      value={value === undefined || Number.isNaN(value) ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' ? undefined : Number(raw));
      }}
    />
  );
}

export function FieldSettingsPanel({ onDuplicate, onDelete }: { onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const { draft, selectedId, setSelectedId, updateField, readOnly } = useFormEditor();
  const field = draft.fields.find((f) => f.id === selectedId);

  if (!field) return <FieldOutline />;

  const meta = FIELD_TYPE_META[field.type];
  const Icon = meta.icon;
  const others = draft.fields.filter((f) => f.id !== field.id);
  const otherNames = others.map((f) => f.name);
  const patch = (p: Partial<FormField>) => updateField(field.id, p);
  const v = field.validation ?? {};
  const setValidation = (p: Partial<Validation>) => {
    const next: Record<string, unknown> = { ...v, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined || (Array.isArray(next[k]) && (next[k] as unknown[]).length === 0)) delete next[k];
    patch({ validation: Object.keys(next).length ? (next as Validation) : undefined });
  };

  const nameError = !FIELD_NAME_RE.test(field.name)
    ? 'Start with a letter; use letters, numbers and underscores'
    : otherNames.includes(field.name)
      ? 'Another field already uses this name'
      : undefined;

  const onLabel = (label: string) => {
    const wasAuto = field.name === uniqueName(toCamelCase(field.label), otherNames) || field.name === toCamelCase(field.label);
    if (wasAuto && isInputField(field)) patch({ label, name: uniqueName(toCamelCase(label), otherNames) });
    else patch({ label });
  };

  const changeType = (type: FormFieldType) => {
    const p: Partial<FormField> = { type };
    if (CHOICE_TYPES.has(type) && !field.options?.length) p.options = [{ label: 'Option 1', value: 'option-1' }, { label: 'Option 2', value: 'option-2' }];
    if (!CHOICE_TYPES.has(type)) p.options = undefined;
    p.defaultValue = undefined;
    if (type === 'rating') p.validation = { min: 1, max: 5 };
    patch(p);
  };

  const isLayout = LAYOUT_TYPES.has(field.type);
  const hasPlaceholder = ['text', 'email', 'phone', 'number', 'textarea', 'url', 'select', 'multiselect'].includes(field.type) || (field.type === 'checkbox' && !field.options?.length);
  const hasDefault = !isLayout && !['file', 'custom', 'consent'].includes(field.type);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-border bg-surface pl-4 pr-2">
        <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{meta.label}</span>
        {!readOnly && (
          <>
            <Tooltip content="Duplicate">
              <IconButton label="Duplicate field" size="xs" onClick={() => onDuplicate(field.id)}>
                <Copy />
              </IconButton>
            </Tooltip>
            <Tooltip content="Delete">
              <IconButton label="Delete field" size="xs" className="hover:text-danger" onClick={() => onDelete(field.id)}>
                <Trash2 />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip content="Close" shortcut="Esc">
          <IconButton label="Deselect field" size="xs" onClick={() => setSelectedId(null)}>
            <X />
          </IconButton>
        </Tooltip>
      </div>

      <fieldset disabled={readOnly} className="min-w-0">
        <Section title="General">
          <Field label="Type">
            <Select
              size="sm"
              value={field.type}
              onValueChange={(t) => changeType(t as FormFieldType)}
              options={FORM_FIELD_TYPES.filter((t) => LAYOUT_TYPES.has(t) === isLayout).map((t) => ({ value: t, label: FIELD_TYPE_META[t].label }))}
            />
          </Field>
          <Field label={field.type === 'heading' ? 'Heading text' : field.type === 'paragraph' ? 'Internal label' : field.type === 'consent' ? 'Consent statement' : 'Label'}>
            <Input size="sm" value={field.label} maxLength={200} onChange={(e) => onLabel(e.target.value)} />
          </Field>
          {field.type === 'paragraph' && (
            <Field label="Text">
              <Textarea rows={4} value={field.helpText ?? ''} maxLength={500} onChange={(e) => patch({ helpText: e.target.value || undefined })} />
            </Field>
          )}
          {!isLayout && (
            <Field label="Name" error={nameError} help={!nameError ? <>Key in submissions and <span className="font-mono">{`{{${field.name}}}`}</span> in workflows</> : undefined}>
              <Input size="sm" className="font-mono text-xs" value={field.name} spellCheck={false} autoComplete="off" onChange={(e) => patch({ name: e.target.value.replace(/\s+/g, '') })} />
            </Field>
          )}
          {hasPlaceholder && (
            <Field label="Placeholder" optional>
              <Input size="sm" value={field.placeholder ?? ''} maxLength={200} onChange={(e) => patch({ placeholder: e.target.value || undefined })} />
            </Field>
          )}
          {field.type !== 'paragraph' && field.type !== 'hidden' && (
            <Field label={field.type === 'heading' ? 'Subtitle' : 'Help text'} optional>
              <Textarea rows={2} value={field.helpText ?? ''} maxLength={500} onChange={(e) => patch({ helpText: e.target.value || undefined })} />
            </Field>
          )}
          {field.type === 'custom' && (
            <Field label="Component key" help="Renderer key registered in the site’s custom field registry">
              <Input size="sm" className="font-mono text-xs" value={field.component ?? ''} onChange={(e) => patch({ component: e.target.value || undefined })} />
            </Field>
          )}
          {!isLayout && field.type !== 'hidden' && <Switch label="Required" checked={field.required} onCheckedChange={(required) => patch({ required })} />}
          {hasDefault && (
            <Field label={field.type === 'hidden' ? 'Value' : 'Default value'} optional={field.type !== 'hidden'} help={field.type === 'hidden' ? 'Submitted with every response; never shown to visitors' : undefined}>
              <DefaultValueInput field={field} onChange={(defaultValue) => patch({ defaultValue })} />
            </Field>
          )}
        </Section>

        {CHOICE_TYPES.has(field.type) && (
          <Section title="Options">
            <OptionsEditor options={field.options ?? []} onChange={(options) => patch({ options })} disabled={readOnly} />
          </Section>
        )}

        <ValidationSection field={field} v={v} setValidation={setValidation} />

        {field.type !== 'hidden' && (
          <Section title="Layout">
            <Field label="Width" help={draft.settings.layout === 'stacked' ? 'Ignored while the form layout is stacked' : undefined}>
              <SegmentedControl
                size="sm"
                fullWidth
                aria-label="Field width"
                value={field.width ?? 'full'}
                onValueChange={(width) => patch({ width })}
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'half', label: 'Half' },
                  { value: 'third', label: 'Third' },
                ]}
              />
            </Field>
          </Section>
        )}

        {field.type !== 'hidden' && (
          <Section title="Visibility">
            <ConditionGroupEditor
              value={field.showIf}
              onChange={(showIf) => patch({ showIf })}
              fields={conditionFieldsFor(draft.fields, field.id)}
              emptyLabel="Always visible"
              disabled={readOnly}
            />
            {field.showIf && <p className="text-xs text-fg-muted">Hidden fields are skipped during validation. Use Preview to test the logic.</p>}
          </Section>
        )}
      </fieldset>
    </div>
  );
}

function ValidationSection({ field, v, setValidation }: { field: FormField; v: Validation; setValidation: (p: Partial<Validation>) => void }) {
  const showNumeric = NUMERIC_TYPES.has(field.type);
  const showLength = TEXT_LENGTH_TYPES.has(field.type);
  const showPattern = PATTERN_TYPES.has(field.type);
  const showFile = field.type === 'file';
  const patternValid = useMemo(() => {
    if (!v.pattern) return true;
    try {
      new RegExp(v.pattern);
      return true;
    } catch {
      return false;
    }
  }, [v.pattern]);
  if (!showNumeric && !showLength && !showFile) return null;

  return (
    <Section title="Validation">
      {showNumeric && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <NumberInput value={v.min} onChange={(min) => setValidation({ min })} />
          </Field>
          <Field label="Max" error={v.min !== undefined && v.max !== undefined && v.max < v.min ? 'Below min' : undefined}>
            <NumberInput value={v.max} onChange={(max) => setValidation({ max })} placeholder={field.type === 'rating' ? '5' : undefined} max={field.type === 'rating' ? 10 : undefined} />
          </Field>
        </div>
      )}
      {showLength && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min length">
            <NumberInput value={v.minLength} min={0} step={1} onChange={(minLength) => setValidation({ minLength: minLength === undefined ? undefined : Math.round(minLength) })} />
          </Field>
          <Field label="Max length" error={v.minLength !== undefined && v.maxLength !== undefined && v.maxLength < v.minLength ? 'Below min' : undefined}>
            <NumberInput value={v.maxLength} min={0} step={1} onChange={(maxLength) => setValidation({ maxLength: maxLength === undefined ? undefined : Math.round(maxLength) })} />
          </Field>
        </div>
      )}
      {showPattern && (
        <>
          <Field label="Pattern" optional error={patternValid ? undefined : 'Not a valid regular expression'}>
            <Input size="sm" className="font-mono text-xs" placeholder="^[A-Z]{2}[0-9]{4}$" value={v.pattern ?? ''} spellCheck={false} onChange={(e) => setValidation({ pattern: e.target.value || undefined })} />
          </Field>
          {v.pattern && (
            <Field label="Pattern error message">
              <Input size="sm" placeholder="Invalid format" value={v.patternMessage ?? ''} onChange={(e) => setValidation({ patternMessage: e.target.value || undefined })} />
            </Field>
          )}
        </>
      )}
      {showFile && (
        <>
          <Field label="Accepted types" help="Extensions or MIME types, e.g. .pdf, image/*">
            <TagInput value={v.accept ?? []} onChange={(accept) => setValidation({ accept })} placeholder=".pdf, image/*" transform={(t) => t.trim().toLowerCase()} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max size (MB)">
              <NumberInput value={v.maxFileSizeMb} min={1} onChange={(maxFileSizeMb) => setValidation({ maxFileSizeMb })} />
            </Field>
            <Field label="Max files">
              <NumberInput value={v.maxFiles} min={1} step={1} onChange={(maxFiles) => setValidation({ maxFiles: maxFiles === undefined ? undefined : Math.round(maxFiles) })} />
            </Field>
          </div>
        </>
      )}
    </Section>
  );
}

function DefaultValueInput({ field, onChange }: { field: FormField; onChange: (v: unknown) => void }) {
  const val = field.defaultValue;
  const opts = (field.options ?? []).filter((o) => o.value);
  switch (field.type) {
    case 'select':
    case 'radio':
      return (
        <Select
          size="sm"
          value={typeof val === 'string' && opts.some((o) => o.value === val) ? val : '__none'}
          onValueChange={(x) => onChange(x === '__none' ? undefined : x)}
          options={[{ value: '__none', label: 'None' }, ...opts.map((o) => ({ value: o.value, label: o.label }))]}
        />
      );
    case 'multiselect':
      return <Combobox multiple size="sm" value={Array.isArray(val) ? val.map(String) : []} onChange={(x) => onChange(x.length ? x : undefined)} options={opts.map((o) => ({ value: o.value, label: o.label }))} placeholder="None" />;
    case 'checkbox':
      if (opts.length) return <Combobox multiple size="sm" value={Array.isArray(val) ? val.map(String) : []} onChange={(x) => onChange(x.length ? x : undefined)} options={opts.map((o) => ({ value: o.value, label: o.label }))} placeholder="None" />;
      return <Switch label="Checked by default" checked={val === true} onCheckedChange={(c) => onChange(c || undefined)} />;
    case 'number':
    case 'rating':
      return <NumberInput value={typeof val === 'number' ? val : val === undefined || val === '' ? undefined : Number(val)} onChange={(n) => onChange(n)} />;
    case 'date':
    case 'time':
    case 'datetime':
      return <Input size="sm" type={field.type === 'datetime' ? 'datetime-local' : field.type} value={typeof val === 'string' ? val : ''} onChange={(e) => onChange(e.target.value || undefined)} />;
    case 'textarea':
      return <Textarea rows={2} value={typeof val === 'string' ? val : ''} onChange={(e) => onChange(e.target.value || undefined)} />;
    default:
      return <Input size="sm" className={cn(field.type === 'hidden' && 'font-mono text-xs')} value={val === undefined || val === null ? '' : String(val)} onChange={(e) => onChange(e.target.value === '' ? (field.type === 'hidden' ? '' : undefined) : e.target.value)} />;
  }
}

/** Shown when nothing is selected: a keyboard-friendly list of fields. */
function FieldOutline() {
  const { draft, setSelectedId } = useFormEditor();
  if (!draft.fields.length) {
    return <EmptyState compact icon={<MousePointerClick />} title="No field selected" description="Add a field from the palette, then select it to edit its settings." />;
  }
  return (
    <div>
      <div className="sticky top-0 z-10 flex h-11 items-center border-b border-border bg-surface px-4 text-sm font-medium">Fields</div>
      <p className="px-4 pt-3 text-xs text-fg-muted">Select a field on the canvas or below to edit it.</p>
      <ul className="p-2">
        {draft.fields.map((f) => {
          const Icon = FIELD_TYPE_META[f.type].icon;
          return (
            <li key={f.id}>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal text-fg" onClick={() => setSelectedId(f.id)}>
                <Icon className="text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-left">{f.label || f.name}</span>
                {isInputField(f) && <span className="max-w-[40%] truncate font-mono text-2xs text-fg-subtle">{f.name}</span>}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
