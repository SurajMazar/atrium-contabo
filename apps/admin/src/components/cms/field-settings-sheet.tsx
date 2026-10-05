'use client';

import type { CollectionFieldType } from '@atrium/schema';
import type { Collection } from '@atrium/sdk';
import { Badge, Banner, Button, Field, Input, Select, Separator, Sheet, SheetContent, Switch, Textarea } from '@atrium/ui';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { camelKey, FIELD_TYPE_GROUPS, FIELD_TYPE_META, hasOptions, isRelation, uniqueKey } from './field-types';
import { OptionsEditor } from './options-editor';
import type { DraftField, FieldErrors } from './schema-model';

const UNIQUE_TYPES: CollectionFieldType[] = ['text', 'slug', 'email', 'url', 'number'];
const LOCALIZABLE_TYPES: CollectionFieldType[] = ['text', 'textarea', 'richtext', 'slug', 'url', 'image', 'video', 'media', 'gallery', 'json'];

export interface FieldSettingsSheetProps {
  field: DraftField | null;
  errors: FieldErrors | undefined;
  allFields: DraftField[];
  collections: Collection[];
  currentCollectionId: string;
  isTitle: boolean;
  readOnly?: boolean;
  onChange: (id: string, patch: Partial<DraftField>) => void;
  onRemove: (field: DraftField) => void;
  onClose: () => void;
}

export function FieldSettingsSheet({ field, errors, allFields, collections, currentCollectionId, isTitle, readOnly, onChange, onRemove, onClose }: FieldSettingsSheetProps) {
  return (
    <Sheet open={!!field} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        size="md"
        title={field ? field.label || 'Untitled field' : ''}
        description={field ? `${FIELD_TYPE_META[field.type]?.label ?? field.type} field` : undefined}
        footer={
          field && !readOnly ? (
            <>
              <Button variant="danger-ghost" size="sm" leadingIcon={<Trash2 />} onClick={() => onRemove(field)} className="mr-auto" disabled={allFields.length <= 1}>
                Delete field
              </Button>
              <Button size="sm" variant="primary" onClick={onClose}>
                Done
              </Button>
            </>
          ) : undefined
        }
      >
        {field && <FieldSettingsBody key={field._id} field={field} errors={errors ?? {}} allFields={allFields} collections={collections} currentCollectionId={currentCollectionId} isTitle={isTitle} readOnly={readOnly} onChange={(p) => onChange(field._id, p)} />}
      </SheetContent>
    </Sheet>
  );
}

function FieldSettingsBody({ field, errors, allFields, collections, currentCollectionId, isTitle, readOnly, onChange }: { field: DraftField; errors: FieldErrors; allFields: DraftField[]; collections: Collection[]; currentCollectionId: string; isTitle: boolean; readOnly?: boolean; onChange: (p: Partial<DraftField>) => void }) {
  const orig = field._orig;
  const keyChanged = !!orig && orig.key !== field.key;
  const typeChanged = !!orig && orig.type !== field.type;
  const otherKeys = allFields.filter((f) => f._id !== field._id).map((f) => f.key);

  const setType = (type: CollectionFieldType) => {
    const patch: Partial<DraftField> = { type };
    if (hasOptions(type) && !(field.options && field.options.length)) patch.options = [{ label: 'Option 1', value: 'option-1' }];
    if (!UNIQUE_TYPES.includes(type)) patch.unique = undefined;
    if (!LOCALIZABLE_TYPES.includes(type)) patch.localized = undefined;
    onChange(patch);
  };

  const relationOptions = collections.map((c) => ({ value: c.slug, label: c.id === currentCollectionId ? `${c.name} (this collection)` : c.name, description: c.slug }));

  return (
    <fieldset disabled={readOnly} className="space-y-5">
      <Field label="Type">
        <Select
          value={field.type}
          onValueChange={(v) => setType(v as CollectionFieldType)}
          options={FIELD_TYPE_GROUPS.map((g) => ({
            label: g.label,
            options: g.types.map((t) => {
              const Icon = FIELD_TYPE_META[t].icon;
              return { value: t, label: FIELD_TYPE_META[t].label, icon: <Icon /> };
            }),
          }))}
        />
      </Field>
      {typeChanged && (
        <Banner tone="warning" icon={<AlertTriangle />}>
          Changing from {FIELD_TYPE_META[orig!.type]?.label ?? orig!.type} to {FIELD_TYPE_META[field.type].label} may make existing values invalid. Review items after saving.
        </Banner>
      )}

      <Field label="Label" required error={errors.label}>
        <Input
          autoFocus
          value={field.label}
          onChange={(e) => {
            const label = e.target.value;
            onChange(field._keyTouched ? { label } : { label, key: uniqueKey(camelKey(label), otherKeys) });
          }}
        />
      </Field>

      <Field
        label="Key"
        required
        error={errors.key}
        help={errors.key ? undefined : 'Used in templates and the API. Letters, numbers and underscores.'}
        hint={isTitle ? <Badge tone="accent" size="xs">Title field</Badge> : undefined}
      >
        <Input className="font-mono text-xs" value={field.key} spellCheck={false} autoComplete="off" onChange={(e) => onChange({ key: e.target.value.replace(/\s+/g, '_'), _keyTouched: true })} />
      </Field>
      {keyChanged && (
        <Banner tone="warning" icon={<AlertTriangle />}>
          Existing items store this value under <span className="font-mono text-xs">{orig!.key}</span>. Renaming the key won’t carry existing values over.
        </Banner>
      )}

      <Field label="Help text" optional help="Shown under the input in the item editor.">
        <Textarea rows={2} value={field.helpText ?? ''} onChange={(e) => onChange({ helpText: e.target.value })} />
      </Field>

      {hasOptions(field.type) && (
        <Field label="Options" required error={errors.options}>
          <OptionsEditor value={field.options ?? []} onChange={(options) => onChange({ options })} invalid={!!errors.options} />
        </Field>
      )}

      {isRelation(field.type) && (
        <Field label="Referenced collection" required error={errors.relation} help="Items are picked from this collection.">
          <Select value={field.relation} onValueChange={(relation) => onChange({ relation })} placeholder="Choose a collection" options={relationOptions} />
        </Field>
      )}

      <Separator />

      <div className="space-y-4">
        <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Validation</div>
        <Switch label="Required" description={isTitle ? 'The title field should usually be required.' : 'Items can’t be saved without a value.'} checked={!!field.required} onCheckedChange={(v) => onChange({ required: v })} />
        {UNIQUE_TYPES.includes(field.type) && <Switch label="Unique" description="No two items can share the same value." checked={!!field.unique} onCheckedChange={(v) => onChange({ unique: v || undefined })} />}
        {LOCALIZABLE_TYPES.includes(field.type) && <Switch label="Localized" description="Store a separate value per site language." checked={!!field.localized} onCheckedChange={(v) => onChange({ localized: v || undefined })} />}
      </div>
    </fieldset>
  );
}
