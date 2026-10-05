import { slugify, validateCollectionItem, type CollectionField } from '@atrium/schema';
import type { CollectionItemDto } from '@atrium/sdk';
import { asStatus, isEmptyValue, mapServerErrors, readGallery, readLocation, readMediaRef, stripHtml, textOf, type ItemStatus } from './values';

export interface ItemFormState {
  values: Record<string, unknown>;
  slug: string;
  status: ItemStatus;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize stored data into editor values (accepts legacy/loose shapes). */
export function toFormState(fields: CollectionField[], item: CollectionItemDto | null, defaults?: Partial<ItemFormState>): ItemFormState {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const v = item?.data[f.key];
    if (v === undefined || v === null) continue;
    switch (f.type) {
      case 'image':
      case 'video':
      case 'media':
        values[f.key] = readMediaRef(v) ?? undefined;
        break;
      case 'gallery':
        values[f.key] = readGallery(v);
        break;
      case 'location':
        values[f.key] = readLocation(v);
        break;
      case 'number':
        values[f.key] = typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
        break;
      case 'boolean':
        values[f.key] = v === true || v === 'true';
        break;
      case 'multiselect':
        values[f.key] = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
        break;
      default:
        values[f.key] = v;
    }
  }
  if (!item) for (const f of fields) if (f.type === 'boolean' && values[f.key] === undefined) values[f.key] = false;
  return { values, slug: item?.slug ?? defaults?.slug ?? '', status: item ? asStatus(item.status) : (defaults?.status ?? 'published') };
}

function isBlank(f: CollectionField, v: unknown): boolean {
  if (f.type === 'richtext' && typeof v === 'string') return !stripHtml(v) && !/<img\s/i.test(v);
  if (typeof v === 'string') return v.trim() === '';
  return isEmptyValue(v);
}

/** Data payload for the API. Empty values become null on update (to clear) and are omitted on create. */
export function toPayload(fields: CollectionField[], values: Record<string, unknown>, mode: 'create' | 'update'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === 'boolean') {
      out[f.key] = v === true;
      continue;
    }
    if (isBlank(f, v) || (f.type === 'number' && typeof v !== 'number')) {
      if (mode === 'update') out[f.key] = null;
      continue;
    }
    out[f.key] = typeof v === 'string' && f.type !== 'richtext' && f.type !== 'textarea' ? v.trim() : v;
  }
  return out;
}

export function validateItem(fields: CollectionField[], values: Record<string, unknown>, jsonErrors: Record<string, string | undefined>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (jsonErrors[f.key]) {
      errors[f.key] = jsonErrors[f.key]!;
      continue;
    }
    if (isBlank(f, v)) {
      if (f.required) errors[f.key] = 'Required';
      continue;
    }
    switch (f.type) {
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) errors[f.key] = 'Enter a number';
        break;
      case 'email':
        if (typeof v !== 'string' || !EMAIL_RE.test(v)) errors[f.key] = 'Enter a valid email address';
        break;
      case 'url':
        if (typeof v === 'string' && !/^(\/|#|mailto:|tel:)/.test(v)) {
          try {
            new URL(v);
          } catch {
            errors[f.key] = 'Enter a full URL (https://…) or a path starting with /';
          }
        }
        break;
      case 'select':
        if (f.options && !f.options.some((o) => o.value === v)) errors[f.key] = 'Choose one of the options';
        break;
      case 'multiselect':
        if (Array.isArray(v) && f.options && v.some((x) => !f.options!.some((o) => o.value === x))) errors[f.key] = 'Contains an option that no longer exists';
        break;
      case 'location': {
        const l = readLocation(v);
        if (l.lat !== undefined && (l.lat < -90 || l.lat > 90)) errors[f.key] = 'Latitude must be between -90 and 90';
        else if (l.lng !== undefined && (l.lng < -180 || l.lng > 180)) errors[f.key] = 'Longitude must be between -180 and 180';
        else if ((l.lat === undefined) !== (l.lng === undefined)) errors[f.key] = 'Enter both latitude and longitude';
        break;
      }
      case 'slug':
        if (typeof v === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) errors[f.key] = 'Use lowercase letters, numbers and single hyphens';
        break;
    }
  }
  // Parity with the server-side validator.
  const shared = mapServerErrors(fields, validateCollectionItem(fields, toPayload(fields, values, 'create')));
  for (const [k, m] of Object.entries(shared.byKey)) if (!errors[k]) errors[k] = m;
  return errors;
}

export function autoSlug(fields: CollectionField[], titleField: string, values: Record<string, unknown>): string {
  const f = fields.find((x) => x.key === titleField);
  return slugify(textOf(f, values[titleField]));
}
