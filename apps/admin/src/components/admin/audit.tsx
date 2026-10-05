'use client';

import type { AuditLogEntry } from '@atrium/sdk';
import { Badge, DescriptionList, EmptyState, ErrorState, Input, PageHeader, Table, TableContainer, TBody, TD, TH, THead, TR, type BadgeTone } from '@atrium/ui';
import { ChevronDown, ChevronRight, History, Search } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Page } from '@/components/common/page';
import { useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { display, isRecord, rec, str } from './narrow';
import { JsonBlock, LoadMore, TableSkeleton, useAdminList } from './parts';

const ACTOR_TONE: Record<string, BadgeTone> = { USER: 'neutral', AI: 'accent', SYSTEM: 'outline', API: 'warning' };

/** Known fields shown in the row; anything else goes in the expanded details. */
const ROW_FIELDS = new Set(['id', 'action', 'summary', 'actorType', 'actorName', 'createdAt', 'metadata']);

export function AdminAudit() {
  const api = useApi();
  const [action, setAction] = useState('');
  const debounced = useDebounced(action.trim(), 300);
  const list = useAdminList<AuditLogEntry>('audit', { action: debounced || undefined }, (q) => api.admin.auditLogs(q));
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = list.items.filter((e) => isRecord(e) && typeof e.id === 'string');

  return (
    <Page width="wide">
      <PageHeader title="Audit logs" description="Security-relevant actions across every organization, newest first." />
      <div className="mb-4 flex items-center gap-2">
        <Input size="sm" prefix={<Search />} placeholder="Filter by action prefix, e.g. platform." aria-label="Filter by action prefix" value={action} onChange={(e) => setAction(e.target.value)} className="w-80 max-w-full font-mono text-xs" />
      </div>
      {list.isPending ? (
        <TableSkeleton cols={5} rows={10} />
      ) : list.isError ? (
        <TableContainer>
          <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
        </TableContainer>
      ) : items.length === 0 ? (
        <TableContainer>
          <EmptyState compact icon={<History />} title={debounced ? 'No matching entries' : 'No audit entries yet'} description={debounced ? `Nothing starts with “${debounced}”.` : undefined} />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH className="w-8">
                    <span className="sr-only">Expand</span>
                  </TH>
                  <TH className="w-32">Time</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH className="hidden lg:table-cell">Summary</TH>
                  <TH className="hidden md:table-cell">Resource</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((e) => {
                  const r = e as unknown as Record<string, unknown>;
                  const open = expanded === e.id;
                  const extra = Object.entries(r).filter(([k, v]) => !ROW_FIELDS.has(k) && v !== null && v !== undefined && v !== '');
                  const metadata = rec(r.metadata);
                  return (
                    <Fragment key={e.id}>
                      <TR interactive onClick={() => setExpanded(open ? null : e.id)} selected={open}>
                        <TD className="text-fg-subtle">
                          <button type="button" aria-expanded={open} aria-label={open ? 'Collapse entry' : 'Expand entry'} className="inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(ev) => (ev.stopPropagation(), setExpanded(open ? null : e.id))}>
                            {open ? <ChevronDown className="size-4" strokeWidth={1.5} /> : <ChevronRight className="size-4" strokeWidth={1.5} />}
                          </button>
                        </TD>
                        <TD muted>
                          <span title={formatDateTime(str(r.createdAt))}>{timeAgo(str(r.createdAt))}</span>
                        </TD>
                        <TD>
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-fg">{str(r.actorName) || (str(r.actorType) === 'SYSTEM' ? 'System' : 'Unknown')}</span>
                            {str(r.actorType) && str(r.actorType) !== 'USER' && (
                              <Badge tone={ACTOR_TONE[str(r.actorType)] ?? 'neutral'} size="xs">
                                {str(r.actorType)}
                              </Badge>
                            )}
                          </div>
                        </TD>
                        <TD mono className="text-fg">
                          {str(r.action)}
                        </TD>
                        <TD muted className="hidden max-w-[360px] truncate lg:table-cell" title={str(r.summary)}>
                          {str(r.summary) || '—'}
                        </TD>
                        <TD className="hidden md:table-cell">
                          <span className="text-xs text-fg-muted">{str(r.resourceType) || '—'}</span>
                          {str(r.resourceId) && <span className="ml-1.5 font-mono text-2xs text-fg-subtle">{str(r.resourceId).slice(0, 12)}</span>}
                        </TD>
                      </TR>
                      {open && (
                        <tr className="bg-surface-2/40">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Details</div>
                                <DescriptionList
                                  items={[
                                    { label: 'Time', value: formatDateTime(str(r.createdAt)) },
                                    { label: 'Summary', value: str(r.summary) || '—' },
                                    ...extra.map(([k, v]) => ({ label: k, value: <span className="break-all font-mono text-xs">{display(v)}</span> })),
                                  ]}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Metadata</div>
                                {Object.keys(metadata).length > 0 ? <JsonBlock value={metadata} /> : <p className="py-2 text-xs text-fg-subtle">No metadata recorded.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </>
      )}
    </Page>
  );
}
