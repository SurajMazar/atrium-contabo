'use client';

import type { WebsiteStatus } from '@atrium/sdk';
import { EmptyState, ErrorState, PageHeader, Table, TableContainer, TBody, TD, TH, THead, TR } from '@atrium/ui';
import { Globe } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { GenericStatus, WebsiteStatusBadge } from '@/components/common/status';
import { useApi } from '@/lib/api';
import { formatDateTime, formatNumber, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { numOrNull, rec, str, strOrNull, type Row } from './narrow';
import { AdminSearch, LoadMore, TableSkeleton, useAdminList } from './parts';

const KNOWN: WebsiteStatus[] = ['DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'];

function toSite(r: Row) {
  const org = r.organization;
  return {
    id: str(r.id),
    name: str(r.name, 'Untitled'),
    slug: str(r.slug),
    status: str(r.status).toUpperCase(),
    organization: typeof org === 'string' ? org : str(rec(org).name, '—'),
    domain: strOrNull(r.primaryDomain) ?? strOrNull(r.domain),
    domains: numOrNull(r.domains),
    pages: numOrNull(r.pages),
    submissions: numOrNull(r.submissions),
    updatedAt: str(r.updatedAt),
  };
}

export function AdminWebsites() {
  const api = useApi();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const list = useAdminList<Row>('websites', { search: debounced || undefined }, (q) => api.admin.websites(q));
  const sites = list.items.map(toSite).filter((s) => s.id);

  return (
    <Page width="wide">
      <PageHeader title="Websites" description="Every website across all organizations, most recently updated first." />
      <div className="mb-4">
        <AdminSearch value={search} onChange={setSearch} placeholder="Search by name or slug" />
      </div>
      {list.isPending ? (
        <TableSkeleton cols={6} />
      ) : list.isError ? (
        <TableContainer>
          <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
        </TableContainer>
      ) : sites.length === 0 ? (
        <TableContainer>
          <EmptyState compact icon={<Globe />} title={debounced ? 'No websites match' : 'No websites yet'} description={debounced ? 'Try a different name or slug.' : undefined} />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Website</TH>
                  <TH>Organization</TH>
                  <TH>Status</TH>
                  <TH>Domain</TH>
                  <TH align="right" className="hidden md:table-cell">
                    Pages
                  </TH>
                  <TH align="right" className="hidden md:table-cell">
                    Submissions
                  </TH>
                  <TH align="right">Updated</TH>
                </tr>
              </THead>
              <TBody>
                {sites.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <div className="font-medium text-fg">{s.name}</div>
                      <div className="font-mono text-xs text-fg-subtle">{s.slug}</div>
                    </TD>
                    <TD muted>{s.organization}</TD>
                    <TD>{(KNOWN as string[]).includes(s.status) ? <WebsiteStatusBadge status={s.status as WebsiteStatus} /> : <GenericStatus value={s.status || 'unknown'} />}</TD>
                    <TD muted className="max-w-[220px] truncate">
                      {s.domain ?? (s.domains !== null ? (s.domains === 0 ? 'Platform URL' : `${formatNumber(s.domains)} custom ${s.domains === 1 ? 'domain' : 'domains'}`) : '—')}
                    </TD>
                    <TD align="right" muted className="hidden md:table-cell">
                      {s.pages === null ? '—' : formatNumber(s.pages)}
                    </TD>
                    <TD align="right" muted className="hidden md:table-cell">
                      {s.submissions === null ? '—' : formatNumber(s.submissions)}
                    </TD>
                    <TD align="right" muted>
                      <span title={formatDateTime(s.updatedAt)}>{timeAgo(s.updatedAt)}</span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </>
      )}
    </Page>
  );
}
