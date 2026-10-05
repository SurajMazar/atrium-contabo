'use client';

import type { SubmissionStatus, SubmissionSummary } from '@atrium/sdk';
import {
  Avatar,
  Badge,
  BulkBar,
  Button,
  cn,
  ConfirmDialog,
  DateRangePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  presetRange,
  RowCheckbox,
  Select,
  SelectAllCheckbox,
  Skeleton,
  Spinner,
  Switch,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  toast,
  Tooltip,
  TR,
  type DateRange,
} from '@atrium/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Calendar, ChevronDown, CircleDot, Download, FileSpreadsheet, FileText, Inbox, Mail, MailOpen, Search, Tag, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { SubmissionStatusBadge, SUBMISSION_STATUS_META } from '@/components/common/status';
import { useMembers } from '@/components/forms/queries';
import { downloadAuthenticated, errorMessage, useApi } from '@/lib/api';
import { formatDate, formatDateTime, formatNumber, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useDebounced } from '@/lib/use-debounced';
import { useWebsite } from '@/lib/website-context';
import { SubmissionDrawer } from './submission-drawer';
import { patchLists, previewOf, primaryOf, removeFromLists, restoreSnapshot, snapshotLists, STATUS_OPTIONS, type CacheSnapshot } from './submission-utils';

type BulkAction = 'markRead' | 'markUnread' | 'archive' | 'status' | 'tag' | 'delete';

export function SubmissionsScreen({ websiteId, initialFormId, initialSubmissionId }: { websiteId: string; initialFormId?: string; initialSubmissionId?: string }) {
  return (
    <PermissionPage permission="submission.read" websiteId={websiteId}>
      <SubmissionsInbox websiteId={websiteId} initialFormId={initialFormId} initialSubmissionId={initialSubmissionId} />
    </PermissionPage>
  );
}

function SubmissionsInbox({ websiteId, initialFormId, initialSubmissionId }: { websiteId: string; initialFormId?: string; initialSubmissionId?: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { organizationId } = useWebsite();
  const { can, user } = useSession();
  const canUpdate = can('submission.update', websiteId);
  const canDelete = can('submission.delete', websiteId);
  const canExport = can('submission.export', websiteId);

  // Filters
  const [formId, setFormId] = useState(initialFormId ?? 'all');
  const [status, setStatus] = useState<'all' | SubmissionStatus>('all');
  const [unread, setUnread] = useState(false);
  const [assigned, setAssigned] = useState('all');
  const [tagInput, setTagInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [range, setRange] = useState<DateRange | null>(null);
  const search = useDebounced(searchInput.trim(), 300);
  const tag = useDebounced(tagInput.trim().toLowerCase(), 300);

  const query = useMemo(
    () => ({
      formId: formId === 'all' ? undefined : formId,
      status: status === 'all' ? undefined : status,
      unread: unread || undefined,
      assignedTo: assigned === 'all' ? undefined : assigned === 'me' ? user?.id : assigned,
      tag: tag || undefined,
      search: search || undefined,
      from: range?.from,
      to: range?.to,
    }),
    [formId, status, unread, assigned, user?.id, tag, search, range],
  );
  const filtersActive = formId !== 'all' || status !== 'all' || unread || assigned !== 'all' || !!tagInput || !!searchInput || !!range;
  const clearFilters = () => {
    setFormId('all');
    setStatus('all');
    setUnread(false);
    setAssigned('all');
    setTagInput('');
    setSearchInput('');
    setRange(null);
  };

  const forms = useQuery({ queryKey: qk.forms(websiteId), queryFn: () => api.forms.list(websiteId), staleTime: 60_000 });
  const members = useMembers(organizationId);

  const list = useInfiniteQuery({
    queryKey: qk.submissions(websiteId, query),
    queryFn: ({ pageParam }) => api.submissions.list(websiteId, { ...query, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total;

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [query]);
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  // Drawer
  const [openId, setOpenId] = useState<string | null>(initialSubmissionId ?? null);
  const openIndex = openId ? rows.findIndex((r) => r.id === openId) : -1;
  const openRow = openIndex >= 0 ? rows[openIndex] : undefined;

  const syncUrl = (id: string | null) => {
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('id', id);
      else url.searchParams.delete('id');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* ignore */
    }
  };

  const markedRead = useRef(new Set<string>());
  const markRead = useCallback(
    (row: SubmissionSummary) => {
      // Once per row per visit, so a failed request doesn't retry in a loop.
      if (row.read || !canUpdate || markedRead.current.has(row.id)) return;
      markedRead.current.add(row.id);
      const snap = snapshotLists(qc, websiteId);
      patchLists(qc, websiteId, [row.id], (s) => ({ ...s, read: true }));
      api.submissions.update(row.id, { read: true }).then(
        () => void qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) }),
        () => restoreSnapshot(qc, snap),
      );
    },
    [api, qc, websiteId, canUpdate],
  );

  const open = useCallback((row: SubmissionSummary) => {
    setOpenId(row.id);
    syncUrl(row.id);
  }, []);

  // Opening a submission (click, j/k or deep link) marks it as read.
  useEffect(() => {
    if (openRow && !openRow.read) markRead(openRow);
  }, [openRow, markRead]);
  const close = () => {
    markedRead.current.clear();
    setOpenId(null);
    syncUrl(null);
  };

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const goRelative = useCallback(
    (dir: 1 | -1) => {
      if (openIndex < 0) return;
      const next = rows[openIndex + dir];
      if (next) open(next);
      else if (dir === 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    [openIndex, rows, open, hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  // j/k navigation while the drawer is open
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"], [role="combobox"]')) return;
      if (e.key === 'j') {
        e.preventDefault();
        goRelative(1);
      } else if (e.key === 'k') {
        e.preventDefault();
        goRelative(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, goRelative]);

  // Infinite scroll sentinel
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Bulk actions
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const bulk = useMutation({
    mutationFn: (b: { ids: string[]; action: BulkAction; value?: unknown }) => api.submissions.bulk(websiteId, b),
    onMutate: async (b): Promise<{ snap: CacheSnapshot }> => {
      await qc.cancelQueries({ queryKey: qk.submissionsAll(websiteId) });
      const snap = snapshotLists(qc, websiteId);
      if (b.action === 'markRead' || b.action === 'markUnread') patchLists(qc, websiteId, b.ids, (s) => ({ ...s, read: b.action === 'markRead' }));
      if (b.action === 'status') patchLists(qc, websiteId, b.ids, (s) => ({ ...s, status: b.value as SubmissionStatus }));
      if (b.action === 'archive') patchLists(qc, websiteId, b.ids, (s) => ({ ...s, status: 'ARCHIVED' }));
      if (b.action === 'tag') patchLists(qc, websiteId, b.ids, (s) => ({ ...s, tags: s.tags.includes(String(b.value)) ? s.tags : [...s.tags, String(b.value)] }));
      if (b.action === 'delete') removeFromLists(qc, websiteId, b.ids);
      return { snap };
    },
    onError: (err, _b, ctx) => {
      if (ctx?.snap) restoreSnapshot(qc, ctx.snap);
      toast.error(errorMessage(err, 'Bulk action failed'));
    },
    onSuccess: (res, b) => {
      const n = res?.updated ?? b.ids.length;
      const noun = n === 1 ? 'submission' : 'submissions';
      const msg: Record<BulkAction, string> = {
        markRead: `Marked ${n} ${noun} as read`,
        markUnread: `Marked ${n} ${noun} as unread`,
        archive: `Archived ${n} ${noun}`,
        status: `Moved ${n} ${noun} to ${SUBMISSION_STATUS_META[b.value as SubmissionStatus]?.label ?? b.value}`,
        tag: `Tagged ${n} ${noun} “${String(b.value)}”`,
        delete: `Deleted ${n} ${noun}`,
      };
      toast.success(msg[b.action]);
      if (b.action === 'markUnread') b.ids.forEach((id) => markedRead.current.delete(id));
      setSelected(new Set());
      b.ids.forEach((id) => void qc.invalidateQueries({ queryKey: qk.submission(id) }));
      if (b.action === 'delete' && openId && b.ids.includes(openId)) close();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.submissionsAll(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) });
    },
  });
  const runBulk = (action: BulkAction, value?: unknown) => bulk.mutate({ ids: [...selected], action, value });

  // Export
  const [exporting, setExporting] = useState(false);
  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    const t = toast.loading('Preparing export…');
    try {
      await downloadAuthenticated(api.submissions.exportUrl(websiteId, { format, formId: query.formId, status: query.status }), `submissions.${format}`);
      toast.success('Export downloaded', { id: t });
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'), { id: t });
    } finally {
      setExporting(false);
    }
  };

  const formOptions = [{ value: 'all', label: 'All forms' }, ...(forms.data ?? []).map((f) => ({ value: f.id, label: f.name }))];
  if (formId !== 'all' && !formOptions.some((o) => o.value === formId)) formOptions.push({ value: formId, label: forms.isPending ? 'Loading…' : 'Unknown form' });
  const assignOptions = [
    { value: 'all', label: 'Anyone' },
    { value: 'me', label: 'Assigned to me' },
    { value: 'unassigned', label: 'Unassigned' },
    ...(members.data ?? []).filter((m) => m.user.id !== user?.id).map((m) => ({ value: m.user.id, label: m.user.name || m.user.email })),
  ];

  return (
    <Page width="wide">
      <PageHeader
        title="Submissions"
        description={total !== undefined ? `${formatNumber(total)} ${total === 1 ? 'response' : 'responses'}${filtersActive ? ' match your filters' : ''}` : 'Every response across this website’s forms.'}
        actions={
          canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" leadingIcon={<Download />} trailingIcon={<ChevronDown />} loading={exporting}>
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{query.formId || query.status ? 'Current form and status filter' : 'All submissions'}</DropdownMenuLabel>
                <DropdownMenuItem icon={<FileText />} onSelect={() => void exportAs('csv')}>
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem icon={<FileSpreadsheet />} onSelect={() => void exportAs('xlsx')}>
                  Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filters">
        <Input size="sm" prefix={<Search />} placeholder="Search responses" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="w-full sm:w-60" aria-label="Search submissions" />
        <Select size="sm" className="w-40" aria-label="Form" value={formId} onValueChange={setFormId} options={formOptions} />
        <Select size="sm" className="w-36" aria-label="Status" value={status} onValueChange={(v) => setStatus(v as typeof status)} options={[{ value: 'all', label: 'Any status' }, ...STATUS_OPTIONS]} />
        <Select size="sm" className="w-40" aria-label="Assignee" value={assigned} onValueChange={setAssigned} options={assignOptions} />
        <Input size="sm" prefix={<Tag />} placeholder="Tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="w-28" aria-label="Filter by tag" />
        <DateFilter value={range} onChange={setRange} />
        <div className="flex h-7 items-center rounded-md border border-border bg-surface px-2.5">
          <Switch size="sm" label={<span className="text-sm">Unread</span>} checked={unread} onCheckedChange={setUnread} className="gap-2" />
        </div>
        {filtersActive && (
          <Button size="sm" variant="ghost" leadingIcon={<X />} onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())} className="sticky top-2 z-20 mb-3">
          {canUpdate && (
            <>
              <Button size="xs" variant="ghost" leadingIcon={<MailOpen />} onClick={() => runBulk('markRead')}>
                Mark read
              </Button>
              <Button size="xs" variant="ghost" leadingIcon={<Mail />} onClick={() => runBulk('markUnread')}>
                Mark unread
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="xs" variant="ghost" leadingIcon={<CircleDot />} trailingIcon={<ChevronDown />}>
                    Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {STATUS_OPTIONS.map((o) => (
                    <DropdownMenuItem key={o.value} onSelect={() => runBulk('status', o.value)}>
                      <SubmissionStatusBadge status={o.value} />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover open={tagOpen} onOpenChange={setTagOpen}>
                <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost" leadingIcon={<Tag />}>
                    Add tag
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const t = tagDraft.trim().toLowerCase();
                      if (!t) return;
                      runBulk('tag', t);
                      setTagDraft('');
                      setTagOpen(false);
                    }}
                  >
                    <Input size="sm" autoFocus placeholder="Tag name" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} aria-label="Tag name" />
                    <Button size="sm" type="submit" disabled={!tagDraft.trim()}>
                      Add
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
              <Button size="xs" variant="ghost" leadingIcon={<Archive />} onClick={() => runBulk('archive')}>
                Archive
              </Button>
            </>
          )}
          {canDelete && (
            <Button size="xs" variant="danger-ghost" leadingIcon={<Trash2 />} onClick={() => setConfirmBulkDelete(true)}>
              Delete
            </Button>
          )}
        </BulkBar>
      )}

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            compact
            icon={<Search />}
            title="No submissions match"
            description="Try removing a filter or widening the date range."
            action={
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border-strong">
            <EmptyState
              icon={<Inbox />}
              title="No submissions yet"
              description="Responses from your forms land here. Add a form to a page and publish to start collecting."
              action={
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/w/${websiteId}/forms`}>Go to forms</Link>
                </Button>
              }
            />
          </div>
        )
      ) : (
        <>
          {/* Tablet and desktop: dense table */}
          <TableContainer className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH className="w-10 pr-0">
                    <SelectAllCheckbox total={rows.length} selected={rows.filter((r) => selected.has(r.id)).length} onChange={(all) => setSelected(all ? new Set(rows.map((r) => r.id)) : new Set())} />
                  </TH>
                  <TH className="w-[200px]">From</TH>
                  <TH>Message</TH>
                  <TH className="hidden w-[160px] lg:table-cell">Form</TH>
                  <TH>Status</TH>
                  <TH className="hidden w-[150px] xl:table-cell">Tags</TH>
                  <TH>
                    <span className="sr-only">Assignee</span>
                  </TH>
                  <TH align="right">Received</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const who = primaryOf(r.summary);
                  const preview = previewOf(r.summary, who.key);
                  const isOpen = r.id === openId;
                  return (
                    <TR
                      key={r.id}
                      interactive
                      selected={selected.has(r.id)}
                      onClick={() => open(r)}
                      className={cn(isOpen && 'bg-surface-2')}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) open(r);
                      }}
                      aria-label={`${who.label}, ${r.formName}${r.read ? '' : ', unread'}`}
                    >
                      <TD className="pr-0">
                        <RowCheckbox checked={selected.has(r.id)} onChange={(v) => toggle(r.id, v)} label={`Select submission from ${who.label}`} />
                      </TD>
                      <TD>
                        <div className="flex w-[176px] min-w-0 items-center gap-2">
                          <span className={cn('size-1.5 shrink-0 rounded-full', r.read ? 'bg-transparent' : 'bg-accent')} aria-hidden />
                          <span className={cn('truncate', r.read ? 'text-fg-muted' : 'font-semibold text-fg')}>{who.label}</span>
                        </div>
                      </TD>
                      <TD className={cn('w-full max-w-0 truncate', r.read ? 'text-fg-subtle' : 'text-fg-muted')}>{preview || '—'}</TD>
                      <TD muted className="hidden max-w-[160px] truncate lg:table-cell">
                        {r.formName}
                      </TD>
                      <TD>
                        <SubmissionStatusBadge status={r.status} />
                      </TD>
                      <TD className="hidden xl:table-cell">
                        <Tags tags={r.tags} />
                      </TD>
                      <TD>
                        {r.assignedTo ? (
                          <Tooltip content={`Assigned to ${r.assignedTo.name}`}>
                            <span className="inline-flex">
                              <Avatar size="xs" name={r.assignedTo.name} src={members.data?.find((m) => m.user.id === r.assignedTo?.id)?.user.avatarUrl} />
                            </span>
                          </Tooltip>
                        ) : null}
                      </TD>
                      <TD align="right" muted className="whitespace-nowrap text-xs">
                        <span title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>

          {/* Mobile: stacked list */}
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface md:hidden">
            {rows.map((r) => {
              const who = primaryOf(r.summary);
              const preview = previewOf(r.summary, who.key);
              return (
                <li key={r.id} className={cn('flex gap-3 px-3 py-3', selected.has(r.id) && 'bg-accent-soft/50')}>
                  <div className="pt-0.5">
                    <RowCheckbox checked={selected.has(r.id)} onChange={(v) => toggle(r.id, v)} label={`Select submission from ${who.label}`} />
                  </div>
                  <button type="button" onClick={() => open(r)} className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex items-center gap-2">
                      {!r.read && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                      <span className={cn('min-w-0 flex-1 truncate text-sm', r.read ? 'text-fg' : 'font-semibold text-fg')}>{who.label}</span>
                      <span className="shrink-0 text-xs text-fg-subtle">{timeAgo(r.createdAt)}</span>
                    </div>
                    {preview && <p className="mt-0.5 truncate text-sm text-fg-muted">{preview}</p>}
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-fg-muted">
                      <SubmissionStatusBadge status={r.status} />
                      <span className="truncate">{r.formName}</span>
                      {r.assignedTo && <Avatar size="xs" name={r.assignedTo.name} className="ml-auto" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div ref={sentinel} className="flex h-14 items-center justify-center">
            {list.isFetchingNextPage ? (
              <Spinner className="text-fg-subtle" />
            ) : list.hasNextPage ? (
              <Button size="sm" variant="ghost" onClick={() => void list.fetchNextPage()}>
                Load more
              </Button>
            ) : rows.length > 20 ? (
              <span className="text-xs text-fg-subtle">End of results</span>
            ) : null}
          </div>
        </>
      )}

      <SubmissionDrawer
        websiteId={websiteId}
        organizationId={organizationId}
        submissionId={openId}
        summary={openRow}
        onClose={close}
        onPrev={openIndex > 0 ? () => goRelative(-1) : undefined}
        onNext={openIndex >= 0 && (openIndex < rows.length - 1 || list.hasNextPage) ? () => goRelative(1) : undefined}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        tone="danger"
        title={`Delete ${selected.size} ${selected.size === 1 ? 'submission' : 'submissions'}?`}
        description="Values, notes and activity are removed permanently. Consider archiving instead."
        confirmLabel="Delete"
        onConfirm={() => bulk.mutateAsync({ ids: [...selected], action: 'delete' })}
      />
    </Page>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags?.length) return null;
  const shown = tags.slice(0, 2);
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {shown.map((t) => (
        <Badge key={t} size="xs" className="max-w-[80px] truncate">
          {t}
        </Badge>
      ))}
      {tags.length > 2 && (
        <Tooltip content={tags.slice(2).join(', ')}>
          <span className="text-2xs text-fg-subtle">+{tags.length - 2}</span>
        </Tooltip>
      )}
    </div>
  );
}

function DateFilter({ value, onChange }: { value: DateRange | null; onChange: (r: DateRange | null) => void }) {
  const [open, setOpen] = useState(false);
  const label = value ? `${formatDate(value.from, { month: 'short', day: 'numeric' })} – ${formatDate(value.to, { month: 'short', day: 'numeric' })}` : 'Any date';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" leadingIcon={<Calendar />} className={cn(!value && 'text-fg-muted')}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <div className="space-y-3">
          <DateRangePicker value={value ?? presetRange(30)} onChange={onChange} />
          <div className="flex justify-end gap-2">
            {value && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button size="xs" variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ListSkeleton() {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
        <div className="h-8 border-b border-border bg-surface-2/60" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-b border-border px-3 last:border-0">
            <Skeleton className="size-4" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3.5 w-12" />
          </div>
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-lg border border-border bg-surface md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 px-3 py-3">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </>
  );
}
