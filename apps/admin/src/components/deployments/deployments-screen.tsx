'use client';

import type { Deployment } from '@atrium/sdk';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, Table, TBody, TD, TH, THead, TR, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ExternalLink, Rocket } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage, RequirePermission } from '@/components/common/permission';
import { DeploymentStatus } from '@/components/common/status';
import { errorMessage, useApi } from '@/lib/api';
import { durationBetween, formatDateTime, formatDuration, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useWebsite } from '@/lib/website-context';
import { DeploymentModeCard } from './deployment-mode-card';
import { DeploymentSheet, isActive, targetLabel } from './deployment-sheet';

export function DeploymentsScreen({ websiteId }: { websiteId: string }) {
  return (
    <PermissionPage permission="deployment.read" websiteId={websiteId}>
      <Deployments websiteId={websiteId} />
    </PermissionPage>
  );
}

function Deployments({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { website, organizationId } = useWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get('d');
  const [confirmProd, setConfirmProd] = useState(false);

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('d', id);
    else next.delete('d');
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const q = useQuery({
    queryKey: qk.deployments(websiteId),
    queryFn: () => api.deployments.list(websiteId),
    refetchInterval: (query) => (query.state.data?.some((d) => isActive(d.status)) ? 3000 : false),
  });

  const hasVersion = !!website?.publishedVersionId;
  const independentUnset = website?.deploymentMode === 'INDEPENDENT' && !website.deploymentIntegrationId;
  const blockedReason = !hasVersion ? 'Publish the website first' : independentUnset ? 'Choose a deployment integration first' : null;

  const added = (d: Deployment) => {
    qc.setQueryData<Deployment[]>(qk.deployments(websiteId), (list) => [d, ...(list ?? []).filter((x) => x.id !== d.id)]);
    void qc.invalidateQueries({ queryKey: qk.deployments(websiteId) });
    void qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) });
    setOpen(d.id);
  };

  const create = useMutation({
    mutationFn: (target: 'preview' | 'production') => api.deployments.create(websiteId, { target }),
    onSuccess: (d, target) => {
      toast.success(target === 'production' ? 'Production deployment queued' : 'Preview deployment queued');
      added(d);
    },
    onError: (err) => toast.error('Could not start deployment', { description: errorMessage(err) }),
  });

  const rows = q.data ?? [];
  const initial = rows.find((d) => d.id === openId);

  return (
    <Page width="wide">
      <PageHeader
        title="Deployments"
        description="Builds of published versions to preview and production."
        meta={blockedReason ? <span className="text-warning">{blockedReason} to start a deployment.</span> : undefined}
        actions={
          <>
            <RequirePermission permission="deployment.preview" websiteId={websiteId}>
              <Button size="sm" leadingIcon={<Eye />} disabled={!!blockedReason} loading={create.isPending && create.variables === 'preview'} onClick={() => create.mutate('preview')}>
                Deploy preview
              </Button>
            </RequirePermission>
            <RequirePermission permission="deployment.publish" websiteId={websiteId}>
              <Button size="sm" variant="primary" leadingIcon={<Rocket />} disabled={!!blockedReason} loading={create.isPending && create.variables === 'production'} onClick={() => setConfirmProd(true)}>
                Publish to production
              </Button>
            </RequirePermission>
          </>
        }
      />

      <div className="space-y-4">
        <DeploymentModeCard websiteId={websiteId} website={website} organizationId={organizationId} />

        <Card>
          <CardHeader title="History" description={rows.some((d) => isActive(d.status)) ? 'Refreshing while a deployment is in progress' : undefined} />
          {q.isPending ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex h-10 items-center gap-4 px-3">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3.5 w-10" />
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="ml-auto h-3 w-20" />
                </div>
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<Rocket />} title="No deployments yet" description={hasVersion ? 'Deploy a preview to check a build before it goes to production.' : 'Publish the website to create a version you can deploy.'} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Status</TH>
                    <TH>Target</TH>
                    <TH>Version</TH>
                    <TH className="hidden lg:table-cell">URL</TH>
                    <TH align="right">Duration</TH>
                    <TH className="hidden md:table-cell">Triggered by</TH>
                    <TH align="right">Created</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((d) => (
                    <TR
                      key={d.id}
                      interactive
                      selected={d.id === openId}
                      tabIndex={0}
                      aria-label={`${targetLabel(d.target)} deployment, ${d.status.toLowerCase()}, ${timeAgo(d.createdAt)}`}
                      onClick={() => setOpen(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpen(d.id);
                        }
                      }}
                      className="outline-none focus-visible:bg-surface-2"
                    >
                      <TD className="whitespace-nowrap">
                        <DeploymentStatus status={d.status} />
                      </TD>
                      <TD>
                        <Badge tone={d.target === 'PRODUCTION' ? 'accent' : 'outline'} size="xs">
                          {targetLabel(d.target)}
                        </Badge>
                      </TD>
                      <TD mono muted>
                        {d.versionNumber ? `v${d.versionNumber}` : '—'}
                      </TD>
                      <TD className="hidden max-w-[280px] lg:table-cell">
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1 text-fg-muted hover:text-fg hover:underline">
                            <span className="truncate">{d.url.replace(/^https?:\/\//, '')}</span>
                            <ExternalLink className="size-3 shrink-0" strokeWidth={1.5} />
                          </a>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </TD>
                      <TD align="right" muted>
                        {d.startedAt ? formatDuration(durationBetween(d.startedAt, d.finishedAt)) : '—'}
                      </TD>
                      <TD muted className="hidden md:table-cell">
                        {d.triggeredBy?.name ?? 'System'}
                      </TD>
                      <TD align="right" muted className="whitespace-nowrap">
                        <span title={formatDateTime(d.createdAt)}>{timeAgo(d.createdAt)}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <DeploymentSheet websiteId={websiteId} deploymentId={openId} initial={initial} onOpenChange={(o) => !o && setOpen(null)} onCreated={added} />
      <ConfirmDialog
        open={confirmProd}
        onOpenChange={setConfirmProd}
        title="Publish to production?"
        description={`The live version is rebuilt and deployed to your production domain${website?.primaryDomain ? ` (${website.primaryDomain})` : ''}.`}
        confirmLabel="Deploy to production"
        onConfirm={() => create.mutateAsync('production')}
      />
    </Page>
  );
}
