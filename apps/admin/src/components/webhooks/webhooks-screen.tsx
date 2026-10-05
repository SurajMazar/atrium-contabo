'use client';

import type { Webhook, WebsiteSummary } from '@atrium/sdk';
import {
  Button,
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
  Switch,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tooltip,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, MoreHorizontal, Pencil, Plus, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { eventsSummary } from './events';
import { SecretDialog } from './secret-dialog';
import { WebhookDetailSheet } from './webhook-detail-sheet';
import { WebhookDialog } from './webhook-dialog';

export function WebhooksScreen({ orgId }: { orgId: string }) {
  return (
    <PermissionPage permission="webhook.manage">
      <WebhooksInner orgId={orgId} />
    </PermissionPage>
  );
}

function WebhooksInner({ orgId }: { orgId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.webhooks(orgId);
  const list = useQuery({ queryKey: key, queryFn: () => api.webhooks.list(orgId) });
  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId), staleTime: 60_000 });

  const [editing, setEditing] = useState<Webhook | 'new' | null>(null);
  const [created, setCreated] = useState<Webhook | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);

  const websiteById = useMemo(() => new Map<string, WebsiteSummary>((websites.data ?? []).map((w) => [w.id, w])), [websites.data]);
  const websiteName = (id: string | null) => (id ? (websiteById.get(id)?.name ?? (websites.isPending ? '…' : 'Unknown website')) : 'All websites');

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.webhooks.update(id, { enabled }),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Webhook[]>(key);
      qc.setQueryData<Webhook[]>(key, (rows) => rows?.map((w) => (w.id === id ? { ...w, enabled } : w)));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(err, 'Could not update webhook'));
    },
    onSuccess: (_r, { enabled }) => toast.success(enabled ? 'Webhook enabled' : 'Webhook paused'),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const ping = useMutation({
    mutationFn: (id: string) => api.webhooks.test(id),
    onSuccess: (_d, id) => {
      toast.success('Test ping queued', { action: { label: 'View', onClick: () => setDetailId(id) } });
      void qc.invalidateQueries({ queryKey: qk.webhookDeliveries(id) });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not send test ping')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.webhooks.remove(id),
    onSuccess: () => {
      toast.success('Webhook deleted');
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete webhook')),
  });

  const rows = list.data ?? [];
  const detail = rows.find((w) => w.id === detailId) ?? null;

  return (
    <Page>
      <PageHeader
        title="Webhooks"
        description="Send signed HTTP requests to your systems when forms are submitted, sites are published and more."
        actions={
          rows.length > 0 && (
            <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
              Add webhook
            </Button>
          )
        }
      />

      {list.isPending ? (
        <TableContainer>
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-11 items-center gap-4 px-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="ml-auto h-4 w-10" />
              </div>
            ))}
          </div>
        </TableContainer>
      ) : list.isError ? (
        <TableContainer>
          <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
        </TableContainer>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<WebhookIcon />}
            title="No webhooks"
            description="Push form submissions to your CRM, trigger builds after publishing, or notify a chat channel. Each request is signed so you can verify it came from Atrium."
            action={
              <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
                Add webhook
              </Button>
            }
          />
        </div>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>URL</TH>
                <TH>Events</TH>
                <TH className="hidden md:table-cell">Scope</TH>
                <TH align="center">Enabled</TH>
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((w) => (
                <TR key={w.id} interactive onClick={() => setDetailId(w.id)}>
                  <TD>
                    <button type="button" className="font-medium text-fg outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), setDetailId(w.id))}>
                      {w.name}
                    </button>
                    <div className="text-xs text-fg-subtle" title={formatDateTime(w.createdAt)}>
                      Added {timeAgo(w.createdAt)}
                    </div>
                  </TD>
                  <TD mono className="max-w-[280px] truncate text-fg-muted" title={w.url}>
                    {w.url.replace(/^https:\/\//, '')}
                  </TD>
                  <TD muted>
                    <Tooltip content={<span className="font-mono text-xs">{w.events.join(', ')}</span>}>
                      <span tabIndex={0} className="outline-none">
                        {eventsSummary(w.events)}
                      </span>
                    </Tooltip>
                  </TD>
                  <TD muted className="hidden md:table-cell">
                    {websiteName(w.websiteId)}
                  </TD>
                  <TD align="center" onClick={(e) => e.stopPropagation()}>
                    <Switch size="sm" aria-label={`${w.enabled ? 'Pause' : 'Enable'} ${w.name}`} checked={w.enabled} onCheckedChange={(v) => toggle.mutate({ id: w.id, enabled: v })} />
                  </TD>
                  <TD align="right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton label="Webhook actions" size="sm" variant="ghost">
                          <MoreHorizontal />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<History />} onSelect={() => setDetailId(w.id)}>
                          View deliveries
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing(w)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Send />} onSelect={() => ping.mutate(w.id)}>
                          Send test ping
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(w)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <WebhookDialog orgId={orgId} target={editing} onOpenChange={(o) => !o && setEditing(null)} onCreated={(w) => (w.secret ? setCreated(w) : toast.success('Webhook added'))} />
      <SecretDialog
        webhook={created?.secret ? created : null}
        onOpenChange={(o) => {
          if (!o) {
            toast.success('Webhook added');
            setCreated(null);
          }
        }}
      />
      <WebhookDetailSheet webhook={detail} websiteName={websiteName} onOpenChange={(o) => !o && setDetailId(null)} onEdit={(w) => setEditing(w)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="Atrium stops sending events to this endpoint immediately and its delivery history is removed."
        confirmLabel="Delete webhook"
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : undefined)}
      />
    </Page>
  );
}
