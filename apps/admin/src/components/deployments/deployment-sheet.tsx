'use client';

import type { Deployment } from '@atrium/sdk';
import { Badge, Banner, Button, cn, ConfirmDialog, DescriptionList, ErrorState, Sheet, SheetContent, Skeleton, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, CircleX, ExternalLink, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DeploymentStatus } from '@/components/common/status';
import { errorMessage, useApi } from '@/lib/api';
import { durationBetween, formatDateTime, formatDuration, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

export const isActive = (s: Deployment['status']) => s === 'QUEUED' || s === 'BUILDING';
export const targetLabel = (t: Deployment['target']) => (t === 'PRODUCTION' ? 'Production' : 'Preview');

export function DeploymentSheet({ websiteId, deploymentId, initial, onOpenChange, onCreated }: { websiteId: string; deploymentId: string | null; initial?: Deployment; onOpenChange: (o: boolean) => void; onCreated: (d: Deployment) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canPublish = can('deployment.publish', websiteId);
  const [confirm, setConfirm] = useState<'rollback' | 'cancel' | null>(null);

  const q = useQuery({
    queryKey: qk.deployment(deploymentId ?? ''),
    queryFn: () => api.deployments.get(deploymentId!),
    enabled: !!deploymentId,
    placeholderData: initial,
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.status) ? 2000 : false),
  });
  const d = q.data;

  // Keep the history row in sync with live status.
  useEffect(() => {
    if (!d || q.isPlaceholderData) return;
    qc.setQueryData<Deployment[]>(qk.deployments(websiteId), (list) => list?.map((x) => (x.id === d.id ? { ...x, ...d, logs: undefined, triggeredBy: x.triggeredBy } : x)));
  }, [d, q.isPlaceholderData, qc, websiteId]);

  const action = useMutation({
    mutationFn: (kind: 'redeploy' | 'rollback' | 'cancel') => api.deployments[kind](deploymentId!),
    onSuccess: (res, kind) => {
      void qc.invalidateQueries({ queryKey: qk.deployments(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) });
      if (kind === 'cancel') {
        qc.setQueryData(qk.deployment(res.id), res);
        toast.success('Deployment cancelled');
      } else {
        toast.success(kind === 'rollback' ? 'Rollback queued' : 'Redeploy queued');
        if (kind === 'rollback') void qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true });
        onCreated(res);
      }
    },
    onError: (err) => toast.error('Action failed', { description: errorMessage(err) }),
  });

  return (
    <Sheet open={!!deploymentId} onOpenChange={onOpenChange}>
      <SheetContent
        size="xl"
        title={d ? `${targetLabel(d.target)} deployment${d.versionNumber ? ` · v${d.versionNumber}` : ''}` : 'Deployment'}
        description={d ? `Started ${timeAgo(d.createdAt)}` : undefined}
        bodyClassName="flex flex-col gap-4 p-4"
        footer={
          d && (
            <>
              {d.inspectorUrl && (
                <Button size="sm" variant="ghost" className="mr-auto" asChild>
                  <a href={d.inspectorUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open in provider
                  </a>
                </Button>
              )}
              {isActive(d.status) && canPublish && (
                <Button size="sm" variant="danger-ghost" leadingIcon={<Square />} onClick={() => setConfirm('cancel')}>
                  Cancel
                </Button>
              )}
              {d.status === 'READY' && d.target === 'PRODUCTION' && canPublish && (
                <Button size="sm" leadingIcon={<RotateCcw />} onClick={() => setConfirm('rollback')}>
                  Roll back to this
                </Button>
              )}
              {!isActive(d.status) && canPublish && (
                <Button size="sm" leadingIcon={<RefreshCw />} loading={action.isPending && action.variables === 'redeploy'} onClick={() => action.mutate('redeploy')}>
                  Redeploy
                </Button>
              )}
            </>
          )
        }
      >
        {!d && q.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </div>
        ) : q.isError && !d ? (
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        ) : d ? (
          <>
            {d.status === 'FAILED' && d.error && (
              <Banner tone="danger" icon={<CircleX />}>
                <p className="font-medium">Deployment failed</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs text-fg-muted">{d.error}</p>
              </Banner>
            )}
            <DescriptionList
              items={[
                { label: 'Status', value: <DeploymentStatus status={d.status} /> },
                {
                  label: 'Target',
                  value: (
                    <Badge tone={d.target === 'PRODUCTION' ? 'accent' : 'outline'} size="xs">
                      {targetLabel(d.target)}
                    </Badge>
                  ),
                },
                {
                  label: 'URL',
                  value: d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-fg hover:underline">
                      {d.url.replace(/^https?:\/\//, '')}
                      <ExternalLink className="size-3 shrink-0 text-fg-subtle" strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span className="text-fg-subtle">Available when ready</span>
                  ),
                },
                { label: 'Version', value: d.versionNumber ? `v${d.versionNumber}` : '—' },
                { label: 'Provider', value: d.provider },
                { label: 'Triggered by', value: d.triggeredBy?.name ?? 'System' },
                { label: 'Created', value: formatDateTime(d.createdAt) },
                { label: 'Duration', value: d.startedAt ? `${formatDuration(durationBetween(d.startedAt, d.finishedAt))}${isActive(d.status) ? ' so far' : ''}` : '—' },
                ...(d.externalId ? [{ label: 'External ID', value: <span className="font-mono text-xs">{d.externalId}</span> }] : []),
              ]}
            />
            <LogViewer logs={d.logs ?? []} live={isActive(d.status)} />
          </>
        ) : null}

        <ConfirmDialog
          open={confirm === 'rollback'}
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Roll back production?"
          description={`Production is redeployed with ${d?.versionNumber ? `v${d.versionNumber}` : 'this deployment’s version'}, and it becomes the live version.`}
          confirmLabel="Roll back"
          onConfirm={() => action.mutateAsync('rollback')}
        />
        <ConfirmDialog
          open={confirm === 'cancel'}
          onOpenChange={(o) => !o && setConfirm(null)}
          tone="danger"
          title="Cancel this deployment?"
          description="The build stops and nothing is deployed. You can redeploy later."
          confirmLabel="Cancel deployment"
          cancelLabel="Keep running"
          onConfirm={() => action.mutateAsync('cancel')}
        />
      </SheetContent>
    </Sheet>
  );
}

const levelCls: Record<string, string> = {
  error: 'text-danger',
  fatal: 'text-danger',
  warn: 'text-warning',
  warning: 'text-warning',
  info: 'text-fg',
  debug: 'text-fg-subtle',
};

function LogViewer({ logs, live }: { logs: NonNullable<Deployment['logs']>; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length, follow]);

  return (
    <section aria-label="Build logs" className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface-2">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">Logs</span>
        <span className="tabular-nums text-fg-subtle">{logs.length}</span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-warning">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            Live
          </span>
        )}
        {!follow && (
          <button
            type="button"
            onClick={() => setFollow(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-sm px-1 text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowDownToLine className="size-3.5" strokeWidth={1.5} />
            Jump to latest
          </button>
        )}
      </div>
      <div
        ref={ref}
        tabIndex={0}
        role="log"
        aria-live={live ? 'polite' : 'off'}
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {logs.length === 0 ? (
          <p className="text-fg-subtle">{live ? 'Waiting for logs…' : 'No logs were recorded for this deployment.'}</p>
        ) : (
          logs.map((l, i) => {
            const level = String(l.level ?? 'info').toLowerCase();
            return (
              <div key={i} className="grid grid-cols-[72px_44px_minmax(0,1fr)] gap-2">
                <span className="select-none text-fg-subtle tabular-nums">{new Date(l.timestamp).toLocaleTimeString(undefined, { hour12: false })}</span>
                <span className={cn('select-none uppercase', levelCls[level] ?? 'text-fg-muted')}>{level.slice(0, 5)}</span>
                <span className={cn('whitespace-pre-wrap break-words', level === 'error' || level === 'fatal' ? 'text-danger' : level === 'warn' || level === 'warning' ? 'text-warning' : 'text-fg')}>{l.message}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
