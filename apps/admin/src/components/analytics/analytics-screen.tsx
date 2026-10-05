'use client';

import type { Analytics } from '@atrium/sdk';
import { Banner, Button, Card, CardHeader, cn, DateRangePicker, ErrorState, PageHeader, presetRange, Skeleton, Stat, StatusDot, Table, TableContainer, TBody, TD, TH, THead, TR, type DateRange } from '@atrium/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BarChart3, Info } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { BarList, LineChart } from '@/components/common/charts';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { formatCompact, formatNumber, formatPercent, formatRatio } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useDraft } from '@/lib/use-draft';
import { useSession } from '@/lib/session';

const SERIES = [
  { key: 'pageviews', label: 'Pageviews', className: 'stroke-accent', swatch: 'bg-accent' },
  { key: 'visitors', label: 'Visitors', className: 'stroke-fg-muted', swatch: 'bg-fg-muted' },
];

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return code || 'Unknown';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown');

/** Defensive normalisation of the analytics payload. */
function normalize(a: Partial<Analytics> | undefined): Analytics {
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const t = a?.totals;
  return {
    totals: { pageviews: t?.pageviews ?? 0, visitors: t?.visitors ?? 0, sessions: t?.sessions ?? 0, conversions: t?.conversions ?? 0, conversionRate: t?.conversionRate ?? 0 },
    series: arr(a?.series),
    topPages: arr(a?.topPages),
    referrers: arr(a?.referrers),
    countries: arr(a?.countries),
    devices: arr(a?.devices),
    forms: arr(a?.forms),
  };
}

export function AnalyticsScreen({ websiteId }: { websiteId: string }) {
  return (
    <PermissionPage permission="analytics.read" websiteId={websiteId}>
      <AnalyticsInner websiteId={websiteId} />
    </PermissionPage>
  );
}

function AnalyticsInner({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const [range, setRange] = useState<DateRange>(() => presetRange(30));
  const q = useQuery({
    queryKey: qk.analytics(websiteId, { from: range.from, to: range.to }),
    queryFn: () => api.websites.analytics(websiteId, { from: range.from, to: range.to }),
    placeholderData: keepPreviousData,
  });
  const data = useMemo(() => (q.data ? normalize(q.data) : null), [q.data]);
  const empty = data ? data.totals.pageviews === 0 && data.series.every((d) => !d.pageviews && !d.visitors) : false;

  return (
    <Page width="wide">
      <PageHeader title="Analytics" description="Privacy-friendly traffic and conversions from the built-in tracker." actions={<DateRangePicker value={range} onChange={setRange} />} />

      {q.isError && !data ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : !data ? (
        <AnalyticsSkeleton />
      ) : (
        <div className={cn('space-y-4 transition-opacity', q.isFetching && q.isPlaceholderData && 'opacity-60')} aria-busy={q.isFetching}>
          {empty && (
            <Banner tone="info" icon={<Info />}>
              No visits recorded between these dates. Data appears once the site is published and receiving traffic.
            </Banner>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Stat label="Pageviews" value={formatCompact(data.totals.pageviews)} />
            <Stat label="Visitors" value={formatCompact(data.totals.visitors)} />
            <Stat label="Sessions" value={formatCompact(data.totals.sessions)} sub={data.totals.visitors ? `${(data.totals.sessions / Math.max(1, data.totals.visitors)).toFixed(1)} per visitor` : undefined} />
            <Stat label="Conversions" value={formatCompact(data.totals.conversions)} />
            <Stat label="Conversion rate" value={formatPercent(data.totals.conversionRate)} />
          </div>

          <Card>
            <CardHeader title="Traffic" description="Daily pageviews and unique visitors" />
            <div className="px-4 pb-3 pt-4">
              {data.series.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-sm text-fg-muted">No traffic in this period</div>
              ) : (
                <LineChart data={data.series} series={SERIES} height={220} />
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top pages">
              <BarList valueLabel="Views" items={data.topPages.slice(0, 10).map((p) => ({ label: p.path || '/', value: p.pageviews }))} empty="No pageviews yet" />
            </Panel>
            <Panel title="Referrers">
              <BarList valueLabel="Visits" items={data.referrers.slice(0, 10).map((r) => ({ label: r.referrer || 'Direct / none', value: r.visits }))} empty="No referrers yet" />
            </Panel>
            <Panel title="Countries">
              <BarList valueLabel="Visits" items={data.countries.slice(0, 10).map((c) => ({ label: countryName(c.country), value: c.visits }))} empty="No location data yet" />
            </Panel>
            <Panel title="Devices">
              <DeviceList devices={data.devices} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <FormConversions websiteId={websiteId} forms={data.forms} />
            <IntegrationsCard websiteId={websiteId} />
          </div>
        </div>
      )}
    </Page>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={title} />
      {children}
    </Card>
  );
}

function DeviceList({ devices }: { devices: Analytics['devices'] }) {
  const total = devices.reduce((n, d) => n + (d.visits ?? 0), 0);
  if (!devices.length || total === 0) return <p className="px-4 py-8 text-center text-sm text-fg-muted">No device data yet</p>;
  const sorted = [...devices].sort((a, b) => b.visits - a.visits);
  return (
    <div className="space-y-3 p-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {sorted.map((d, i) => (
          <span key={d.device} className={cn('h-full', i === 0 ? 'bg-accent' : i === 1 ? 'bg-fg-muted' : 'bg-border-strong')} style={{ width: `${(d.visits / total) * 100}%` }} />
        ))}
      </div>
      <ul className="space-y-1.5">
        {sorted.map((d, i) => (
          <li key={d.device} className="flex items-center gap-2 text-sm">
            <span className={cn('size-2 rounded-full', i === 0 ? 'bg-accent' : i === 1 ? 'bg-fg-muted' : 'bg-border-strong')} aria-hidden />
            <span className="flex-1 text-fg">{cap(d.device)}</span>
            <span className="tabular-nums text-fg-muted">{formatNumber(d.visits)}</span>
            <span className="w-12 text-right tabular-nums text-fg-subtle">{formatRatio(d.visits / total, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormConversions({ websiteId, forms }: { websiteId: string; forms: Analytics['forms'] }) {
  const total = forms.reduce((n, f) => n + (f.submissions ?? 0), 0);
  const sorted = [...forms].sort((a, b) => b.submissions - a.submissions);
  return (
    <Card className="min-w-0">
      <CardHeader title="Form conversions" description="Submissions per form in this period" />
      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">No form submissions in this period</p>
      ) : (
        <TableContainer className="rounded-none border-0">
          <Table>
            <THead>
              <TR>
                <TH>Form</TH>
                <TH align="right">Submissions</TH>
                <TH align="right" className="hidden sm:table-cell">
                  Share
                </TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((f) => (
                <TR key={f.formId}>
                  <TD>
                    <Link href={`/w/${websiteId}/forms/${f.formId}`} className="font-medium text-fg hover:underline">
                      {f.name || 'Untitled form'}
                    </Link>
                  </TD>
                  <TD align="right">{formatNumber(f.submissions)}</TD>
                  <TD align="right" muted className="hidden sm:table-cell">
                    {total ? formatRatio(f.submissions / total, 0) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

function IntegrationsCard({ websiteId }: { websiteId: string }) {
  const { can } = useSession();
  const draft = useDraft(websiteId);
  const a = draft.data?.definition.settings?.analytics;
  const items = [
    { label: 'Google Analytics 4', value: a?.googleAnalyticsId },
    { label: 'Google Tag Manager', value: a?.googleTagManagerId },
    { label: 'Meta Pixel', value: a?.metaPixelId },
  ];
  const settingsHref = `/w/${websiteId}/settings?section=analytics`;
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Tracking and integrations"
        actions={
          can('website.update', websiteId) && (
            <Button size="xs" variant="ghost" trailingIcon={<ArrowUpRight />} asChild>
              <Link href={settingsHref}>Configure</Link>
            </Button>
          )
        }
      />
      <div className="space-y-3 p-4">
        {draft.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : draft.isError ? (
          <p className="text-sm text-fg-muted">Tracking settings couldn’t be loaded.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-fg">
                <BarChart3 className="size-4 text-fg-muted" strokeWidth={1.5} />
                Built-in analytics
              </span>
              <StatusDot tone={a?.builtIn === false ? 'neutral' : 'success'} label={<span className="text-xs text-fg-muted">{a?.builtIn === false ? 'Off' : 'On'}</span>} />
            </div>
            {a?.builtIn === false && <p className="text-xs text-fg-muted">The charts above stop updating while built-in analytics is off.</p>}
            <ul className="divide-y divide-border rounded-md border border-border">
              {items.map((it) => (
                <li key={it.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-fg">{it.label}</span>
                  {it.value ? <span className="truncate font-mono text-xs text-fg-muted">{it.value}</span> : <span className="text-xs text-fg-subtle">Not set</span>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">
              External tracking IDs are set in{' '}
              <Link href={settingsHref} className="text-accent hover:underline">
                Settings → Analytics
              </Link>
              . Their reports live in each provider’s dashboard and respect the cookie consent banner.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="m-4 h-[220px]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((__, j) => (
                <Skeleton key={j} className="h-5" style={{ width: `${90 - j * 14}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
