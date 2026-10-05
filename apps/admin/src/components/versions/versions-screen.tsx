'use client';

import type { WebsiteVersion } from '@atrium/sdk';
import {
  Badge,
  Card,
  CardHeader,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
  type BadgeTone,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitCompare, History, MoreHorizontal, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PublishButton, useInvalidatePublishing } from '@/components/dashboard/publish-action';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { CompareVersions, DRAFT } from './compare-versions';
import { PreviewLinks } from './preview-links';

const sourceTone: Record<string, BadgeTone> = { MANUAL: 'neutral', PUBLISH: 'neutral', AI: 'accent', ROLLBACK: 'warning', RESTORE: 'warning', API: 'outline', SCHEDULED: 'accent' };
const humanize = (s: string) => s.replace(/[_.-]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function VersionsScreen({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const invalidate = useInvalidatePublishing(websiteId);
  const canRestore = can('page.update', websiteId);
  const canPublish = can('page.publish', websiteId);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string>(DRAFT);
  const [restoring, setRestoring] = useState<WebsiteVersion | null>(null);
  const [republishing, setRepublishing] = useState<WebsiteVersion | null>(null);

  const q = useQuery({ queryKey: qk.versions(websiteId), queryFn: () => api.websites.versions(websiteId) });

  // Default comparison: live (or latest) version → current draft.
  useEffect(() => {
    if (from === null && q.data?.length) setFrom((q.data.find((v) => v.isPublished) ?? q.data[0])!.id);
  }, [q.data, from]);

  const restore = useMutation({
    mutationFn: (v: WebsiteVersion) => api.websites.restoreVersion(websiteId, v.id),
    onSuccess: (_r, v) => {
      toast.success(`Draft restored from v${v.number}`, { description: 'Review it in the editor, then publish when ready.' });
      void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.pages(websiteId) });
      void qc.invalidateQueries({ queryKey: ['website', websiteId, 'compare'] });
    },
    onError: (err) => toast.error('Could not restore version', { description: errorMessage(err) }),
  });

  const republish = useMutation({
    mutationFn: (v: WebsiteVersion) => api.websites.republishVersion(websiteId, v.id),
    onSuccess: async (res, v) => {
      toast.success(`v${v.number} is live again`, { description: `Published as version ${res.version.number}.` });
      await invalidate();
    },
    onError: (err) => toast.error('Could not re-publish version', { description: errorMessage(err) }),
  });

  const compareWithDraft = (v: WebsiteVersion) => {
    setFrom(v.id);
    setTo(DRAFT);
    document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Page width="wide">
      <PageHeader title="Versions" description="Every publish freezes an immutable snapshot you can compare, restore or roll back to." actions={<PublishButton websiteId={websiteId} />} />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Published versions" />
          {q.isPending ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex h-10 items-center gap-4 px-3">
                  <Skeleton className="h-3.5 w-8" />
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="ml-auto h-3 w-24" />
                </div>
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : q.data.length === 0 ? (
            <EmptyState icon={<History />} title="Nothing published yet" description="Publish the website to create the first version." action={<PublishButton websiteId={websiteId} />} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-16">Version</TH>
                    <TH>Message</TH>
                    <TH>Source</TH>
                    <TH className="hidden md:table-cell">Published by</TH>
                    <TH align="right">Created</TH>
                    <TH className="w-10">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {q.data.map((v) => (
                    <TR key={v.id} selected={v.id === from} className="hover:bg-surface-2/40">
                      <TD mono className="text-fg">
                        v{v.number}
                      </TD>
                      <TD className="max-w-[420px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-fg">{v.message || <span className="text-fg-muted">No message</span>}</span>
                          {v.isPublished && (
                            <Badge tone="success" dot>
                              Live
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={sourceTone[v.source.toUpperCase()] ?? 'neutral'}>{humanize(v.source)}</Badge>
                      </TD>
                      <TD muted className="hidden md:table-cell">
                        {v.createdBy ?? 'System'}
                      </TD>
                      <TD muted align="right" className="whitespace-nowrap">
                        <span title={formatDateTime(v.createdAt)}>{timeAgo(v.createdAt)}</span>
                      </TD>
                      <TD className="pl-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton label={`Actions for v${v.number}`} size="xs">
                              <MoreHorizontal />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem icon={<GitCompare />} onSelect={() => compareWithDraft(v)}>
                              Compare with draft
                            </DropdownMenuItem>
                            {(canRestore || (canPublish && !v.isPublished)) && <DropdownMenuSeparator />}
                            {canRestore && (
                              <DropdownMenuItem icon={<Undo2 />} onSelect={() => setRestoring(v)}>
                                Restore to draft
                              </DropdownMenuItem>
                            )}
                            {canPublish && !v.isPublished && (
                              <DropdownMenuItem icon={<RotateCcw />} onSelect={() => setRepublishing(v)}>
                                Re-publish this version
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>

        {q.data && q.data.length > 0 && <CompareVersions websiteId={websiteId} versions={q.data} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />}

        <PreviewLinks websiteId={websiteId} />
      </div>

      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(o) => !o && setRestoring(null)}
        tone="danger"
        title={restoring ? `Restore v${restoring.number} to the draft?` : 'Restore version'}
        description="The current draft — every page, the theme, navigation and settings — is overwritten with this version. Unpublished changes are lost. The live site is not affected until you publish."
        confirmLabel="Overwrite draft"
        onConfirm={async () => {
          if (restoring) await restore.mutateAsync(restoring);
        }}
      />
      <ConfirmDialog
        open={!!republishing}
        onOpenChange={(o) => !o && setRepublishing(null)}
        title={republishing ? `Roll back to v${republishing.number}?` : 'Re-publish version'}
        description="The live site switches to this version right away. Your draft is kept as it is."
        confirmLabel="Re-publish"
        onConfirm={async () => {
          if (republishing) await republish.mutateAsync(republishing);
        }}
      />
    </Page>
  );
}
