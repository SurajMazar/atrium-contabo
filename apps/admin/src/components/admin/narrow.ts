import { formatCompact, formatMb, formatNumber, formatUsd } from '@/lib/format';

/** Defensive narrowing for the loosely-typed super-admin endpoints. */
export type Row = Record<string, unknown>;

export function isRecord(v: unknown): v is Row {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function rec(v: unknown): Row {
  return isRecord(v) ? v : {};
}

export function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

export function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

export function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

const ACRONYMS: Record<string, string> = { ai: 'AI', usd: 'USD', mb: 'MB', id: 'ID', ip: 'IP', mfa: 'MFA', url: 'URL', sms: 'SMS' };

/** `publishedWebsites` → "Published websites", `costUsd` → "Cost" (units come from the formatted value). */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase());
  if (words.length > 1 && ['usd', 'mb'].includes(words[words.length - 1]!)) words.pop();
  return words.map((w, i) => ACRONYMS[w] ?? (i === 0 ? w.replace(/^\w/, (c) => c.toUpperCase()) : w)).join(' ');
}

/** Format a metric based on its key name. */
export function formatMetric(key: string, value: number, compact = false): string {
  const k = key.toLowerCase();
  if (k.includes('usd') || k.includes('cost')) return formatUsd(value);
  if (k.endsWith('mb')) return formatMb(value);
  if (compact || k.includes('token')) return formatCompact(value);
  return formatNumber(value);
}

/** Numeric entries of an object (ignores nested values). */
export function numericEntries(o: unknown): Array<[string, number]> {
  return Object.entries(rec(o)).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]));
}

export function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function isIdKey(key: string): boolean {
  return key === 'id' || /Id$/.test(key);
}
