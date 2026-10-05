'use client';

import type { PageSummary } from '@atrium/sdk';
import {
  Button,
  cn,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  nextSort,
  PageHeader,
  Select,
  Skeleton,
  sortRows,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  Tooltip,
  TR,
  type SortState,
} from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, CalendarClock, Copy, FileText, History, MoreHorizontal, PenTool, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { PageStatusBadge } from '@/components/common/status';
import { useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { CreatePageDialog } from './create-page-dialog';
import { RenamePageDialog, SchedulePageDialog } from './page-dialogs';
import { PageVersionsSheet } from './page-versions-sheet';
import { normalizeStatus, usePageActions } from './use-page-actions';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const kindLabel: Record<string, string> = { COLLECTION_TEMPLATE: 'Collection template', NOT_FOUND: '404 page' };

export function PagesScreen({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const { organizationId } = useWebsite();
  const { can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const actions = usePageActions(websiteId);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<SortState>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<PageSummary | null>(null);
  const [scheduling, setScheduling] = useState<PageSummary | null>(null);
  const [history, setHistory] = useState<PageSummary | null>(null);
  const [deleting, setDeleting] = useState<PageSummary | null>(null);

  const perms = {
    create: can('page.create', websiteId),
    update: can('page.update', websiteId),
    del: can('page.delete', websiteId),
  };

  const q = useQuery({ queryKey: qk.pages(websiteId), queryFn: () => api.pages.list(websiteId) });

  // `?new=1` opens the create dialog (used by the command palette and dashboard).
  useEffect(() => {
    if (params.get('new') === '1' && perms.create) {
      setCreating(true);
      const next = new URLSearchParams(params.toString());
      next.delete('new');
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [params, perms.create, pathname, router]);

  const takenSlugs = useMemo(() => (q.data ?? []).map((p) => p.slug), [q.data]);

  const rows = useMemo(() => {
    const f = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((p) => (status === 'all' || normalizeStatus(p.status) === status) && (!f || p.title.toLowerCase().includes(f) || `/${p.slug}`.includes(f)));
    if (!sort) return [...list].sort((a, b) => Number(b.isHomepage) - Number(a.isHomepage));
    return sortRows(list, sort, (r, k) => (r as unknown as Record<string, unknown>)[k]);
  }, [q.data, search, status, sort]);

  const editorHref = (p: PageSummary) => `/w/${websiteId}/editor?page=${p.id}`;
  const filtering = search.trim() !== '' || status !== 'all';

  return (
    <Page width="wide">
      <PageHeader
        title="Pages"
        description={q.data ? `${q.data.length} ${q.data.length === 1 ? 'page' : 'pages'} in this website` : undefined}
        actions={
          perms.create && (
            <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
              New page
            </Button>
          )
        }
      />

      {(q.data?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input size="sm" prefix={<Search />} placeholder="Search by title or URL" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" aria-label="Search pages" />
          <Select size="sm" value={status} onValueChange={setStatus} options={STATUS_OPTIONS} className="w-40" aria-label="Filter by status" />
          {filtering && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch('');
                setStatus('all');
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {q.isPending ? (
        <TableSkeleton />
      ) : q.isError ? (
        <TableContainer>
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        </TableContainer>
      ) : q.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<FileText />}
            title="No pages yet"
            description="Create a page from scratch or start from a template."
            action={
              perms.create && (
                <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
                  New page
                </Button>
              )
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <TableContainer>
          <EmptyState compact title="No pages match" description="Try a different search or status." />
        </TableContainer>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH className="w-9 pr-0">
                  <span className="sr-only">Homepage</span>
                </TH>
                <TH sortable sorted={sort?.key === 'title' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'title'))}>
                  Page
                </TH>
                <TH>Status</TH>
                <TH sortable sorted={sort?.key === 'updatedAt' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'updatedAt'))}>
                  Updated
                </TH>
                <TH className="hidden md:table-cell" sortable sorted={sort?.key === 'publishedAt' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'publishedAt'))}>
                  Published
                </TH>
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => {
                const st = normalizeStatus(p.status);
                return (
                  <TR key={p.id} className="hover:bg-surface-2/40">
                    <TD className="w-9 pr-0">
                      {p.isHomepage ? (
                        <Tooltip content="Homepage">
                          <span className="inline-flex size-6 items-center justify-center text-accent" aria-label="Homepage">
                            <Star className="size-4 fill-current" strokeWidth={1.5} />
                          </span>
                        </Tooltip>
                      ) : perms.update && p.kind === 'PAGE' ? (
                        <Tooltip content="Set as homepage">
                          <IconButton
                            label="Set as homepage"
                            size="xs"
                            className="text-fg-subtle opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                            onClick={() => actions.setHomepage.mutate(p)}
                          >
                            <Star />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </TD>
                    <TD className="max-w-[360px]">
                      <div className="flex min-w-0 items-baseline gap-2">
                        {perms.update ? (
                          <Link href={editorHref(p)} className="truncate font-medium text-fg outline-none hover:underline focus-visible:underline">
                            {p.title}
                          </Link>
                        ) : (
                          <span className="truncate font-medium text-fg">{p.title}</span>
                        )}
                        <span className="shrink-0 truncate font-mono text-xs text-fg-muted">/{p.slug}</span>
                        {kindLabel[p.kind] && <span className="shrink-0 text-2xs uppercase tracking-wide text-fg-subtle">{kindLabel[p.kind]}</span>}
                      </div>
                    </TD>
                    <TD>
                      <PageStatusBadge status={st} />
                    </TD>
                    <TD muted className="whitespace-nowrap">
                      <span title={formatDateTime(p.updatedAt)}>{timeAgo(p.updatedAt)}</span>
                      {p.updatedBy && <span className="text-fg-subtle"> · {p.updatedBy}</span>}
                    </TD>
                    <TD muted className="hidden whitespace-nowrap md:table-cell">
                      {p.publishedAt ? <span title={formatDateTime(p.publishedAt)}>{timeAgo(p.publishedAt)}</span> : <span className="text-fg-subtle">Never</span>}
                    </TD>
                    <TD className="w-10 pl-0">
                      <RowMenu
                        page={p}
                        status={st}
                        perms={perms}
                        onOpen={() => router.push(editorHref(p))}
                        onRename={() => setRenaming(p)}
                        onDuplicate={() => actions.duplicate.mutate(p)}
                        onHomepage={() => actions.setHomepage.mutate(p)}
                        onSchedule={() => setScheduling(p)}
                        onArchive={() => actions.update.mutate({ page: p, status: st === 'ARCHIVED' ? 'draft' : 'archived', success: st === 'ARCHIVED' ? 'Page restored to draft' : 'Page archived' })}
                        onHistory={() => setHistory(p)}
                        onDelete={() => setDeleting(p)}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <CreatePageDialog open={creating} onOpenChange={setCreating} websiteId={websiteId} organizationId={organizationId} takenSlugs={takenSlugs} />
      <RenamePageDialog page={renaming} takenSlugs={takenSlugs} onOpenChange={(o) => !o && setRenaming(null)} onSubmit={(v) => actions.update.mutateAsync({ ...v, page: renaming! })} />
      <SchedulePageDialog page={scheduling} onOpenChange={(o) => !o && setScheduling(null)} onSubmit={(v) => actions.update.mutateAsync({ ...v, page: scheduling! })} />
      <PageVersionsSheet websiteId={websiteId} page={history} onOpenChange={(o) => !o && setHistory(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        title={deleting ? `Delete “${deleting.title}”?` : 'Delete page'}
        description="The page and its version history are removed from the draft. Published versions keep their copy until you publish again."
        confirmLabel="Delete page"
        onConfirm={async () => {
          if (deleting) await actions.remove.mutateAsync(deleting);
        }}
      />
    </Page>
  );
}

function RowMenu({
  page,
  status,
  perms,
  onOpen,
  onRename,
  onDuplicate,
  onHomepage,
  onSchedule,
  onArchive,
  onHistory,
  onDelete,
}: {
  page: PageSummary;
  status: string;
  perms: { create: boolean; update: boolean; del: boolean };
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onHomepage: () => void;
  onSchedule: () => void;
  onArchive: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Actions for ${page.title}`} size="xs">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {perms.update && (
          <DropdownMenuItem icon={<PenTool />} onSelect={onOpen}>
            Open in editor
          </DropdownMenuItem>
        )}
        {perms.update && (
          <DropdownMenuItem icon={<Pencil />} onSelect={onRename}>
            Rename or change URL
          </DropdownMenuItem>
        )}
        {perms.create && (
          <DropdownMenuItem icon={<Copy />} onSelect={onDuplicate}>
            Duplicate
          </DropdownMenuItem>
        )}
        {perms.update && !page.isHomepage && page.kind === 'PAGE' && (
          <DropdownMenuItem icon={<Star />} onSelect={onHomepage}>
            Set as homepage
          </DropdownMenuItem>
        )}
        {perms.update && status !== 'ARCHIVED' && (
          <DropdownMenuItem icon={<CalendarClock />} onSelect={onSchedule}>
            {status === 'SCHEDULED' ? 'Edit schedule' : 'Schedule'}
          </DropdownMenuItem>
        )}
        {perms.update && !page.isHomepage && (
          <DropdownMenuItem icon={status === 'ARCHIVED' ? <ArchiveRestore /> : <Archive />} onSelect={onArchive}>
            {status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem icon={<History />} onSelect={onHistory}>
          Version history
        </DropdownMenuItem>
        {perms.del && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Trash2 />} tone="danger" disabled={page.isHomepage} onSelect={onDelete}>
              {page.isHomepage ? 'Homepage can’t be deleted' : 'Delete'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableSkeleton() {
  return (
    <TableContainer>
      <div className="h-8 border-b border-border bg-surface-2/60" />
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={cn('flex h-10 items-center gap-4 px-3')}>
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
        ))}
      </div>
    </TableContainer>
  );
}
