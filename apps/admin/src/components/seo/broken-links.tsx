'use client';

import { Badge, Button, EmptyState, ErrorState, SkeletonRows, Table, TableContainer, TBody, TD, TH, THead, TR } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, PenTool, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

export interface BrokenLinkRow {
  pageId: string;
  nodeId?: string;
  path: string;
  link: unknown;
  reason: string;
}

export function useBrokenLinks(websiteId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.brokenLinks(websiteId), queryFn: () => api.websites.brokenLinks(websiteId) });
}

/** Human-readable representation of a LinkValue (string or typed object). */
export function stringifyLink(link: unknown, pageTitle: (id: string) => string | undefined): string {
  if (typeof link === 'string') return link;
  if (!link || typeof link !== 'object') return String(link ?? '—');
  const l = link as Record<string, unknown>;
  const s = (k: string) => (typeof l[k] === 'string' ? (l[k] as string) : '');
  switch (l.type) {
    case 'page': {
      const title = pageTitle(s('pageId'));
      return `${title ? `Page “${title}”` : `Page ${s('pageId') || '(missing)'}`}${s('anchor') ? ` #${s('anchor')}` : ''}`;
    }
    case 'url':
      return s('href');
    case 'anchor':
      return `#${s('anchor')}`;
    case 'email':
      return `mailto:${s('email')}`;
    case 'tel':
      return `tel:${s('phone')}`;
    case 'whatsapp':
      return `WhatsApp ${s('phone')}`;
    case 'collection-item':
      return `/${s('collection')}/${s('slug')}`;
    default:
      try {
        return JSON.stringify(link);
      } catch {
        return '—';
      }
  }
}

export function BrokenLinks({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const { can } = useSession();
  const q = useBrokenLinks(websiteId);
  const pages = useQuery({ queryKey: qk.pages(websiteId), queryFn: () => api.pages.list(websiteId) });
  const titles = useMemo(() => new Map((pages.data ?? []).map((p) => [p.id, p.title])), [pages.data]);
  const canEdit = can('page.update', websiteId);

  const where = (pageId: string): { label: string; sub?: string; href?: string } => {
    if (pageId === 'header') return { label: 'Header', sub: 'Global', href: `/w/${websiteId}/editor` };
    if (pageId === 'footer') return { label: 'Footer', sub: 'Global', href: `/w/${websiteId}/editor` };
    if (pageId.startsWith('menu:')) return { label: `${pageId.charAt(5).toUpperCase()}${pageId.slice(6)} menu`, sub: 'Navigation', href: `/w/${websiteId}/editor` };
    return { label: titles.get(pageId) ?? 'Unknown page', href: `/w/${websiteId}/editor?page=${encodeURIComponent(pageId)}` };
  };

  if (q.isPending) return <SkeletonRows rows={5} className="rounded-lg border border-border bg-surface" />;
  if (q.isError) return <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />;
  const rows: BrokenLinkRow[] = Array.isArray(q.data) ? q.data : [];

  if (rows.length === 0)
    return (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState
          icon={<CheckCircle2 />}
          title="No broken links found"
          description="Every internal link points to an existing page or anchor."
          action={
            <Button size="sm" variant="ghost" leadingIcon={<RefreshCw />} onClick={() => void q.refetch()} loading={q.isFetching}>
              Scan again
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-fg-muted">
          {rows.length} broken {rows.length === 1 ? 'link' : 'links'} in the current draft. Visitors following them land on a 404 page.
        </p>
        <Button size="sm" variant="ghost" leadingIcon={<RefreshCw />} onClick={() => void q.refetch()} loading={q.isFetching}>
          Scan again
        </Button>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <TR>
              <TH>Found on</TH>
              <TH>Link</TH>
              <TH>Problem</TH>
              <TH className="hidden lg:table-cell">Location</TH>
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r, i) => {
              const w = where(r.pageId);
              return (
                <TR key={`${r.pageId}-${r.nodeId ?? ''}-${r.path}-${i}`}>
                  <TD>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-fg">{w.label}</div>
                      {w.sub && <div className="text-xs text-fg-subtle">{w.sub}</div>}
                    </div>
                  </TD>
                  <TD mono className="max-w-[260px] truncate" title={stringifyLink(r.link, (id) => titles.get(id))}>
                    {stringifyLink(r.link, (id) => titles.get(id))}
                  </TD>
                  <TD>
                    <Badge tone="warning">{r.reason}</Badge>
                  </TD>
                  <TD mono muted className="hidden max-w-[220px] truncate lg:table-cell" title={r.path}>
                    {r.path || '—'}
                  </TD>
                  <TD align="right">
                    {canEdit && w.href && (
                      <Button size="xs" variant="ghost" leadingIcon={<PenTool />} asChild>
                        <Link href={w.href}>Open in editor</Link>
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
}
