'use client';

import type { SeoReport } from '@atrium/sdk';
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  Input,
  nextSort,
  SegmentedControl,
  Skeleton,
  sortRows,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type SortState,
} from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileSearch, PenTool, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { AiSuggestionsDialog } from './ai-suggestions-dialog';
import { issueCounts, ScoreBar, scoreTone, ScoreValue, SeoChecklist } from './score';

export interface SeoPageRow {
  pageId: string;
  title: string;
  slug: string;
  report: SeoReport;
}

export function useSeoReports(websiteId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.seo(websiteId), queryFn: () => api.websites.seo(websiteId) });
}

type Filter = 'all' | 'attention';

export function SeoOverview({ websiteId }: { websiteId: string }) {
  const { can } = useSession();
  const q = useSeoReports(websiteId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'score', dir: 'asc' });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [aiPage, setAiPage] = useState<SeoPageRow | null>(null);
  const canAi = can('ai.use', websiteId);

  const all = useMemo<SeoPageRow[]>(() => (Array.isArray(q.data) ? q.data.filter((r) => r && r.report) : []), [q.data]);
  const summary = useMemo(() => {
    const scores = all.map((r) => r.report.score ?? 0);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return {
      avg,
      good: scores.filter((s) => s >= 90).length,
      ok: scores.filter((s) => s >= 70 && s < 90).length,
      poor: scores.filter((s) => s < 70).length,
      issues: all.reduce((n, r) => n + issueCounts(r.report).fail, 0),
    };
  }, [all]);

  const rows = useMemo(() => {
    const f = search.trim().toLowerCase();
    const list = all.filter((r) => (filter === 'all' || r.report.score < 90) && (!f || r.title.toLowerCase().includes(f) || r.slug.includes(f)));
    return sortRows(list, sort ?? { key: 'score', dir: 'asc' }, (r, k) => (k === 'score' ? r.report.score : k === 'title' ? r.title.toLowerCase() : issueCounts(r.report).fail * 10 + issueCounts(r.report).warn));
  }, [all, filter, search, sort]);

  if (q.isPending) return <OverviewSkeleton />;
  if (q.isError) return <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />;
  if (all.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border-strong">
        <EmptyState icon={<FileSearch />} title="No pages to analyze" description="Create a page and its SEO checks will appear here." action={<Button size="sm" asChild><Link href={`/w/${websiteId}/pages`}>Go to pages</Link></Button>} />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3 sm:col-span-2 lg:col-span-1">
          <div className="text-xs text-fg-muted">Site average</div>
          <div className="mt-1 flex items-baseline gap-1 text-xl font-semibold tracking-tight">
            <ScoreValue score={summary.avg} />
          </div>
          <ScoreBar score={summary.avg} className="mt-2 w-full" />
        </div>
        <SummaryTile label="Good" value={summary.good} sub="Score 90 or above" tone="success" />
        <SummaryTile label="Needs work" value={summary.ok} sub="Score 70–89" tone="warning" />
        <SummaryTile label="Poor" value={summary.poor} sub={`${summary.issues} failing ${summary.issues === 1 ? 'check' : 'checks'}`} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input size="sm" prefix={<Search />} placeholder="Search pages" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" aria-label="Search pages" />
        <SegmentedControl
          size="sm"
          aria-label="Filter pages"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'all', label: `All ${all.length}` },
            { value: 'attention', label: `Needs attention ${summary.ok + summary.poor}` },
          ]}
        />
      </div>

      <TableContainer>
        <Table>
          <THead>
            <TR>
              <TH className="w-8" aria-label="Expand" />
              <TH sortable sorted={sort?.key === 'title' ? sort.dir : false} onSort={() => setSort((s) => nextSort(s, 'title'))}>
                Page
              </TH>
              <TH sortable sorted={sort?.key === 'score' ? sort.dir : false} onSort={() => setSort((s) => nextSort(s, 'score'))} className="w-44">
                Score
              </TH>
              <TH sortable sorted={sort?.key === 'issues' ? sort.dir : false} onSort={() => setSort((s) => nextSort(s, 'issues'))} className="hidden w-40 md:table-cell">
                Issues
              </TH>
              <TH align="right" className="w-44">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={5}>
                  <p className="py-6 text-center text-sm text-fg-muted">{filter === 'attention' && !search ? 'Every page scores 90 or above.' : 'No pages match.'}</p>
                </TD>
              </TR>
            ) : (
              rows.map((r) => {
                const open = expanded === r.pageId;
                const { fail, warn } = issueCounts(r.report);
                return (
                  <Fragment key={r.pageId}>
                    <TR interactive selected={open} onClick={() => setExpanded(open ? null : r.pageId)} className="cursor-pointer">
                      <TD className="pr-0">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={open ? `Hide checks for ${r.title}` : `Show checks for ${r.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(open ? null : r.pageId);
                          }}
                          className="inline-flex size-6 items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} strokeWidth={1.5} />
                        </button>
                      </TD>
                      <TD>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-fg">{r.title}</div>
                          <div className="truncate font-mono text-xs text-fg-subtle">/{r.slug}</div>
                        </div>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ScoreValue score={r.report.score} className="w-14 text-sm" />
                          <ScoreBar score={r.report.score} />
                        </div>
                      </TD>
                      <TD muted className="hidden md:table-cell">
                        {fail === 0 && warn === 0 ? (
                          <span className="text-success">All checks pass</span>
                        ) : (
                          <span className="tabular-nums">
                            {fail > 0 && <span className="text-danger">{fail} failing</span>}
                            {fail > 0 && warn > 0 && <span className="text-fg-subtle"> · </span>}
                            {warn > 0 && <span>{warn} {warn === 1 ? 'warning' : 'warnings'}</span>}
                          </span>
                        )}
                      </TD>
                      <TD align="right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {canAi && (
                            <Button size="xs" variant="ghost" leadingIcon={<Sparkles />} onClick={() => setAiPage(r)}>
                              AI suggestions
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                    {open && (
                      <tr className="border-b border-border bg-surface-2/40">
                        <td colSpan={5} className="px-4 pb-3 pt-1">
                          <div className="grid gap-4 pl-8 lg:grid-cols-[minmax(0,1fr)_220px]">
                            <SeoChecklist report={r.report} />
                            <div className="space-y-2 pt-2 text-xs text-fg-muted">
                              <p>Scores are calculated from the current draft. Publish to apply fixes to the live site.</p>
                              <div className="flex flex-wrap gap-1.5">
                                <Button size="xs" leadingIcon={<PenTool />} asChild>
                                  <Link href={`/w/${websiteId}/editor?page=${encodeURIComponent(r.pageId)}`}>Open in editor</Link>
                                </Button>
                                {canAi && (
                                  <Button size="xs" variant="ghost" leadingIcon={<Sparkles />} onClick={() => setAiPage(r)}>
                                    Suggest fixes
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </TBody>
        </Table>
      </TableContainer>

      <AiSuggestionsDialog websiteId={websiteId} page={aiPage} open={!!aiPage} onOpenChange={(o) => !o && setAiPage(null)} />
    </div>
  );
}

function SummaryTile({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: ReturnType<typeof scoreTone> }) {
  const dot = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>
      <div className="mt-0.5 truncate text-xs text-fg-subtle">{sub}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-16" />
            <Skeleton className="mt-2 h-1 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-7 w-72" />
      <div className="rounded-lg border border-border bg-surface">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
            <Skeleton className="size-4" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="hidden h-3.5 w-24 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
