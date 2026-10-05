'use client';

import type { AuditLogEntry } from '@atrium/sdk';
import { Badge, Button, cn, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, Table, TableContainer, TBody, TD, TH, THead, TR, type BadgeTone } from '@atrium/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronRight, ListChecks, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';

type ActorType = AuditLogEntry['actorType'];
const ACTOR_TONE: Record<ActorType, BadgeTone> = { USER: 'neutral', AI: 'accent', SYSTEM: 'outline', API: 'warning' };
const ACTOR_LABEL: Record<ActorType, string> = { USER: 'User', AI: 'AI', SYSTEM: 'System', API: 'API' };

export function AuditScreen({ orgId }: { orgId: string }) {
  return (
    <PermissionPage permission="audit.read">
      <AuditLog orgId={orgId} />
    </PermissionPage>
  );
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function AuditLog({ orgId }: { orgId: string }) {
  const api = useApi();
  const [websiteId, setWebsiteId] = useState('all');
  const [actionInput, setActionInput] = useState('');
  const [actor, setActor] = useState<'all' | ActorType>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const action = useDebounced(actionInput.trim(), 300);

  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId) });
  const siteNames = useMemo(() => new Map((websites.data ?? []).map((w) => [w.id, w.name])), [websites.data]);

  const filters = { websiteId: websiteId === 'all' ? undefined : websiteId, action: action || undefined };
  const q = useInfiniteQuery({
    queryKey: qk.auditLogs(orgId, filters),
    queryFn: ({ pageParam }) => api.organizations.auditLogs(orgId, { ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const entries = useMemo(() => {
    const all = (q.data?.pages ?? []).flatMap((p) => p.items ?? []);
    return actor === 'all' ? all : all.filter((e) => e.actorType === actor);
  }, [q.data, actor]);

  const grouped = useMemo(() => {
    const out: Array<{ key: string; label: string; items: AuditLogEntry[] }> = [];
    for (const e of entries) {
      const k = dayKey(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(e);
      else out.push({ key: k, label: dayLabel(e.createdAt), items: [e] });
    }
    return out;
  }, [entries]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filtered = websiteId !== 'all' || !!action || actor !== 'all';
  const loadedCount = (q.data?.pages ?? []).reduce((n, p) => n + (p.items?.length ?? 0), 0);

  return (
    <Page width="wide">
      <PageHeader title="Audit log" description="A record of changes made by people, AI and integrations in this organization." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          aria-label="Website"
          value={websiteId}
          onValueChange={setWebsiteId}
          className="w-52"
          options={[{ value: 'all', label: 'All websites' }, ...(websites.data ?? []).map((w) => ({ value: w.id, label: w.name }))]}
        />
        <Input size="sm" prefix={<Search />} placeholder="Filter by action, e.g. page.publish" value={actionInput} onChange={(e) => setActionInput(e.target.value)} className="w-64 font-mono" aria-label="Filter by action" />
        <Select
          size="sm"
          aria-label="Actor type"
          value={actor}
          onValueChange={(v) => setActor(v as 'all' | ActorType)}
          className="w-36"
          options={[{ value: 'all', label: 'All actors' }, ...(Object.keys(ACTOR_LABEL) as ActorType[]).map((k) => ({ value: k, label: ACTOR_LABEL[k] }))]}
        />
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWebsiteId('all');
              setActionInput('');
              setActor('all');
            }}
          >
            Clear filters
          </Button>
        )}
        <div className="flex-1" />
        {q.isFetching && !q.isFetchingNextPage && !q.isPending && <span className="text-xs text-fg-subtle">Updating…</span>}
      </div>

      {q.isPending ? (
        <AuditSkeleton />
      ) : q.isError ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : entries.length === 0 ? (
        loadedCount === 0 && !filtered ? (
          <div className="rounded-lg border border-dashed border-border-strong">
            <EmptyState icon={<ListChecks />} title="No activity yet" description="Changes to websites, members and settings will be recorded here." />
          </div>
        ) : (
          <EmptyState
            compact
            title="No events match these filters"
            description={actor !== 'all' && q.hasNextPage ? 'Actor filtering applies to loaded events. Load more to search further back.' : 'Try a different website, action or actor.'}
            action={
              actor !== 'all' && q.hasNextPage ? (
                <Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  Load older events
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH className="w-8">
                    <span className="sr-only">Details</span>
                  </TH>
                  <TH className="w-28">Time</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH className="hidden md:table-cell">Resource</TH>
                  <TH className="hidden lg:table-cell">Website</TH>
                  <TH className="hidden xl:table-cell">IP</TH>
                </tr>
              </THead>
              <TBody>
                {grouped.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="bg-surface-2/40">
                      <td colSpan={7} className="h-7 px-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                        {g.label}
                      </td>
                    </tr>
                    {g.items.map((e) => {
                      const open = expanded.has(e.id);
                      const hasMeta = !!e.metadata && Object.keys(e.metadata).length > 0;
                      return (
                        <Fragment key={e.id}>
                          <TR interactive selected={open} onClick={() => toggle(e.id)} aria-expanded={open}>
                            <TD className="pr-0">
                              <button
                                type="button"
                                aria-label={open ? 'Hide details' : 'Show details'}
                                aria-expanded={open}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  toggle(e.id);
                                }}
                                className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} strokeWidth={1.5} />
                              </button>
                            </TD>
                            <TD muted className="whitespace-nowrap text-xs" title={formatDateTime(e.createdAt)}>
                              {timeAgo(e.createdAt)}
                            </TD>
                            <TD>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{e.actorName ?? (e.actorType === 'SYSTEM' ? 'System' : 'Unknown')}</span>
                                <Badge size="xs" tone={ACTOR_TONE[e.actorType] ?? 'neutral'}>
                                  {ACTOR_LABEL[e.actorType] ?? e.actorType}
                                </Badge>
                              </div>
                            </TD>
                            <TD>
                              <div className="min-w-0">
                                <span className="font-mono text-xs text-fg">{e.action}</span>
                                {e.summary && <div className="max-w-md truncate text-xs text-fg-muted">{e.summary}</div>}
                              </div>
                            </TD>
                            <TD className="hidden md:table-cell">
                              <span className="text-xs text-fg">{e.resourceType}</span>
                              {e.resourceId && (
                                <span className="ml-1.5 font-mono text-2xs text-fg-subtle" title={e.resourceId}>
                                  {e.resourceId.length > 12 ? `${e.resourceId.slice(0, 12)}…` : e.resourceId}
                                </span>
                              )}
                            </TD>
                            <TD muted className="hidden max-w-[180px] truncate lg:table-cell">
                              {e.websiteId ? (siteNames.get(e.websiteId) ?? <span className="font-mono text-2xs">{e.websiteId.slice(0, 10)}…</span>) : '—'}
                            </TD>
                            <TD muted mono className="hidden xl:table-cell">
                              {e.ip ?? '—'}
                            </TD>
                          </TR>
                          {open && (
                            <tr className="bg-surface-2/30">
                              <td colSpan={7} className="px-3 pb-3 pt-1">
                                <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
                                  <dt className="text-fg-subtle">Time</dt>
                                  <dd className="text-fg">{formatDateTime(e.createdAt)}</dd>
                                  <dt className="text-fg-subtle">Resource</dt>
                                  <dd className="break-all font-mono text-fg">
                                    {e.resourceType}
                                    {e.resourceId ? ` · ${e.resourceId}` : ''}
                                  </dd>
                                  <dt className="text-fg-subtle">Website</dt>
                                  <dd className="text-fg">{e.websiteId ? (siteNames.get(e.websiteId) ?? e.websiteId) : '—'}</dd>
                                  <dt className="text-fg-subtle">IP</dt>
                                  <dd className="font-mono text-fg">{e.ip ?? '—'}</dd>
                                </dl>
                                {hasMeta ? (
                                  <pre className="max-h-80 overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs leading-5 text-fg">{JSON.stringify(e.metadata, null, 2)}</pre>
                                ) : (
                                  <p className="text-xs text-fg-subtle">No additional metadata.</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}
              </TBody>
            </Table>
          </TableContainer>
          <div className="mt-3 flex items-center justify-center">
            {q.hasNextPage ? (
              <Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Load older events
              </Button>
            ) : (
              <span className="text-xs text-fg-subtle">{loadedCount > 0 ? 'You’ve reached the beginning of the log' : null}</span>
            )}
          </div>
        </>
      )}
    </Page>
  );
}

function AuditSkeleton() {
  return (
    <TableContainer>
      <div className="h-8 border-b border-border bg-surface-2/60" />
      <div className="h-7 border-b border-border bg-surface-2/40 px-3 py-2">
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-10 items-center gap-6 px-3">
            <Skeleton className="size-3.5" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="hidden h-3 w-24 md:block" />
            <Skeleton className="hidden h-3 w-24 lg:block" />
          </div>
        ))}
      </div>
    </TableContainer>
  );
}
