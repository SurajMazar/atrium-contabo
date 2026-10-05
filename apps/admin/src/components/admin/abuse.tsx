'use client';

import { Card, EmptyState, ErrorState, PageHeader, SegmentedControl, Select, Table, TableContainer, TBody, TD, TH, THead, TR, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { rec, str, strOrNull, type Row } from './narrow';
import { TableSkeleton } from './parts';

/** Statuses accepted by PATCH /admin/abuse-reports/:id. */
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
] as const;

type Filter = 'active' | 'closed' | 'all';

export function AdminAbuse() {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.admin('abuse');
  const q = useQuery({ queryKey: key, queryFn: () => api.admin.abuseReports() });
  const [filter, setFilter] = useState<Filter>('active');

  const reports = useMemo(
    () =>
      (Array.isArray(q.data) ? q.data.map(rec) : [])
        .map((r: Row) => ({
          id: str(r.id),
          url: str(r.url),
          reason: str(r.reason, '—'),
          details: strOrNull(r.details),
          reporter: strOrNull(r.reporter),
          status: str(r.status, 'open').toLowerCase(),
          createdAt: str(r.createdAt),
        }))
        .filter((r) => r.id),
    [q.data],
  );
  const closed = (s: string) => s === 'resolved' || s === 'dismissed';
  const visible = reports.filter((r) => (filter === 'all' ? true : filter === 'closed' ? closed(r.status) : !closed(r.status)));
  const openCount = reports.filter((r) => !closed(r.status)).length;

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.admin.updateAbuseReport(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Array<Record<string, unknown>>>(key);
      qc.setQueryData<Array<Record<string, unknown>>>(key, (rows) => rows?.map((r) => (str(r.id) === id ? { ...r, status } : r)));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(err, 'Could not update report'));
    },
    onSuccess: (_r, { status }) => toast.success(`Marked ${STATUSES.find((s) => s.value === status)?.label.toLowerCase() ?? status}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <Page width="wide">
      <PageHeader title="Abuse reports" description="Reports submitted against published websites. Suspend the owning organization from Organizations if needed." />
      <div className="mb-4">
        <SegmentedControl<Filter>
          size="sm"
          aria-label="Filter reports"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'active', label: `Open${openCount ? ` · ${openCount}` : ''}` },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {q.isPending ? (
        <TableSkeleton cols={5} />
      ) : q.isError ? (
        <Card>
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<ShieldCheck />}
            title={reports.length === 0 ? 'No abuse reports' : filter === 'active' ? 'No open reports' : 'No reports in this view'}
            description={reports.length === 0 ? 'Reports from the public “Report this site” link land here.' : undefined}
          />
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Reported URL</TH>
                <TH>Reason</TH>
                <TH className="hidden lg:table-cell">Details</TH>
                <TH className="hidden md:table-cell">Reporter</TH>
                <TH align="right">Received</TH>
                <TH className="w-44">Status</TH>
              </tr>
            </THead>
            <TBody>
              {visible.map((r) => (
                <TR key={r.id}>
                  <TD className="max-w-[280px]">
                    {/^https?:\/\//.test(r.url) ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-fg outline-none hover:underline focus-visible:underline">
                        <span className="truncate">{r.url.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="size-3 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                      </a>
                    ) : (
                      <span className="truncate font-mono text-xs">{r.url || '—'}</span>
                    )}
                  </TD>
                  <TD className="text-fg">{r.reason}</TD>
                  <TD muted className="hidden max-w-[320px] lg:table-cell">
                    <span className="line-clamp-2" title={r.details ?? undefined}>
                      {r.details ?? '—'}
                    </span>
                  </TD>
                  <TD muted className="hidden md:table-cell">
                    {r.reporter ?? 'Anonymous'}
                  </TD>
                  <TD align="right" muted>
                    <span title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                  </TD>
                  <TD>
                    <Select
                      size="sm"
                      aria-label="Report status"
                      value={STATUSES.some((s) => s.value === r.status) ? r.status : undefined}
                      placeholder={r.status}
                      onValueChange={(status) => status !== r.status && update.mutate({ id: r.id, status })}
                      options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Page>
  );
}
