import type { CollectionField } from '@atrium/schema';
import type { MediaRef } from '@atrium/schema';
import type { CollectionItemDto, Media } from '@atrium/sdk';

export type ItemStatus = 'draft' | 'published' | 'archived';
export const ITEM_STATUSES: ItemStatus[] = ['draft', 'published', 'archived'];
export const STATUS_META: Record<ItemStatus, { label: string; tone: 'neutral' | 'success' | 'warning' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  archived: { label: 'Archived', tone: 'warning' },
};
export function asStatus(s: string | undefined | null): ItemStatus {
  return s === 'draft' || s === 'archived' ? s : 'published';
}

/* ------------------------------------------------------------------ media */

/** Stored shape for image/video/media values (matches the renderer's MediaRef). */
export function mediaToRef(m: Media): MediaRef {
  const ref: MediaRef = { src: m.url, mediaId: m.id };
  if (m.alt) ref.alt = m.alt;
  if (m.width) ref.width = m.width;
  if (m.height) ref.height = m.height;
  if (m.mimeType) ref.mimeType = m.mimeType;
  if (m.blurDataUrl) ref.blurDataUrl = m.blurDataUrl;
  return ref;
}

/** Accepts a URL string or a MediaRef-like object. */
export function readMediaRef(v: unknown): MediaRef | null {
  if (typeof v === 'string') return v ? { src: v } : null;
  if (v && typeof v === 'object' && typeof (v as { src?: unknown }).src === 'string') return v as MediaRef;
  if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') return { src: (v as { url: string }).url };
  return null;
}

export function readGallery(v: unknown): MediaRef[] {
  if (!Array.isArray(v)) return [];
  return v.map(readMediaRef).filter((x): x is MediaRef => !!x);
}

/* ---------------------------------------------------------------- location */

export interface LocationValue {
  lat?: number;
  lng?: number;
  address?: string;
}
export function readLocation(v: unknown): LocationValue {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : undefined);
  return { lat: num(o.lat), lng: num(o.lng ?? o.lon), address: typeof o.address === 'string' ? o.address : undefined };
}

/* ------------------------------------------------------------------- dates */

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO/date string → value for `<input type="datetime-local">`. */
export function toDatetimeLocal(v: unknown): string {
  if (typeof v !== 'string' || !v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromDatetimeLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function toDateInput(v: unknown): string {
  if (typeof v !== 'string' || !v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------------------------------------------------------------- general */

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return true;
  return false;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

/** Plain-text representation of a value (titles, search, cells). */
export function textOf(field: CollectionField | undefined, v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return field?.type === 'richtext' ? stripHtml(v) : field && (field.type === 'select') ? (field.options?.find((o) => o.value === v)?.label ?? v) : v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => (field?.type === 'multiselect' ? (field.options?.find((o) => o.value === x)?.label ?? String(x)) : typeof x === 'string' ? x : '')).filter(Boolean).join(', ');
  return '';
}

export function itemTitle(item: Pick<CollectionItemDto, 'data' | 'slug'>, fields: CollectionField[], titleField: string): string {
  const f = fields.find((x) => x.key === titleField);
  return textOf(f, item.data[titleField]) || item.slug || 'Untitled';
}

/** Extract a list of messages from an API validation error's `details`. */
export function detailMessages(details: unknown): string[] {
  if (Array.isArray(details)) return details.flatMap((d) => (typeof d === 'string' ? [d] : d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string' ? [(d as { message: string }).message] : []));
  if (details && typeof details === 'object') {
    const o = details as Record<string, unknown>;
    if (Array.isArray(o.errors)) return detailMessages(o.errors);
    if (Array.isArray(o.issues)) return detailMessages(o.issues);
  }
  return [];
}

/** Map server messages like "Price is required" back to field keys. */
export function mapServerErrors(fields: CollectionField[], messages: string[]): { byKey: Record<string, string>; rest: string[] } {
  const byKey: Record<string, string> = {};
  const rest: string[] = [];
  const sorted = [...fields].sort((a, b) => b.label.length - a.label.length);
  for (const m of messages) {
    const f = sorted.find((x) => m === x.label || m.startsWith(`${x.label} `) || m.includes(`"${x.key}"`) || m.startsWith(`${x.key}:`) || m.startsWith(`data.${x.key}`));
    if (f && !byKey[f.key]) byKey[f.key] = m.startsWith(`${f.label} `) ? `${m.slice(f.label.length + 1, f.label.length + 2).toUpperCase()}${m.slice(f.label.length + 2)}` : m;
    else rest.push(m);
  }
  return { byKey, rest };
}
