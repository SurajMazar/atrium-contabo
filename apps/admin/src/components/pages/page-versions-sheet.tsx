'use client';

import type { PageSummary, PageVersion } from '@atrium/sdk';
import { Badge, Button, cn, ConfirmDialog, EmptyState, ErrorState, Input, Sheet, SheetContent, Skeleton, SkeletonRows, toast, type BadgeTone } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, pluralize, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

const sourceTone: Record<string, BadgeTone> = { MANUAL: 'accent', AUTOSAVE: 'neutral', RESTORE: 'warning', PUBLISH: 'success', AI: 'accent' };
const humanize = (s: string) => s.replace(/[_.-]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function PageVersionsSheet({ websiteId, page, onOpenChange }: { websiteId: string; page: PageSummary | null; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canEdit = can('page.update', websiteId);
  const pageId = page?.id ?? '';
  const [selected, setSelected] = useState<PageVersion | null>(null);
  const [message, setMessage] = useState('');
  const [restoring, setRestoring] = useState<PageVersion | null>(null);

  useEffect(() => {
    setSelected(null);
    setMessage('');
  }, [pageId]);

  const versions = useQuery({ queryKey: qk.pageVersions(pageId), queryFn: () => api.pages.versions(pageId), enabled: !!page });
  const current = useQuery({ queryKey: qk.page(pageId), queryFn: () => api.pages.get(pageId), enabled: !!page && !!selected, staleTime: 15_000 });

  const checkpoint = useMutation({
    mutationFn: () => api.pages.createVersion(pageId, message.trim()),
    onSuccess: (v) => {
      setMessage('');
      qc.setQueryData<PageVersion[]>(qk.pageVersions(pageId), (list) => (list ? [v, ...list] : [v]));
      toast.success(`Saved checkpoint v${v.number}`);
    },
    onError: (err) => toast.error('Could not save checkpoint', { description: errorMessage(err) }),
  });

  const restore = useMutation({
    mutationFn: (v: PageVersion) => api.pages.restoreVersion(pageId, v.id),
    onSuccess: (res, v) => {
      toast.success(`Restored v${v.number}`, { description: 'A checkpoint of the previous state was saved first.' });
      qc.setQueryData(qk.page(pageId), res);
      void qc.invalidateQueries({ queryKey: qk.pageVersions(pageId) });
      void qc.invalidateQueries({ queryKey: qk.pages(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
      setSelected(null);
    },
    onError: (err) => toast.error('Could not restore version', { description: errorMessage(err) }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) checkpoint.mutate();
  };

  return (
    <Sheet open={!!page} onOpenChange={onOpenChange}>
      <SheetContent size="lg" title="Version history" description={page ? `${page.title} · /${page.slug}` : undefined} bodyClassName="flex flex-col">
        {canEdit && (
          <form onSubmit={submit} className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Input size="sm" className="flex-1" placeholder="Checkpoint message, e.g. Before hero redesign" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} aria-label="Checkpoint message" />
            <Button size="sm" type="submit" leadingIcon={<Save />} loading={checkpoint.isPending} disabled={!message.trim()}>
              Save checkpoint
            </Button>
          </form>
        )}

        {selected && (
          <ComparePanel
            version={selected}
            current={current.data ? { title: current.data.title, slug: current.data.slug, sections: current.data.document?.sections?.length ?? 0, updatedAt: current.data.updatedAt, revision: current.data.revision } : null}
            loading={current.isPending}
            canRestore={canEdit}
            onRestore={() => setRestoring(selected)}
            onClose={() => setSelected(null)}
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {versions.isPending ? (
            <SkeletonRows rows={6} />
          ) : versions.isError ? (
            <ErrorState description={versions.error.message} onRetry={() => void versions.refetch()} />
          ) : versions.data.length === 0 ? (
            <EmptyState compact icon={<History />} title="No versions yet" description="Checkpoints are saved automatically while editing, or save one now." />
          ) : (
            <ul className="divide-y divide-border" role="listbox" aria-label="Page versions">
              {versions.data.map((v) => {
                const active = selected?.id === v.id;
                return (
                  <li key={v.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => setSelected(active ? null : v)}
                      className={cn('flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2', active && 'bg-accent-soft/50 hover:bg-accent-soft/60')}
                    >
                      <span className="mt-0.5 w-9 shrink-0 font-mono text-xs text-fg-muted">v{v.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{v.message || v.title}</span>
                        <span className="block text-xs text-fg-muted" title={formatDateTime(v.createdAt)}>
                          {v.createdBy ?? 'System'} · {timeAgo(v.createdAt)}
                        </span>
                      </span>
                      <Badge tone={sourceTone[v.source.toUpperCase()] ?? 'neutral'} size="xs">
                        {humanize(v.source)}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ConfirmDialog
          open={!!restoring}
          onOpenChange={(o) => !o && setRestoring(null)}
          title={restoring ? `Restore v${restoring.number}?` : 'Restore version'}
          description="The page draft is replaced with this version. The current state is saved as a checkpoint first, so you can undo this."
          confirmLabel="Restore"
          onConfirm={async () => {
            if (restoring) await restore.mutateAsync(restoring);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function ComparePanel({
  version,
  current,
  loading,
  canRestore,
  onRestore,
  onClose,
}: {
  version: PageVersion;
  current: { title: string; slug: string; sections: number; updatedAt: string; revision: number } | null;
  loading: boolean;
  canRestore: boolean;
  onRestore: () => void;
  onClose: () => void;
}) {
  const titleChanged = current && current.title !== version.title;
  return (
    <section aria-label="Compare" className="border-b border-border bg-surface-2/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Compare</span>
        <button type="button" onClick={onClose} className="text-xs text-fg-muted hover:text-fg">
          Clear
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <div className="text-xs text-fg-muted">Selected · v{version.number}</div>
          <div className="mt-0.5 truncate text-sm font-medium text-fg">{version.title}</div>
          <div className="mt-0.5 text-xs text-fg-subtle">{formatDateTime(version.createdAt)}</div>
        </div>
        <ArrowRight className="size-4 self-center text-fg-subtle" strokeWidth={1.5} />
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <div className="text-xs text-fg-muted">Current draft</div>
          {loading || !current ? (
            <>
              <Skeleton className="mt-1.5 h-3.5 w-2/3" />
              <Skeleton className="mt-1.5 h-3 w-1/2" />
            </>
          ) : (
            <>
              <div className="mt-0.5 truncate text-sm font-medium text-fg">{current.title}</div>
              <div className="mt-0.5 text-xs text-fg-subtle">
                {pluralize(current.sections, 'section')} · edited {timeAgo(current.updatedAt)}
              </div>
            </>
          )}
        </div>
      </div>
      {current && (
        <p className="mt-2 text-xs text-fg-muted">
          {titleChanged ? (
            <>
              Title changed from <span className="text-fg">“{version.title}”</span> to <span className="text-fg">“{current.title}”</span>.{' '}
            </>
          ) : (
            'Title is unchanged. '
          )}
          Section-level differences for page checkpoints aren’t available here — open the page in the editor after restoring to review, or compare published versions under Versions.
        </p>
      )}
      {canRestore && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" leadingIcon={<RotateCcw />} onClick={onRestore}>
            Restore v{version.number}
          </Button>
        </div>
      )}
    </section>
  );
}
