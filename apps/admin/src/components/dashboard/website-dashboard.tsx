'use client';

import type { ActivityItem, AiGenerationSummary, Dashboard, Deployment } from '@atrium/sdk';
import { Avatar, Badge, Button, Card, CardHeader, cn, DescriptionList, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, Stat, type BadgeTone } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bot, ExternalLink, History, PenTool, Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sparkline } from '@/components/common/charts';
import { Page } from '@/components/common/page';
import { Can } from '@/components/common/permission';
import { DeploymentStatus, WebsiteStatusBadge } from '@/components/common/status';
import { useApi } from '@/lib/api';
import { formatCompact, formatDateTime, formatMb, formatNumber, formatUsd, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { PreviewLinkButton } from './preview-link-button';
import { PublishButton } from './publish-action';

const stripProtocol = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

export function WebsiteDashboard({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const { website } = useWebsite();
  const { can } = useSession();
  const q = useQuery({ queryKey: qk.dashboard(websiteId), queryFn: () => api.websites.dashboard(websiteId), staleTime: 30_000 });

  const needsActivity = q.isSuccess && (q.data.recentEdits?.length ?? 0) === 0;
  const activity = useQuery({ queryKey: qk.activity(websiteId), queryFn: () => api.websites.activity(websiteId), enabled: needsActivity, staleTime: 30_000 });

  const d = q.data;
  const productionUrl = d?.productionUrl ?? (website?.publishedAt ? website.platformUrl : null);
  const status = d?.status ?? website?.status;
  const base = `/w/${websiteId}`;

  return (
    <Page width="wide">
      <PageHeader
        title={website?.name ?? 'Website'}
        meta={
          <>
            {status && <WebsiteStatusBadge status={status} />}
            {productionUrl ? (
              <a href={productionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring">
                {stripProtocol(productionUrl)}
                <ExternalLink className="size-3" strokeWidth={1.5} />
              </a>
            ) : (
              <span className="text-fg-subtle">Not published yet</span>
            )}
            {website?.publishedAt && <span className="text-fg-subtle" title={formatDateTime(website.publishedAt)}>· Published {timeAgo(website.publishedAt)}</span>}
          </>
        }
        actions={
          <>
            <Can permission="page.update" websiteId={websiteId}>
              <Button size="sm" asChild>
                <Link href={`${base}/editor`}>
                  <PenTool />
                  Edit
                </Link>
              </Button>
            </Can>
            <PreviewLinkButton websiteId={websiteId} />
            <PublishButton websiteId={websiteId} />
          </>
        }
      />

      {q.isPending ? (
        <DashboardSkeleton />
      ) : q.isError ? (
        <Card>
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        d && (
          <div className="space-y-4">
            <KpiRow d={d} base={base} canSubmissions={can('submission.read', websiteId)} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-4">
                <DeploymentsPanel deployments={d.deployments ?? []} base={base} />
                <AiPanel items={d.aiGenerations ?? []} />
              </div>
              <div className="min-w-0 space-y-4">
                <SitePanel d={d} platformUrl={website?.platformUrl ?? null} base={base} canDomains={can('domain.manage', websiteId)} />
                <ActivityPanel
                  items={(d.recentEdits?.length ?? 0) > 0 ? d.recentEdits : (activity.data?.items ?? [])}
                  loading={needsActivity && activity.isPending}
                  error={needsActivity && activity.isError ? () => void activity.refetch() : undefined}
                />
              </div>
            </div>
          </div>
        )
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ KPIs */

function StatLink({ href, children, label }: { href?: string; children: ReactNode; label: string }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} aria-label={label} className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </Link>
  );
}

function KpiRow({ d, base, canSubmissions }: { d: Dashboard; base: string; canSubmissions: boolean }) {
  const series = d.traffic?.series ?? [];
  const conv = d.conversionRate;
  const seo = d.seoScore;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Visitors · 7d" value={formatCompact(d.traffic?.visitors7d ?? 0)}>
        <Sparkline values={series.map((s) => s.visitors)} height={24} className="mt-2" />
      </Stat>
      <Stat label="Pageviews · 7d" value={formatCompact(d.traffic?.pageviews7d ?? 0)}>
        <Sparkline values={series.map((s) => s.pageviews)} height={24} className="mt-2" strokeClass="stroke-fg-subtle" />
      </Stat>
      <StatLink href={canSubmissions ? `${base}/submissions` : undefined} label="View submissions">
        <Stat
          className="h-full transition-colors group-hover:border-border-strong"
          label={
            <span className="flex items-center justify-between">
              New submissions
              {canSubmissions && <ArrowUpRight className="size-3.5 text-fg-subtle transition-colors group-hover:text-fg" strokeWidth={1.5} />}
            </span>
          }
          value={formatNumber(d.submissions?.new ?? 0)}
          sub={`${formatNumber(d.submissions?.total7d ?? 0)} in the last 7 days`}
        />
      </StatLink>
      {/* API returns a percentage (e.g. 3.4), not a ratio. */}
      <Stat label="Conversion rate" value={`${(Number.isFinite(conv) ? conv : 0).toFixed(1)}%`} sub="Visitors who converted · 7d" />
      <StatLink href={`${base}/seo`} label="View SEO report">
        <Stat
          className="h-full transition-colors group-hover:border-border-strong"
          label={
            <span className="flex items-center justify-between">
              SEO score
              <ArrowUpRight className="size-3.5 text-fg-subtle transition-colors group-hover:text-fg" strokeWidth={1.5} />
            </span>
          }
          value={
            seo === null || seo === undefined ? (
              <span className="text-fg-subtle">—</span>
            ) : (
              <span className={cn(seo >= 80 ? 'text-success' : seo >= 50 ? 'text-warning' : 'text-danger')}>
                {Math.round(seo)}
                <span className="text-sm font-normal text-fg-subtle">/100</span>
              </span>
            )
          }
          sub={seo === null || seo === undefined ? 'Not analyzed yet' : seo >= 80 ? 'Good' : seo >= 50 ? 'Needs work' : 'Poor'}
        />
      </StatLink>
      <Stat label="Storage" value={formatMb(d.storageMb ?? 0)} sub="Media used by this site" />
    </div>
  );
}

/* ---------------------------------------------------------------- Panels */

function SitePanel({ d, platformUrl, base, canDomains }: { d: Dashboard; platformUrl: string | null; base: string; canDomains: boolean }) {
  const dep = d.lastDeployment;
  return (
    <Card>
      <CardHeader title="Domain & deployment" />
      <div className="px-4 py-1">
        <DescriptionList
          items={[
            {
              label: 'Primary domain',
              value: d.primaryDomain ? (
                <a href={`https://${d.primaryDomain}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 hover:underline">
                  <span className="truncate">{d.primaryDomain}</span>
                  <ExternalLink className="size-3 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                </a>
              ) : canDomains ? (
                <Link href={`${base}/domains`} className="text-accent hover:underline">
                  Connect a domain
                </Link>
              ) : (
                <span className="text-fg-subtle">None</span>
              ),
            },
            {
              label: 'Platform URL',
              value: platformUrl ? (
                <a href={platformUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-fg-muted hover:text-fg hover:underline">
                  <span className="truncate">{stripProtocol(platformUrl)}</span>
                  <ExternalLink className="size-3 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                </a>
              ) : (
                '—'
              ),
            },
            {
              label: 'Last deployment',
              value: dep ? (
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <DeploymentStatus status={dep.status} />
                    <Badge tone="outline" size="xs">
                      {dep.target === 'PRODUCTION' ? 'Production' : 'Preview'}
                    </Badge>
                  </span>
                  <span className="text-xs text-fg-muted" title={formatDateTime(dep.createdAt)}>
                    {timeAgo(dep.createdAt)}
                    {dep.versionNumber ? ` · v${dep.versionNumber}` : ''}
                  </span>
                </span>
              ) : (
                <span className="text-fg-subtle">Never deployed</span>
              ),
            },
            {
              label: 'Last edited',
              value: d.lastEditor ? (
                <span className="flex items-center gap-2">
                  <Avatar name={d.lastEditor.name} size="xs" />
                  <span className="min-w-0 truncate">{d.lastEditor.name}</span>
                  <span className="shrink-0 text-xs text-fg-muted" title={formatDateTime(d.lastEditor.at)}>
                    {timeAgo(d.lastEditor.at)}
                  </span>
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
            },
          ]}
        />
      </div>
      <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs">
        <Link href={`${base}/deployments`} className="font-medium text-fg-muted hover:text-fg">
          Deployments
        </Link>
        <Link href={`${base}/domains`} className="font-medium text-fg-muted hover:text-fg">
          Domains
        </Link>
      </div>
    </Card>
  );
}

function DeploymentsPanel({ deployments, base }: { deployments: Deployment[]; base: string }) {
  const rows = deployments.slice(0, 5);
  return (
    <Card>
      <CardHeader
        title="Deployment history"
        actions={
          <Button size="xs" variant="ghost" asChild>
            <Link href={`${base}/deployments`}>View all</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState compact icon={<Rocket />} title="No deployments yet" description="Publishing the site creates the first deployment." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((dep) => (
            <li key={dep.id}>
              <Link href={`${base}/deployments?d=${dep.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 outline-none hover:bg-surface-2/60 focus-visible:bg-surface-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                <DeploymentStatus status={dep.status} />
                <span className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
                  <span className="text-fg">{dep.target === 'PRODUCTION' ? 'Production' : 'Preview'}</span>
                  {dep.versionNumber ? <span className="text-fg-muted">v{dep.versionNumber}</span> : null}
                  {dep.url && <span className="truncate text-xs text-fg-subtle">{stripProtocol(dep.url)}</span>}
                </span>
                <span className="text-right text-xs text-fg-muted" title={formatDateTime(dep.createdAt)}>
                  {timeAgo(dep.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const aiTone: Record<AiGenerationSummary['status'], BadgeTone> = { PENDING: 'neutral', RUNNING: 'warning', SUCCEEDED: 'success', FAILED: 'danger', REVERTED: 'outline' };
const humanize = (s: string) => s.replace(/[_.-]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function AiPanel({ items }: { items: AiGenerationSummary[] }) {
  return (
    <Card>
      <CardHeader title="AI generation history" description="Recent AI requests for this site" />
      {items.length === 0 ? (
        <EmptyState compact icon={<Sparkles />} title="No AI activity yet" description="Generations and edits made with AI show up here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2/60 text-left text-xs text-fg-muted">
              <tr>
                <th className="h-8 px-4 font-medium">Request</th>
                <th className="h-8 px-3 font-medium">Status</th>
                <th className="hidden h-8 px-3 text-right font-medium md:table-cell">Tokens</th>
                <th className="h-8 px-3 text-right font-medium">Cost</th>
                <th className="hidden h-8 px-4 text-right font-medium sm:table-cell">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.slice(0, 8).map((g) => (
                <tr key={g.id}>
                  <td className="max-w-0 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Bot className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                      <span className="shrink-0 text-xs font-medium text-fg-muted">{humanize(g.kind)}</span>
                    </div>
                    <div className="truncate text-fg" title={g.prompt}>
                      {g.prompt || <span className="text-fg-subtle">No prompt</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={aiTone[g.status] ?? 'neutral'}>{humanize(g.status)}</Badge>
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-fg-muted md:table-cell">{formatCompact((g.inputTokens ?? 0) + (g.outputTokens ?? 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{formatUsd(g.costUsd)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-2 text-right text-xs text-fg-muted sm:table-cell" title={formatDateTime(g.createdAt)}>
                    {timeAgo(g.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ActivityPanel({ items, loading, error }: { items: ActivityItem[]; loading: boolean; error?: () => void }) {
  return (
    <Card>
      <CardHeader title="Recent edits" />
      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorState description="Could not load activity." onRetry={error} />
      ) : items.length === 0 ? (
        <EmptyState compact icon={<History />} title="No edits yet" description="Changes from your team, AI and the API appear here." />
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
              {a.actorType === 'AI' ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Sparkles className="size-3" strokeWidth={1.75} />
                </span>
              ) : (
                <Avatar name={a.actorName ?? (a.actorType === 'SYSTEM' ? 'System' : 'API')} size="xs" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{a.summary ?? humanize(a.action)}</p>
                <p className="text-xs text-fg-muted" title={formatDateTime(a.createdAt)}>
                  {a.actorName ?? humanize(a.actorType)} · {timeAgo(a.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- Skeleton */

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {[5, 4].map((n, i) => (
            <Card key={i}>
              <div className="border-b border-border px-4 py-3">
                <Skeleton className="h-4 w-36" />
              </div>
              <SkeletonRows rows={n} />
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          {[4, 5].map((n, i) => (
            <Card key={i}>
              <div className="border-b border-border px-4 py-3">
                <Skeleton className="h-4 w-28" />
              </div>
              <SkeletonRows rows={n} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
