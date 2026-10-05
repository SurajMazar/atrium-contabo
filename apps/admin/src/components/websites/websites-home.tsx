'use client';

import type { WebsiteSummary } from '@atrium/sdk';
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  nextSort,
  sortRows,
  type SortState,
} from '@atrium/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, LayoutGrid, List, Plus, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { WebsiteStatusBadge } from '@/components/common/status';
import { useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

const VIEW_KEY = 'atrium.websites.view';

export function WebsitesHome() {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const { currentOrg, memberships, can } = useSession();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'updatedAt', dir: 'desc' });

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'grid' || v === 'list') setView(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (memberships.length === 0) router.replace('/onboarding');
  }, [memberships.length, router]);

  const q = useQuery({ queryKey: qk.websites(currentOrg?.id ?? ''), queryFn: () => api.websites.list(currentOrg!.id), enabled: !!currentOrg });

  const rows = useMemo(() => {
    const f = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((w) => !f || w.name.toLowerCase().includes(f) || w.slug.includes(f) || (w.primaryDomain ?? '').includes(f));
    return sortRows(list, sort ?? { key: 'updatedAt', dir: 'desc' }, (r, k) => (r as unknown as Record<string, unknown>)[k]);
  }, [q.data, search, sort]);

  const prefetch = (w: WebsiteSummary) => {
    void qc.prefetchQuery({ queryKey: qk.dashboard(w.id), queryFn: () => api.websites.dashboard(w.id), staleTime: 30_000 });
  };

  const canCreate = can('website.create');
  const setViewPersist = (v: 'grid' | 'list') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  return (
    <Page width="wide">
      <PageHeader
        title="Websites"
        description={currentOrg ? `All websites in ${currentOrg.name}` : undefined}
        actions={
          canCreate && (
            <>
              <Button size="sm" leadingIcon={<Sparkles />} asChild>
                <Link href="/w/new/ai">Generate with AI</Link>
              </Button>
              <Button size="sm" variant="primary" leadingIcon={<Plus />} asChild>
                <Link href="/w/new">New website</Link>
              </Button>
            </>
          )
        }
      />
      {(q.data?.length ?? 0) > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <Input size="sm" prefix={<Search />} placeholder="Search websites" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" aria-label="Search websites" />
          <div className="flex-1" />
          <SegmentedControl
            size="sm"
            aria-label="View"
            value={view}
            onValueChange={setViewPersist}
            options={[
              { value: 'grid', icon: <LayoutGrid />, ariaLabel: 'Grid view' },
              { value: 'list', icon: <List />, ariaLabel: 'List view' },
            ]}
          />
        </div>
      )}

      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-surface">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<Globe />}
            title="Create your first website"
            description="Start from a template, describe your business and let AI draft it, or begin with a blank canvas."
            action={
              canCreate && (
                <Button variant="primary" size="sm" leadingIcon={<Plus />} asChild>
                  <Link href="/w/new">New website</Link>
                </Button>
              )
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="No websites match" description="Try a different search." />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => (
            <Link
              key={w.id}
              href={`/w/${w.id}`}
              onMouseEnter={() => prefetch(w)}
              className="group overflow-hidden rounded-lg border border-border bg-surface outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-surface-2">
                {w.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.01]" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <span className="text-2xl font-semibold tracking-tight text-fg-subtle/60">{w.name.slice(0, 1).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{w.name}</div>
                  <div className="truncate text-xs text-fg-muted">{w.primaryDomain ?? w.platformUrl?.replace(/^https?:\/\//, '') ?? w.slug}</div>
                </div>
                <WebsiteStatusBadge status={w.status} />
              </div>
              <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-2xs text-fg-subtle">
                <span>{w.publishedAt ? `Published ${timeAgo(w.publishedAt)}` : 'Never published'}</span>
                <span>Edited {timeAgo(w.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH sortable sorted={sort?.key === 'name' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'name'))}>
                  Name
                </TH>
                <TH>Status</TH>
                <TH>Domain</TH>
                <TH sortable sorted={sort?.key === 'publishedAt' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'publishedAt'))}>
                  Last published
                </TH>
                <TH sortable align="right" sorted={sort?.key === 'updatedAt' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'updatedAt'))}>
                  Updated
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((w) => (
                <TR key={w.id} interactive onClick={() => router.push(`/w/${w.id}`)} onMouseEnter={() => prefetch(w)}>
                  <TD>
                    <Link href={`/w/${w.id}`} className="font-medium text-fg outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                      {w.name}
                    </Link>
                  </TD>
                  <TD>
                    <WebsiteStatusBadge status={w.status} />
                  </TD>
                  <TD muted className={cn('max-w-[240px] truncate')}>
                    {w.primaryDomain ?? w.platformUrl?.replace(/^https?:\/\//, '') ?? '—'}
                  </TD>
                  <TD muted>{w.publishedAt ? timeAgo(w.publishedAt) : 'Never'}</TD>
                  <TD muted align="right">
                    {timeAgo(w.updatedAt)}
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
