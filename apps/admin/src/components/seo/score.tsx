import type { SeoReport } from '@atrium/sdk';
import { cn } from '@atrium/ui';
import { AlertTriangle, Check, X } from 'lucide-react';

export type ScoreTone = 'success' | 'warning' | 'danger';
export type CheckStatus = SeoReport['checks'][number]['status'];

export function scoreTone(score: number): ScoreTone {
  return score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger';
}

const textTone: Record<ScoreTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' };
const barTone: Record<ScoreTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' };

/** "91/100" with tone colour. */
export function ScoreValue({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>
      <span className={cn('font-medium', textTone[scoreTone(score)])}>{score}</span>
      <span className="text-fg-subtle">/100</span>
    </span>
  );
}

/** Small horizontal bar for a 0–100 score. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <span className={cn('relative block h-1 w-16 overflow-hidden rounded-full bg-surface-3', className)} aria-hidden>
      <span className={cn('absolute inset-y-0 left-0 rounded-full', barTone[scoreTone(score)])} style={{ width: `${pct}%` }} />
    </span>
  );
}

const statusMeta: Record<CheckStatus, { icon: typeof Check; cls: string; label: string }> = {
  pass: { icon: Check, cls: 'bg-success-soft text-success', label: 'Passed' },
  warn: { icon: AlertTriangle, cls: 'bg-warning-soft text-warning', label: 'Warning' },
  fail: { icon: X, cls: 'bg-danger-soft text-danger', label: 'Failed' },
};

export function CheckStatusIcon({ status }: { status: CheckStatus }) {
  const m = statusMeta[status] ?? statusMeta.warn;
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex size-[18px] shrink-0 items-center justify-center rounded-full', m.cls)} role="img" aria-label={m.label}>
      <Icon className="size-3" strokeWidth={2} />
    </span>
  );
}

/** Checklist for one page's SeoReport. Failures first, then warnings, then passes. */
export function SeoChecklist({ report }: { report: SeoReport }) {
  const order: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };
  const checks = [...(report.checks ?? [])].sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);
  if (!checks.length) return <p className="text-sm text-fg-muted">No checks were run for this page.</p>;
  return (
    <ul className="divide-y divide-border">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2.5 py-2">
          <span className="pt-px">
            <CheckStatusIcon status={c.status} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fg">{c.label}</div>
            {c.detail && <div className="mt-0.5 text-xs text-fg-muted">{c.detail}</div>}
          </div>
          <span className="shrink-0 pt-0.5 text-2xs tabular-nums text-fg-subtle" title="Weight in the page score">
            {c.weight} pts
          </span>
        </li>
      ))}
    </ul>
  );
}

export function issueCounts(report: SeoReport) {
  let fail = 0;
  let warn = 0;
  for (const c of report.checks ?? []) {
    if (c.status === 'fail') fail++;
    else if (c.status === 'warn') warn++;
  }
  return { fail, warn };
}
