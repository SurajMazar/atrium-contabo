'use client';

import type { Submission, SubmissionStatus, SubmissionSummary } from '@atrium/sdk';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  DescriptionList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorState,
  IconButton,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
  TagInput,
  Textarea,
  toast,
  Tooltip,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Mail, MailOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SubmissionStatusBadge } from '@/components/common/status';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { ACTION_META } from '@/components/forms/form-model';
import { useMembers } from '@/components/forms/queries';
import { actionStatusTone, patchDetail, patchLists, primaryOf, removeFromLists, restoreSnapshot, snapshotLists, STATUS_OPTIONS, ValueDisplay } from './submission-utils';

type UpdateBody = { status?: SubmissionStatus; read?: boolean; tags?: string[]; assignedToId?: string | null };

export interface SubmissionDrawerProps {
  websiteId: string;
  organizationId: string | undefined;
  submissionId: string | null;
  /** Row from the list, shown while the detail loads. */
  summary?: SubmissionSummary;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function SubmissionDrawer({ websiteId, organizationId, submissionId, summary, onClose, onPrev, onNext }: SubmissionDrawerProps) {
  const api = useApi();
  const qc = useQueryClient();
  const { can, user } = useSession();
  const canUpdate = can('submission.update', websiteId);
  const canDelete = can('submission.delete', websiteId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState('');

  const id = submissionId ?? '';
  const q = useQuery({ queryKey: qk.submission(id), queryFn: () => api.submissions.get(id), enabled: !!submissionId });
  const members = useMembers(organizationId);
  const s: (Submission | SubmissionSummary) | undefined = q.data ?? summary;

  const update = useMutation({
    mutationFn: (body: UpdateBody) => api.submissions.update(id, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.submission(id) });
      const prevDetail = qc.getQueryData<Submission>(qk.submission(id));
      const snap = snapshotLists(qc, websiteId);
      const m = body.assignedToId !== undefined ? members.data?.find((x) => x.user.id === body.assignedToId) : undefined;
      const apply = <T extends SubmissionSummary>(x: T): T => ({
        ...x,
        ...(body.status ? { status: body.status } : {}),
        ...(body.read !== undefined ? { read: body.read } : {}),
        ...(body.tags ? { tags: body.tags } : {}),
        ...(body.assignedToId !== undefined ? { assignedTo: body.assignedToId ? { id: body.assignedToId, name: m?.user.name ?? m?.user.email ?? 'Teammate' } : null } : {}),
      });
      patchDetail(qc, id, apply);
      patchLists(qc, websiteId, [id], apply);
      return { prevDetail, snap };
    },
    onError: (err, _b, ctx) => {
      if (ctx?.prevDetail) qc.setQueryData(qk.submission(id), ctx.prevDetail);
      if (ctx?.snap) restoreSnapshot(qc, ctx.snap);
      toast.error(errorMessage(err, 'Could not update the submission'));
    },
    onSuccess: (res) => {
      if (res && typeof res === 'object' && 'id' in res) qc.setQueryData<Submission>(qk.submission(id), (old) => (old ? { ...old, ...res, values: res.values ?? old.values, notes: res.notes ?? old.notes, actionsLog: res.actionsLog ?? old.actionsLog } : res));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.submissionsAll(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) });
    },
  });

  const addNote = useMutation({
    mutationFn: (body: string) => api.submissions.addNote(id, body),
    onSuccess: (n) => {
      patchDetail(qc, id, (old) => ({ ...old, notes: [...(old.notes ?? []), n] }));
      setNote('');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not add the note')),
  });

  const remove = useMutation({
    mutationFn: () => api.submissions.remove(id),
    onSuccess: () => {
      removeFromLists(qc, websiteId, [id]);
      qc.removeQueries({ queryKey: qk.submission(id) });
      toast.success('Submission deleted');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete the submission')),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.submissionsAll(websiteId) }),
  });

  const who = primaryOf(s?.summary);
  const detail = q.data;
  const memberOptions = [
    { value: 'unassigned', label: 'Unassigned' },
    ...(members.data ?? [])
      .slice()
      .sort((a, b) => Number(b.user.id === user?.id) - Number(a.user.id === user?.id))
      .map((m) => ({ value: m.user.id, label: `${m.user.name || m.user.email}${m.user.id === user?.id ? ' (you)' : ''}`, icon: <Avatar size="xs" src={m.user.avatarUrl} name={m.user.name} /> })),
  ];
  const assignedId = s?.assignedTo?.id;
  if (assignedId && !memberOptions.some((o) => o.value === assignedId)) memberOptions.push({ value: assignedId, label: s?.assignedTo?.name ?? 'Former member', icon: <Avatar size="xs" name={s?.assignedTo?.name} /> });

  return (
    <Sheet open={!!submissionId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        size="lg"
        title={s ? who.label : 'Submission'}
        description={s ? `${s.formName} · ${timeAgo(s.createdAt)}` : undefined}
        bodyClassName="p-0"
        actions={
          <div className="flex items-center gap-0.5">
            <Tooltip content="Previous" shortcut="K">
              <IconButton label="Previous submission" size="sm" disabled={!onPrev} onClick={onPrev}>
                <ChevronUp />
              </IconButton>
            </Tooltip>
            <Tooltip content="Next" shortcut="J">
              <IconButton label="Next submission" size="sm" disabled={!onNext} onClick={onNext}>
                <ChevronDown />
              </IconButton>
            </Tooltip>
            {(canUpdate || canDelete) && s && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label="More actions" size="sm">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canUpdate && (
                    <DropdownMenuItem icon={s.read ? <Mail /> : <MailOpen />} onSelect={() => update.mutate({ read: !s.read })}>
                      {s.read ? 'Mark as unread' : 'Mark as read'}
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setConfirmDelete(true)}>
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      >
        {!s && q.isPending ? (
          <DrawerSkeleton />
        ) : q.isError && !s ? (
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        ) : s ? (
          <div className="divide-y divide-border">
            {/* Triage */}
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-4 text-sm">
              <span className="text-xs text-fg-muted">Status</span>
              {canUpdate ? (
                <Select size="sm" className="w-56" aria-label="Status" value={s.status} onValueChange={(v) => update.mutate({ status: v as SubmissionStatus })} options={STATUS_OPTIONS} />
              ) : (
                <span>
                  <SubmissionStatusBadge status={s.status} />
                </span>
              )}
              <span className="text-xs text-fg-muted">Assignee</span>
              {canUpdate ? (
                <Select
                  size="sm"
                  className="w-56"
                  aria-label="Assignee"
                  value={assignedId ?? 'unassigned'}
                  disabled={members.isLoading}
                  onValueChange={(v) => update.mutate({ assignedToId: v === 'unassigned' ? null : v })}
                  options={memberOptions}
                />
              ) : (
                <span className="text-fg">{s.assignedTo?.name ?? <span className="text-fg-subtle">Unassigned</span>}</span>
              )}
              <span className="self-start pt-1.5 text-xs text-fg-muted">Tags</span>
              {canUpdate ? (
                <TagInput value={s.tags ?? []} onChange={(tags) => update.mutate({ tags })} placeholder="Add tag" transform={(t) => t.trim().toLowerCase()} />
              ) : (
                <div className="flex flex-wrap gap-1">{s.tags?.length ? s.tags.map((t) => <Badge key={t}>{t}</Badge>) : <span className="text-fg-subtle">None</span>}</div>
              )}
            </div>

            {/* Response */}
            <Section title="Response">
              {detail ? (
                detail.values.length ? (
                  <dl className="space-y-3.5">
                    {detail.values.map((v) => (
                      <div key={v.fieldName}>
                        <dt className="text-xs text-fg-muted">{v.fieldLabel || v.fieldName}</dt>
                        <dd className="mt-0.5 text-sm text-fg">
                          <ValueDisplay type={v.fieldType} value={v.value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-fg-muted">No values were submitted.</p>
                )
              ) : q.isError ? (
                <ErrorState className="py-6" description={q.error.message} onRetry={() => void q.refetch()} />
              ) : (
                <ValuesSkeleton />
              )}
            </Section>

            {/* Notes */}
            <Section title="Notes" count={detail?.notes.length}>
              {detail && detail.notes.length > 0 && (
                <ul className="mb-3 space-y-3">
                  {detail.notes.map((n) => (
                    <li key={n.id} className="flex gap-2.5">
                      <Avatar size="sm" name={n.author?.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 text-xs">
                          <span className="font-medium text-fg">{n.author?.name ?? 'Someone'}</span>
                          <span className="text-fg-subtle" title={formatDateTime(n.createdAt)}>
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg">{n.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canUpdate ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) addNote.mutate(note.trim());
                  }}
                  className="space-y-2"
                >
                  <Textarea
                    rows={2}
                    aria-label="Add a note"
                    placeholder="Add an internal note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && note.trim()) {
                        e.preventDefault();
                        addNote.mutate(note.trim());
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-fg-subtle">⌘↵ to post</span>
                    <Button size="sm" type="submit" disabled={!note.trim() || !detail} loading={addNote.isPending}>
                      Add note
                    </Button>
                  </div>
                </form>
              ) : (
                !detail?.notes.length && <p className="text-sm text-fg-muted">No notes yet.</p>
              )}
            </Section>

            {/* Workflow log */}
            <Section title="Workflow activity" count={detail?.actionsLog.length}>
              {!detail ? (
                <Skeleton className="h-10 w-full" />
              ) : detail.actionsLog.length === 0 ? (
                <p className="text-sm text-fg-muted">No workflow actions ran for this submission.</p>
              ) : (
                <ol className="space-y-2">
                  {detail.actionsLog.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-fg">{ACTION_META[a.action as keyof typeof ACTION_META]?.label ?? a.action}</span>
                          <Badge size="xs" tone={actionStatusTone(a.status)}>
                            {a.status}
                          </Badge>
                        </div>
                        {a.detail && <p className="mt-0.5 break-words text-xs text-fg-muted">{a.detail}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-fg-subtle" title={formatDateTime(a.at)}>
                        {timeAgo(a.at)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {/* Metadata */}
            <Section title="Details">
              <DescriptionList
                items={[
                  { label: 'Received', value: formatDateTime(s.createdAt) },
                  { label: 'Form', value: s.formName },
                  {
                    label: 'Page',
                    value: detail?.pageUrl ? (
                      <a href={detail.pageUrl} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
                        {detail.pageUrl}
                      </a>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Referrer', value: detail?.referrer ? <span className="break-all">{detail.referrer}</span> : '—' },
                  { label: 'User agent', value: detail?.userAgent ? <span className="break-words font-mono text-xs text-fg-muted">{detail.userAgent}</span> : '—' },
                  { label: 'Spam score', value: <SpamScore score={s.spamScore} /> },
                  {
                    label: 'ID',
                    value: (
                      <span className="flex items-center gap-1">
                        <span className="truncate font-mono text-xs">{s.id}</span>
                        <CopyButton value={s.id} label="Copy ID" />
                      </span>
                    ),
                  },
                ]}
              />
            </Section>
          </div>
        ) : null}
      </SheetContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="Delete this submission?"
        description="Its values, notes and activity are removed permanently."
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync()}
      />
    </Sheet>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="px-4 py-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
        {title}
        {count ? <span className="rounded-sm bg-surface-3 px-1 tabular-nums normal-case text-fg-muted">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function SpamScore({ score }: { score: number | undefined }) {
  if (score === undefined || score === null || Number.isNaN(score)) return <>—</>;
  const ratio = score > 1 ? score / 100 : score;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{ratio.toFixed(2)}</span>
      {ratio >= 0.5 && (
        <Badge size="xs" tone="danger">
          Likely spam
        </Badge>
      )}
    </span>
  );
}

function ValuesSkeleton() {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-7 w-full" />
      </div>
      <ValuesSkeleton />
    </div>
  );
}
