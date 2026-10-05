'use client';

import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Stat, StatusDot } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Page } from '@/components/common/page';
import { API_BASE_URL, authFetch, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { formatMetric, humanizeKey, isRecord, numericEntries, rec, str } from './narrow';
import { QueueTable } from './queue-table';

interface Readiness {
  status: string;
  checks: Record<string, string>;
  reachable: boolean;
}

/**
 * `/health/ready` answers 503 with the failing checks in the body, which the
 * SDK would collapse into a generic error — read it raw so we can show them.
 */
async function fetchReadiness(): Promise<Readiness> {
  try {
    const res = await authFetch(`${API_BASE_URL}/health/ready`, { headers: { Accept: 'application/json' } });
    const body = rec(await res.json().catch(() => ({})));
    const checks: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec(body.checks))) checks[k] = str(v, 'unknown');
    return { status: str(body.status, res.ok ? 'ok' : 'degraded'), checks, reachable: true };
  } catch {
    return { status: 'unreachable', checks: {}, reachable: false };
  }
}

export function AdminOverview() {
  const api = useApi();
  const overview = useQuery({ queryKey: qk.admin('overview'), queryFn: () => api.admin.overview(), refetchInterval: 60_000 });
  const health = useQuery({ queryKey: qk.admin('health'), queryFn: fetchReadiness, refetchInterval: 30_000 });
  const jobs = useQuery({ queryKey: qk.admin('jobs'), queryFn: () => api.admin.jobs(), refetchInterval: 15_000 });

  const data = rec(overview.data);
  // Root-level numbers first, then one section per nested numeric group.
  const rootStats = numericEntries(data);
  const groups = Object.entries(data)
    .filter(([k, v]) => k !== 'health' && isRecord(v) && numericEntries(v).length > 0)
    .map(([k, v]) => ({ key: k, stats: numericEntries(v) }));
  const sections = [...(rootStats.length ? [{ key: 'totals', stats: rootStats }] : []), ...groups];

  const overviewHealth = rec(data.health);
  const checks: Array<[string, string]> = Object.entries(health.data?.checks ?? {});
  if (!checks.some(([k]) => k === 'database') && typeof overviewHealth.database === 'string') checks.unshift(['database', overviewHealth.database]);

  return (
    <Page width="wide">
      <PageHeader
        title="Platform overview"
        description="Usage across every organization, system health and background job queues."
        actions={
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<RefreshCw />}
            loading={overview.isRefetching || health.isRefetching || jobs.isRefetching}
            onClick={() => {
              void overview.refetch();
              void health.refetch();
              void jobs.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />

      <div className="space-y-8">
        {overview.isPending ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px]" />
            ))}
          </div>
        ) : overview.isError ? (
          <Card>
            <ErrorState description={overview.error.message} onRetry={() => void overview.refetch()} />
          </Card>
        ) : sections.length === 0 ? (
          <Card>
            <EmptyState compact title="No metrics reported" description="The overview endpoint returned no numeric counters." />
          </Card>
        ) : (
          sections.map((s) => (
            <section key={s.key}>
              <h2 className="mb-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{s.key === 'counts' || s.key === 'totals' ? 'Platform' : humanizeKey(s.key)}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {s.stats.map(([k, v]) => (
                  <Stat key={k} label={humanizeKey(k)} value={formatMetric(k, v)} />
                ))}
              </div>
            </section>
          ))
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader
              title="System health"
              description="Readiness checks from the API"
              actions={
                health.data && (
                  <StatusDot tone={health.data.status === 'ok' ? 'success' : 'danger'} label={<span className="text-xs text-fg-muted">{health.data.status === 'ok' ? 'Operational' : health.data.reachable ? 'Degraded' : 'Unreachable'}</span>} />
                )
              }
            />
            {health.isPending ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : checks.length === 0 ? (
              <EmptyState compact icon={<Activity />} title={health.data?.reachable === false ? 'API unreachable' : 'No checks reported'} description={health.data?.reachable === false ? 'The readiness endpoint did not respond.' : undefined} />
            ) : (
              <ul className="divide-y divide-border">
                {checks.map(([k, v]) => (
                  <li key={k} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <StatusDot tone={v === 'ok' ? 'success' : 'danger'} label={<span className="text-sm text-fg">{humanizeKey(k)}</span>} />
                    <span className={v === 'ok' ? 'text-xs text-fg-muted' : 'max-w-[60%] break-words text-right text-xs text-danger'}>{v === 'ok' ? 'OK' : v}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-sm font-semibold text-fg">Queues</h2>
                <p className="mt-0.5 text-xs text-fg-muted">Refreshes every 15 seconds</p>
              </div>
              <Button size="xs" variant="link" asChild>
                <Link href="/admin/jobs">View failed jobs</Link>
              </Button>
            </div>
            {jobs.isPending ? (
              <Skeleton className="h-48" />
            ) : jobs.isError ? (
              <Card>
                <ErrorState description={jobs.error.message} onRetry={() => void jobs.refetch()} />
              </Card>
            ) : jobs.data.length === 0 ? (
              <Card>
                <EmptyState compact title="No queues registered" />
              </Card>
            ) : (
              <QueueTable queues={jobs.data} />
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}
