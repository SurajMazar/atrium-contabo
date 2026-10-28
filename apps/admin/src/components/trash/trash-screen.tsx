'use client';

import type { TrashedWebsite } from '@atrium/sdk';
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, Table, TableContainer, TBody, TD, TH, THead, TR, toast } from '@atrium/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';

export function TrashScreen({ orgId }: { orgId: string }) {
  return (
    <PermissionPage permission="website.delete">
      <Trash orgId={orgId} />
    </PermissionPage>
  );
}

function size(bytes: number) {
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function Trash({ orgId }: { orgId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.trash(orgId), queryFn: () => api.websites.trash(orgId) });
  const [purging, setPurging] = useState<TrashedWebsite | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.trash(orgId) }), qc.invalidateQueries({ queryKey: qk.websites(orgId) })]);

  const restore = async (site: TrashedWebsite) => {
    setRestoring(site.id);
    try {
      const res = await api.websites.restore(orgId, site.id);
      toast.success(`${site.name} restored`, { description: `Its address is ${res.slug} again. Reconnect any custom domain.` });
      await refresh();
    } catch (err) {
      toast.error('Could not restore website', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setRestoring(null);
    }
  };

  const purge = async () => {
    if (!purging) return;
    try {
      const res = await api.websites.purge(orgId, purging.id);
      toast.success(`${purging.name} permanently deleted`, {
        description: `${res.mediaDeleted} media file(s) deleted${res.mediaKept ? `, ${res.mediaKept} kept because another website still uses them` : ''}.`,
      });
    } catch (err) {
      toast.error('Could not delete website', { description: err instanceof Error ? err.message : undefined });
      throw err;
    }
    await refresh();
  };

  return (
    <Page>
      <PageHeader title="Trash" description="Deleted websites stay here until you restore them or delete them permanently." />
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <ErrorState title="Could not load the trash" description={q.error instanceof Error ? q.error.message : undefined} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<Trash2 />} title="Trash is empty" description="Websites you delete appear here." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Website</TH>
                <TH>Deleted</TH>
                <TH>Pages</TH>
                <TH>Submissions</TH>
                <TH>Media</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {q.data.map((site) => (
                <TR key={site.id}>
                  <TD className="font-medium text-fg">{site.name}</TD>
                  <TD title={formatDateTime(site.deletedAt)}>{timeAgo(site.deletedAt)}</TD>
                  <TD>{site.pages}</TD>
                  <TD>{site.submissions}</TD>
                  <TD>{site.media ? `${site.media} · ${size(site.mediaBytes)}` : '—'}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} loading={restoring === site.id} onClick={() => restore(site)}>
                        Restore
                      </Button>
                      <Button size="sm" variant="danger" leadingIcon={<Trash2 />} onClick={() => setPurging(site)}>
                        Delete permanently
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
      {purging && (
        <ConfirmDialog
          open={!!purging}
          onOpenChange={(open) => !open && setPurging(null)}
          tone="danger"
          title={`Permanently delete ${purging.name}?`}
          description="Its pages, versions, forms, submissions, deployments and analytics are deleted, and its media files are removed from storage unless another website still uses them. This cannot be undone."
          confirmText={purging.name}
          confirmLabel="Delete permanently"
          onConfirm={purge}
        />
      )}
    </Page>
  );
}
