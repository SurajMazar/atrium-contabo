import { createId, type CollectionField, type CollectionFieldType } from '@atrium/schema';
import { camelKey, FIELD_KEY_RE, FIELD_TYPE_META, hasOptions, isRelation, TITLE_TYPES, uniqueKey } from './field-types';

/** A field being edited, with a stable client id (keys can change while editing). */
export interface DraftField extends CollectionField {
  _id: string;
  /** Field as last saved; undefined for new fields. */
  _orig?: CollectionField;
  /** Whether the key was edited manually (stops auto-derivation from the label). */
  _keyTouched?: boolean;
}

export type FieldErrors = Partial<Record<'label' | 'key' | 'options' | 'relation', string>>;

export function toDraft(fields: CollectionField[]): DraftField[] {
  return fields.map((f) => ({ ...f, _id: `saved:${f.key}`, _orig: f, _keyTouched: true }));
}

/** Strip client-only props and empty optional values for the API. */
export function fromDraft(draft: DraftField[]): CollectionField[] {
  return draft.map(({ _id, _orig, _keyTouched, ...f }) => {
    const out: CollectionField = { key: f.key, label: f.label.trim(), type: f.type, required: !!f.required };
    if (f.helpText?.trim()) out.helpText = f.helpText.trim();
    if (hasOptions(f.type)) out.options = (f.options ?? []).map((o) => ({ label: o.label.trim(), value: o.value.trim() }));
    if (isRelation(f.type) && f.relation) out.relation = f.relation;
    if (f.unique) out.unique = true;
    if (f.localized) out.localized = true;
    return out;
  });
}

export function newDraftField(type: CollectionFieldType, existing: DraftField[]): DraftField {
  const label = FIELD_TYPE_META[type].label;
  const key = uniqueKey(camelKey(label), existing.map((f) => f.key));
  const f: DraftField = { _id: createId('fld'), key, label, type, required: false };
  if (hasOptions(type)) f.options = [{ label: 'Option 1', value: 'option-1' }];
  return f;
}

export function validateDraft(draft: DraftField[]): Record<string, FieldErrors> {
  const out: Record<string, FieldErrors> = {};
  const counts = new Map<string, number>();
  for (const f of draft) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
  for (const f of draft) {
    const e: FieldErrors = {};
    if (!f.label.trim()) e.label = 'Label is required';
    if (!f.key) e.key = 'Key is required';
    else if (!FIELD_KEY_RE.test(f.key)) e.key = 'Start with a letter; use letters, numbers and underscores';
    else if ((counts.get(f.key) ?? 0) > 1) e.key = 'Another field uses this key';
    if (hasOptions(f.type)) {
      const opts = f.options ?? [];
      const values = opts.map((o) => o.value.trim());
      if (opts.length === 0) e.options = 'Add at least one option';
      else if (values.some((v) => !v) || opts.some((o) => !o.label.trim())) e.options = 'Every option needs a label and a value';
      else if (new Set(values).size !== values.length) e.options = 'Option values must be unique';
    }
    if (isRelation(f.type) && !f.relation) e.relation = 'Choose the collection to reference';
    if (Object.keys(e).length) out[f._id] = e;
  }
  return out;
}

export function titleCandidates(draft: DraftField[]): DraftField[] {
  return draft.filter((f) => TITLE_TYPES.includes(f.type));
}

/** Snapshot used for dirty checking. */
export function schemaSignature(fields: CollectionField[], titleField: string): string {
  return JSON.stringify({ fields, titleField });
}
