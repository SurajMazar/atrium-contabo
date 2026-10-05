import { formatCompact, formatMb, formatNumber } from '@/lib/format';

export interface UsageMetric {
  id: string;
  label: string;
  used: number | undefined;
  /** `null` = unlimited / not reported. */
  limit: number | null;
  monthly?: boolean;
  format: (n: number) => string;
  /** Hide the row entirely when neither usage nor limit is reported. */
  optional?: boolean;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** First numeric value among `keys` in `obj`. */
function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = num(obj[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Negative limits (e.g. -1) mean unlimited. */
function limitOf(obj: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  const v = pick(obj, keys);
  if (v === undefined || v < 0) return null;
  return v;
}

const DEFS: Array<{ id: string; label: string; usage: string[]; limit: string[]; monthly?: boolean; format: (n: number) => string; optional?: boolean }> = [
  { id: 'websites', label: 'Websites', usage: ['websites'], limit: ['websites', 'maxWebsites'], format: formatNumber },
  { id: 'members', label: 'Members', usage: ['members', 'seats'], limit: ['members', 'maxMembers', 'seats'], format: formatNumber },
  { id: 'storage', label: 'Storage', usage: ['storageMb', 'storage'], limit: ['storageMb', 'storage'], format: formatMb },
  { id: 'aiRequests', label: 'AI requests', usage: ['aiRequests', 'aiRequestsPerMonth'], limit: ['aiRequestsPerMonth', 'aiRequests'], monthly: true, format: formatNumber },
  { id: 'aiTokens', label: 'AI tokens', usage: ['aiTokens', 'aiTokensPerMonth'], limit: ['aiTokensPerMonth', 'aiTokens'], monthly: true, format: formatCompact },
  { id: 'submissions', label: 'Form submissions', usage: ['submissions', 'submissionsPerMonth'], limit: ['submissionsPerMonth', 'submissions'], monthly: true, format: formatNumber },
  { id: 'customDomains', label: 'Custom domains', usage: ['customDomains', 'domains'], limit: ['customDomains', 'domains'], format: formatNumber },
  { id: 'pageviews', label: 'Pageviews', usage: ['pageviews', 'monthlyPageviews', 'pageviewsThisMonth'], limit: ['monthlyPageviews', 'pageviews'], monthly: true, format: formatCompact, optional: true },
];

export function buildMetrics(usage: unknown, limits: unknown): UsageMetric[] {
  const u = usage && typeof usage === 'object' ? (usage as Record<string, unknown>) : null;
  const l = limits && typeof limits === 'object' ? (limits as Record<string, unknown>) : null;
  return DEFS.map((d) => ({ id: d.id, label: d.label, used: pick(u, d.usage), limit: limitOf(l, d.limit), monthly: d.monthly, format: d.format, optional: d.optional })).filter(
    // Pageviews only when the API reports usage for them.
    (m) => !m.optional || m.used !== undefined,
  );
}

export function ratio(m: Pick<UsageMetric, 'used' | 'limit'>): number | null {
  if (m.used === undefined || m.limit === null) return null;
  if (m.limit === 0) return m.used > 0 ? Infinity : 0;
  return m.used / m.limit;
}

export function toneFor(r: number | null): 'accent' | 'warning' | 'danger' {
  if (r === null) return 'accent';
  if (r >= 1) return 'danger';
  if (r >= 0.8) return 'warning';
  return 'accent';
}
