'use client';

import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogClose,
  ErrorState,
  Field,
  PageHeader,
  Progress,
  Skeleton,
  Stat,
  Tooltip,
} from '@atrium/ui';
import type { AtriumClient } from '@atrium/sdk';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { useApi } from '@/lib/api';
import { formatCompact, formatNumber, formatUsd } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { buildMetrics, ratio, toneFor, type UsageMetric } from './usage-metrics';

function periodLabel(p: unknown): string | null {
  if (typeof p !== 'string' || !p) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const d = new Date(p);
  if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(p)) return `Since ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return p;
}

type AiUsage = Awaited<ReturnType<AtriumClient['ai']['usage']>>;

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function UsageScreen({ orgId }: { orgId: string }) {
  const api = useApi();
  const { can, memberships } = useSession();
  const org = memberships.find((m) => m.organization.id === orgId)?.organization;
  const canBilling = can('billing.manage');
  const [planOpen, setPlanOpen] = useState(false);

  const usage = useQuery({ queryKey: qk.orgUsage(orgId), queryFn: () => api.organizations.usage(orgId) });
  const ai = useQuery({ queryKey: qk.aiUsage(orgId), queryFn: () => api.ai.usage(orgId) });

  const metrics = useMemo(() => (usage.data ? buildMetrics(usage.data.usage, usage.data.limits) : []), [usage.data]);
  const over = metrics.filter((m) => (ratio(m) ?? 0) >= 1);
  const near = metrics.filter((m) => {
    const r = ratio(m) ?? 0;
    return r >= 0.8 && r < 1;
  });

  const planName = usage.data?.plan?.name ?? org?.planKey ?? '—';
  const planKey = usage.data?.plan?.key ?? org?.planKey;

  const changePlan = (
    <Button size="sm" leadingIcon={<ArrowUpRight />} disabled={!canBilling} onClick={() => setPlanOpen(true)}>
      Change plan
    </Button>
  );

  return (
    <Page>
      <PageHeader title="Usage & billing" description={org ? `Plan limits and current usage for ${org.name}.` : 'Plan limits and current usage.'} />

      {usage.isPending ? (
        <UsageSkeleton />
      ) : usage.isError ? (
        <ErrorState description={usage.error.message} onRetry={() => void usage.refetch()} />
      ) : (
        <div className="space-y-4">
          {over.length > 0 ? (
            <Banner tone="danger" icon={<AlertTriangle />}>
              You’ve reached the {listJoin(over.map((m) => m.label.toLowerCase()))} limit on the {planName} plan. Some actions may be blocked until usage drops or the plan changes.
            </Banner>
          ) : near.length > 0 ? (
            <Banner tone="warning" icon={<AlertTriangle />}>
              You’re close to the {listJoin(near.map((m) => m.label.toLowerCase()))} limit on the {planName} plan.
            </Banner>
          ) : null}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Current plan</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-base font-semibold text-fg">{planName}</span>
                  {planKey && planKey !== planName && (
                    <Badge size="xs" tone="outline" className="font-mono">
                      {planKey}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">Monthly limits reset at the start of each billing period.</p>
              </div>
              {canBilling ? changePlan : <Tooltip content="You need the “billing.manage” permission">{<span tabIndex={0}>{changePlan}</span>}</Tooltip>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Plan limits" description="Usage across all websites in this organization." />
            <CardBody className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {metrics.map((m) => (
                <MetricRow key={m.id} metric={m} />
              ))}
            </CardBody>
          </Card>

          <AiUsageCard query={ai} />
        </div>
      )}

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent size="sm">
          <DialogHeader title="Change plan" description="Plan changes aren’t self-serve yet." />
          <DialogBody className="space-y-3 text-sm text-fg-muted">
            <p>
              To upgrade or change the <span className="font-medium text-fg">{planName}</span> plan, contact sales or your platform administrator and include your organization ID.
            </p>
            <Field label="Organization ID">
              <CopyField value={orgId} label="Organization ID" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function listJoin(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function MetricRow({ metric: m }: { metric: UsageMetric }) {
  const r = ratio(m);
  const tone = toneFor(r);
  const pct = r === null ? null : r === Infinity ? 100 : Math.round(r * 100);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg">
          {m.label}
          {m.monthly && <span className="ml-1.5 text-xs text-fg-subtle">this month</span>}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
          <span className="font-medium text-fg">{m.used === undefined ? '—' : m.format(m.used)}</span>
          {' / '}
          {m.limit === null ? 'Unlimited' : m.format(m.limit)}
        </span>
      </div>
      <Progress className="mt-2" value={m.limit === null ? 0 : Math.min(m.used ?? 0, m.limit || 1)} max={m.limit || 1} tone={tone} label={`${m.label} usage`} />
      <div className="mt-1 h-4 text-2xs tabular-nums">
        {pct !== null && m.limit !== null && m.limit > 0 && (
          <span className={tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg-subtle'}>
            {pct}% used{pct >= 100 ? ' · limit reached' : ''}
          </span>
        )}
        {m.limit === 0 && <span className="text-fg-subtle">Not included in this plan</span>}
      </div>
    </div>
  );
}

function AiUsageCard({ query }: { query: UseQueryResult<AiUsage> }) {
  if (query.isPending) {
    return (
      <Card>
        <CardHeader title="AI usage" />
        <CardBody className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </CardBody>
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <CardHeader title="AI usage" />
        <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />
      </Card>
    );
  }
  const d = query.data;
  const requests = n(d.requests) ?? 0;
  const input = n(d.inputTokens) ?? 0;
  const output = n(d.outputTokens) ?? 0;
  const total = input + output;
  const limit = d.limit && typeof d.limit === 'object' ? (d.limit as Record<string, unknown>) : {};
  const reqLimit = n(limit.requests) ?? n(limit.aiRequestsPerMonth) ?? n(limit.aiRequests);
  const tokLimit = n(limit.tokens) ?? n(limit.aiTokensPerMonth) ?? n(limit.aiTokens);
  const period = periodLabel(d.period);
  const inPct = total ? (input / total) * 100 : 0;

  return (
    <Card>
      <CardHeader title="AI usage" description={period ? `Billing period: ${period}` : 'Current billing period'} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Requests" value={formatNumber(requests)} sub={reqLimit !== undefined && reqLimit >= 0 ? `of ${formatNumber(reqLimit)}` : undefined} />
          <Stat label="Input tokens" value={formatCompact(input)} sub={formatNumber(input)} />
          <Stat label="Output tokens" value={formatCompact(output)} sub={formatNumber(output)} />
          <Stat label="Estimated cost" value={formatUsd(n(d.costUsd) ?? 0)} sub="Provider list prices" />
        </div>
        {total > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
              <span>Token mix</span>
              <span className="tabular-nums">
                {formatCompact(total)} total{tokLimit !== undefined && tokLimit >= 0 ? ` of ${formatCompact(tokLimit)}` : ''}
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Input ${Math.round(inPct)}%, output ${Math.round(100 - inPct)}%`}>
              <div className="h-full bg-accent" style={{ width: `${inPct}%` }} />
              <div className="h-full bg-accent/40" style={{ width: `${100 - inPct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center gap-4 text-2xs text-fg-subtle">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-xs bg-accent" /> Input {Math.round(inPct)}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-xs bg-accent/40" /> Output {Math.round(100 - inPct)}%
              </span>
            </div>
          </div>
        )}
        {requests === 0 && <p className="text-xs text-fg-muted">No AI requests in this period yet.</p>}
      </CardBody>
    </Card>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-5 w-32" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid gap-x-8 gap-y-6 p-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
