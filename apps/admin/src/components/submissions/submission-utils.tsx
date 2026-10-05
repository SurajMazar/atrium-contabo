'use client';

import type { List, Submission, SubmissionStatus, SubmissionSummary } from '@atrium/sdk';
import type { BadgeTone } from '@atrium/ui';
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { SUBMISSION_STATUS_META } from '@/components/common/status';
import { formatBytes } from '@/lib/format';
import { qk } from '@/lib/query-keys';

export const STATUS_ORDER: SubmissionStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'SPAM', 'ARCHIVED'];
export const STATUS_OPTIONS = STATUS_ORDER.map((s) => ({ value: s, label: SUBMISSION_STATUS_META[s].label }));

export type ListData = InfiniteData<List<SubmissionSummary>, string | undefined>;
export type CacheSnapshot = Array<[QueryKey, unknown]>;

/* --------------------------------------------------------------- Summary */

const NAME_KEYS = ['name', 'fullName', 'full_name', 'yourName', 'contactName'];

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.filename ?? o.name ?? o.url ?? '');
  }
  return String(v);
}

/** Who sent it: name, then first+last, then email, then the first value. */
export function primaryOf(summary: Record<string, unknown> | undefined): { label: string; key: string | null } {
  const s = summary ?? {};
  for (const k of NAME_KEYS) if (str(s[k]).trim()) return { label: str(s[k]).trim(), key: k };
  const first = str(s.firstName ?? s.first_name).trim();
  const last = str(s.lastName ?? s.last_name).trim();
  if (first || last) return { label: `${first} ${last}`.trim(), key: 'firstName' };
  if (str(s.email).trim()) return { label: str(s.email).trim(), key: 'email' };
  const entry = Object.entries(s).find(([, v]) => str(v).trim());
  return entry ? { label: str(entry[1]).trim(), key: entry[0] } : { label: 'Anonymous', key: null };
}

/** Remaining summary values as a single-line preview. */
export function previewOf(summary: Record<string, unknown> | undefined, skipKey: string | null): string {
  const skip = new Set([skipKey, ...(skipKey === 'firstName' ? ['lastName', 'first_name', 'last_name'] : [])]);
  return Object.entries(summary ?? {})
    .filter(([k]) => !skip.has(k))
    .map(([, v]) => str(v).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ');
}

/* ----------------------------------------------------------- Value display */

interface FileRef {
  url: string;
  name: string;
  size?: number;
}

function toFiles(v: unknown): FileRef[] {
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .map((x): FileRef | null => {
      if (typeof x === 'string') return x ? { url: x, name: decodeURIComponent(x.split('/').pop()?.split('?')[0] || x) } : null;
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const url = typeof o.url === 'string' ? o.url : '';
        if (!url) return null;
        return { url, name: String(o.filename ?? o.name ?? url.split('/').pop() ?? 'file'), size: typeof o.size === 'number' ? o.size : undefined };
      }
      return null;
    })
    .filter((x): x is FileRef => !!x);
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Render a submitted value according to its field type. */
export function ValueDisplay({ type, value }: { type: string; value: unknown }): ReactNode {
  if (isEmpty(value)) return <span className="text-fg-subtle">—</span>;
  if (type === 'file') {
    const files = toFiles(value);
    if (!files.length) return <span className="text-fg-subtle">—</span>;
    return (
      <ul className="space-y-1">
        {files.map((f, i) => (
          <li key={`${f.url}-${i}`}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-accent hover:underline">
              <Paperclip className="size-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{f.name}</span>
              {f.size !== undefined && <span className="shrink-0 text-xs text-fg-subtle">{formatBytes(f.size)}</span>}
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'consent') return value === true || value === 'true' || value === 'on' ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(str).join(', ');
  if (typeof value === 'object') return <code className="whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(value, null, 2)}</code>;
  const s = String(value);
  if (type === 'email') return <a href={`mailto:${s}`} className="text-accent hover:underline">{s}</a>;
  if (type === 'phone') return <a href={`tel:${s.replace(/[^\d+]/g, '')}`} className="text-accent hover:underline">{s}</a>;
  if (type === 'url' && /^https?:\/\//.test(s))
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
        {s}
      </a>
    );
  return <span className="whitespace-pre-wrap break-words">{s}</span>;
}

export function actionStatusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (/(success|sent|ok|done|delivered|complete)/.test(s)) return 'success';
  if (/(fail|error|bounced|rejected)/.test(s)) return 'danger';
  if (/(pending|queued|running|retry)/.test(s)) return 'warning';
  return 'neutral';
}

/* ---------------------------------------------------------- Cache helpers */

export function snapshotLists(qc: QueryClient, websiteId: string): CacheSnapshot {
  return qc.getQueriesData({ queryKey: qk.submissionsAll(websiteId) });
}

export function restoreSnapshot(qc: QueryClient, snap: CacheSnapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/** Patch matching rows in every cached submissions list (all filter combinations). */
export function patchLists(qc: QueryClient, websiteId: string, ids: Iterable<string>, patch: (s: SubmissionSummary) => SubmissionSummary) {
  const set = new Set(ids);
  qc.setQueriesData<ListData>({ queryKey: qk.submissionsAll(websiteId) }, (data) =>
    data?.pages ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((s) => (set.has(s.id) ? patch(s) : s)) })) } : data,
  );
}

export function removeFromLists(qc: QueryClient, websiteId: string, ids: Iterable<string>) {
  const set = new Set(ids);
  qc.setQueriesData<ListData>({ queryKey: qk.submissionsAll(websiteId) }, (data) =>
    data?.pages ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((s) => !set.has(s.id)), total: p.total !== undefined ? Math.max(0, p.total - set.size) : p.total })) } : data,
  );
}

export function patchDetail(qc: QueryClient, id: string, patch: (s: Submission) => Submission) {
  qc.setQueryData<Submission>(qk.submission(id), (old) => (old ? patch(old) : old));
}
