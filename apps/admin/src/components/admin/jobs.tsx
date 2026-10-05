'use client';

import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Table, TableContainer, TBody, TD, TH, THead, TR, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, CircleCheck, RefreshCw, RotateCcw } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, formatNumber, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { arr, num, rec, str } from './narrow';
import { QueueTable } from './queue-table';

interface FailedJob {
  id: string;
  name: string;
  reason: string;
  attempts: number;
  timestamp: number | null;
}

function failedOf(v: unknown): FailedJob[] {
  return arr(v)
    .map((j) => {
      const r = rec(j);
      const ts = num(r.timestamp, NaN);
      return { id: str(r.id), name: str(r.name, 'job'), reason: str(r.failedReason, 'No reason recorded'), attempts: num(r.attemptsMade), timestamp: Number.isFinite(ts) ? ts : null };
    })
    .filter((j) => j.id);
}

export function AdminJobs() {
  const api = useApi();
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: qk.admin('jobs'), queryFn: () => api.admin.jobs(), refetchInterval: 10_000 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retried, setRetried] = useState<Set<string>>(new Set());

  const retry = useMutation({
    mutationFn: ({ queue, id }: { queue: string; id: string }) => api.admin.retryJob(queue, id),
    onSuccess: (_r, { queue, id }) => {
      setRetried((s) => new Set(s).add(`${queue}:${id}`));
      toast.success('Job re-queued');
      void qc.invalidateQueries({ queryKey: qk.admin('jobs') });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not retry job')),
  });

  const queues = (jobs.data ?? []).map((q) => ({ queue: str(q.queue, 'unknown'), counts: rec(q.counts), failed: failedOf(q.failed) }));
  const totalFailed = queues.reduce((n, q) => n + q.failed.length, 0);

  return (
    <Page width="wide">
      <PageHeader
        title="Jobs"
        description="Background queues for publishing, deployments, emails, webhooks and AI. Refreshes every 10 seconds."
        actions={
          <Button size="sm" variant="ghost" leadingIcon={<RefreshCw />} loading={jobs.isRefetching} onClick={() => void jobs.refetch()}>
            Refresh
          </Button>
        }
      />
      {jobs.isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      ) : jobs.isError ? (
        <Card>
          <ErrorState description={jobs.error.message} onRetry={() => void jobs.refetch()} />
        </Card>
      ) : queues.length === 0 ? (
        <Card>
          <EmptyState compact title="No queues registered" description="The API reported no background queues." />
        </Card>
      ) : (
        <div className="space-y-8">
          <QueueTable queues={queues} onSelect={(q) => document.getElementById(`queue-${q}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-fg">Failed jobs</h2>
              <p className="mt-0.5 text-xs text-fg-muted">The 25 most recent failures per queue.</p>
            </div>
            {totalFailed === 0 ? (
              <Card>
                <EmptyState compact icon={<CircleCheck />} title="No failed jobs" description="Every queue is healthy." />
              </Card>
            ) : (
              <div className="space-y-6">
                {queues
                  .filter((q) => q.failed.length > 0)
                  .map((q) => (
                    <div key={q.queue} id={`queue-${q.queue}`} className="scroll-mt-20">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-fg">{q.queue}</span>
                        <Badge tone="danger">{formatNumber(num(q.counts.failed, q.failed.length))} failed</Badge>
                      </div>
                      <TableContainer>
                        <Table className="table-fixed">
                          <THead>
                            <tr>
                              <TH className="w-8">
                                <span className="sr-only">Expand</span>
                              </TH>
                              <TH className="w-48">Job</TH>
                              <TH>Reason</TH>
                              <TH align="right" className="w-24">
                                Attempts
                              </TH>
                              <TH align="right" className="w-28">
                                Failed
                              </TH>
                              <TH className="w-24">
                                <span className="sr-only">Actions</span>
                              </TH>
                            </tr>
                          </THead>
                          <TBody>
                            {q.failed.map((j) => {
                              const k = `${q.queue}:${j.id}`;
                              const open = expanded === k;
                              const done = retried.has(k);
                              return (
                                <Fragment key={k}>
                                  <TR interactive onClick={() => setExpanded(open ? null : k)}>
                                    <TD className="text-fg-subtle">
                                      <button type="button" aria-expanded={open} aria-label={open ? 'Collapse reason' : 'Expand reason'} className="inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(e) => (e.stopPropagation(), setExpanded(open ? null : k))}>
                                        {open ? <ChevronDown className="size-4" strokeWidth={1.5} /> : <ChevronRight className="size-4" strokeWidth={1.5} />}
                                      </button>
                                    </TD>
                                    <TD>
                                      <div className="truncate font-mono text-xs text-fg">{j.name}</div>
                                      <div className="truncate font-mono text-2xs text-fg-subtle">#{j.id}</div>
                                    </TD>
                                    <TD className="truncate text-danger" title={j.reason}>
                                      {j.reason}
                                    </TD>
                                    <TD align="right" muted>
                                      {j.attempts}
                                    </TD>
                                    <TD align="right" muted>
                                      {j.timestamp ? <span title={formatDateTime(j.timestamp)}>{timeAgo(j.timestamp)}</span> : '—'}
                                    </TD>
                                    <TD align="right" onClick={(e) => e.stopPropagation()}>
                                      <Button size="xs" variant="secondary" leadingIcon={<RotateCcw />} disabled={done} loading={retry.isPending && retry.variables?.id === j.id && retry.variables.queue === q.queue} onClick={() => retry.mutate({ queue: q.queue, id: j.id })}>
                                        {done ? 'Queued' : 'Retry'}
                                      </Button>
                                    </TD>
                                  </TR>
                                  {open && (
                                    <tr className="bg-surface-2/40">
                                      <td colSpan={6} className="px-3 py-3">
                                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-fg">{j.reason}</pre>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </TBody>
                        </Table>
                      </TableContainer>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
