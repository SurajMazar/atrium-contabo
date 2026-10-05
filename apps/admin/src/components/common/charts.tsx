'use client';

import { cn } from '@atrium/ui';
import { useId, useMemo, useState } from 'react';
import { formatDate, formatNumber } from '@/lib/format';

/** Tiny inline sparkline (no axes). */
export function Sparkline({ values, className, height = 32, strokeClass = 'stroke-accent' }: { values: number[]; className?: string; height?: number; strokeClass?: string }) {
  const w = 120;
  const h = height;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length <= 1 ? w : (i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('w-full', className)} style={{ height }} aria-hidden>
      {values.length > 0 && <path d={d} fill="none" className={cn(strokeClass)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  className: string; // stroke color class, e.g. 'stroke-accent'
  swatch: string; // bg color class for legend
}

/** Lightweight responsive line chart with gridlines, y-axis labels and hover tooltip. */
export function LineChart<T extends { date: string }>({ data, series, height = 220, className }: { data: T[]; series: LineSeries[]; height?: number; className?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = useMemo(() => {
    const m = Math.max(1, ...data.flatMap((d) => series.map((s) => Number((d as Record<string, unknown>)[s.key] ?? 0))));
    const mag = 10 ** Math.floor(Math.log10(m));
    return Math.ceil(m / mag) * mag;
  }, [data, series]);
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-t`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - pad.l) / iw) * (data.length - 1));
          setHover(i >= 0 && i < data.length ? i : null);
        }}
      >
        <title id={`${id}-t`}>{series.map((s) => s.label).join(' and ')} over time</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-fg-subtle text-[10px]" style={{ fontSize: 10 }}>
              {t >= 1000 ? `${Math.round(t / 100) / 10}k` : t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-fg-subtle" style={{ fontSize: 10 }}>
              {formatDate(d.date, { month: 'short', day: 'numeric' })}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number((d as Record<string, unknown>)[s.key] ?? 0)).toFixed(1)}`).join(' ');
          return <path key={s.key} d={path} fill="none" className={s.className} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {hover !== null && data[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="stroke-border-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(Number((data[hover] as Record<string, unknown>)[s.key] ?? 0))} r={3} className={cn(s.className, 'fill-surface')} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-popover"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 70px), calc(100% - 150px))` }}
        >
          <div className="mb-1 font-medium text-fg">{formatDate(data[hover].date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-fg-muted">
              <span className={cn('size-2 rounded-full', s.swatch)} />
              <span className="flex-1">{s.label}</span>
              <span className="tabular-nums text-fg">{formatNumber(Number((data[hover] as Record<string, unknown>)[s.key] ?? 0))}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-4 pl-10 text-xs text-fg-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={cn('h-0.5 w-3 rounded-full', s.swatch)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar list for top-N tables (pages, referrers…). */
export function BarList({ items, valueLabel, empty = 'No data yet' }: { items: Array<{ label: string; value: number; href?: string }>; valueLabel?: string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="px-4 py-8 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <div className="px-2 py-2">
      {valueLabel && (
        <div className="flex justify-between px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
          <span />
          <span>{valueLabel}</span>
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.label} className="relative flex h-7 items-center justify-between gap-3 overflow-hidden rounded-sm px-2 text-sm">
            <span className="absolute inset-y-0 left-0 rounded-sm bg-accent-soft/70" style={{ width: `${(it.value / max) * 100}%` }} aria-hidden />
            <span className="relative min-w-0 truncate text-fg">{it.label}</span>
            <span className="relative shrink-0 tabular-nums text-fg-muted">{formatNumber(it.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
