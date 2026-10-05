'use client';

import { Card, EmptyState, ErrorState, Input, PageHeader, Skeleton, Stat, Table, TableContainer, TBody, TD, TH, THead, TR, nextSort, sortRows, type SortState } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { Bot, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { display, formatMetric, humanizeKey, isIdKey, isRecord, rec, str, type Row } from './narrow';
import { TableSkeleton } from './parts';

/** Preferred column order; any other keys follow in first-seen order. */
const ORDER = ['organization', 'org', 'period', 'provider', 'model', 'requests', 'inputTokens', 'outputTokens', 'tokens', 'imageGenerations', 'costUsd', 'cost'];

function cellText(v: unknown): string {
  if (isRecord(v)) return str(v.name, display(v));
  return display(v);
}

export function AdminAiUsage() {
  const api = useApi();
  const q = useQuery({ queryKey: qk.admin('ai-usage'), queryFn: () => api.admin.aiUsage() });
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortState>(null);

  const rows: Row[] = useMemo(() => (Array.isArray(q.data) ? q.data.map(rec) : []), [q.data]);

  const columns = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) if (!isIdKey(k)) seen.add(k);
    const keys = [...seen];
    return keys.sort((a, b) => {
      const ia = ORDER.indexOf(a);
      const ib = ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [rows]);

  const numeric = useMemo(() => new Set(columns.filter((c) => rows.some((r) => typeof r[c] === 'number') && rows.every((r) => r[c] === undefined || r[c] === null || typeof r[c] === 'number'))), [columns, rows]);

  const totals = useMemo(() => [...numeric].map((c) => [c, rows.reduce((n, r) => n + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0)] as const), [numeric, rows]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? rows.filter((r) => columns.some((c) => !numeric.has(c) && cellText(r[c]).toLowerCase().includes(f))) : rows;
    return sortRows(list, sort, (r, k) => (numeric.has(k) ? r[k] : cellText(r[k])));
  }, [rows, filter, columns, numeric, sort]);

  return (
    <Page width="wide">
      <PageHeader title="AI usage" description="Requests, tokens and cost by organization and billing period." />
      {q.isPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px]" />
            ))}
          </div>
          <TableSkeleton cols={6} />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Bot />} title="No AI usage recorded" description="Usage appears here once organizations generate sites or rewrite content with AI." />
        </Card>
      ) : (
        <div className="space-y-4">
          {totals.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {totals.slice(0, 8).map(([k, v]) => (
                <Stat key={k} label={`Total ${humanizeKey(k).toLowerCase()}`} value={formatMetric(k, v, true)} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input size="sm" prefix={<Search />} placeholder="Filter rows" aria-label="Filter rows" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64" />
            <span className="text-xs text-fg-subtle">
              {visible.length} of {rows.length} rows
            </span>
          </div>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  {columns.map((c) => (
                    <TH key={c} align={numeric.has(c) ? 'right' : 'left'} sortable sorted={sort?.key === c && sort.dir} onSort={() => setSort((s) => nextSort(s, c))}>
                      {humanizeKey(c)}
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {visible.map((r, i) => (
                  <TR key={i}>
                    {columns.map((c, ci) => (
                      <TD key={c} align={numeric.has(c) ? 'right' : 'left'} muted={ci > 0 && !numeric.has(c)} className={ci === 0 ? 'font-medium text-fg' : undefined}>
                        {numeric.has(c) && typeof r[c] === 'number' ? formatMetric(c, r[c] as number) : cellText(r[c])}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </div>
      )}
    </Page>
  );
}
