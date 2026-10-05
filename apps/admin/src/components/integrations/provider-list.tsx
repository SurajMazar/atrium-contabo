'use client';

import type { DriverInfo, ProviderRecord, WebsiteSummary } from '@atrium/sdk';
import {
  Badge,
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
  Skeleton,
  StatusDot,
  Switch,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Send, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { providerApi, type KindMeta } from './kinds';
import { ProviderSheet } from './provider-sheet';
import { TestDialog } from './test-dialog';

export function ProviderList({ orgId, meta }: { orgId: string; meta: KindMeta }) {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.providers(orgId, meta.kind);
  const pa = providerApi(api, meta);

  const list = useQuery({ queryKey: key, queryFn: () => pa.list(orgId) });
  const drivers = useQuery({ queryKey: qk.drivers(meta.kind), queryFn: () => api.providers.drivers(meta.kind), staleTime: 5 * 60_000 });
  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId), enabled: meta.scoped, staleTime: 60_000 });

  const [editing, setEditing] = useState<ProviderRecord | 'new' | null>(null);
  const [testing, setTesting] = useState<ProviderRecord | null>(null);
  const [deleting, setDeleting] = useState<ProviderRecord | null>(null);

  const driverById = useMemo(() => new Map<string, DriverInfo>((drivers.data ?? []).map((d) => [d.id, d])), [drivers.data]);
  const websiteById = useMemo(() => new Map<string, WebsiteSummary>((websites.data ?? []).map((w) => [w.id, w])), [websites.data]);

  const patch = useMutation({
    mutationFn: (vars: { id: string; body: { isDefault?: boolean; enabled?: boolean } }) => pa.update(vars.id, vars.body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ProviderRecord[]>(key);
      qc.setQueryData<ProviderRecord[]>(key, (rows) => {
        if (!rows) return rows;
        const target = rows.find((r) => r.id === id);
        return rows.map((r) => {
          if (r.id === id) return { ...r, ...body };
          // Only one default per scope.
          if (body.isDefault && target && (meta.scoped ? r.websiteId === target.websiteId : true)) return { ...r, isDefault: false };
          return r;
        });
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(err, 'Could not update provider'));
    },
    onSuccess: (_r, { body }) => {
      if (body.isDefault) toast.success('Default updated');
      else if (body.enabled !== undefined) toast.success(body.enabled ? 'Provider enabled' : 'Provider disabled');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => pa.remove(id),
    onSuccess: () => {
      toast.success(`${meta.noun} deleted`);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete provider')),
  });

  const scopeLabel = (r: ProviderRecord) => {
    if (!meta.scoped || !r.websiteId) return <span className="text-fg-muted">All websites</span>;
    const w = websiteById.get(r.websiteId);
    return <span className="text-fg">{w?.name ?? (websites.isPending ? '…' : 'Unknown website')}</span>;
  };

  const rows = list.data ?? [];
  const Icon = meta.icon;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{rows.length > 0 ? `${rows.length} ${rows.length === 1 ? meta.noun.toLowerCase() : `${meta.noun.toLowerCase()}s`}` : ' '}</p>
        {rows.length > 0 && (
          <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
            Add {meta.noun.toLowerCase()}
          </Button>
        )}
      </div>

      {list.isPending ? (
        <TableContainer>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex h-12 items-center gap-4 px-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-4 w-20" />
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
            icon={<Icon />}
            title={meta.emptyTitle}
            description={meta.emptyDescription}
            action={
              <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
                Add {meta.noun.toLowerCase()}
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
                <TH className="hidden md:table-cell">Driver</TH>
                {meta.scoped && <TH className="hidden md:table-cell">Scope</TH>}
                <TH>Last test</TH>
                {meta.toggleable && <TH align="center">Enabled</TH>}
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} interactive onClick={() => setEditing(r)}>
                  <TD>
                    <div className="flex min-w-0 items-center gap-2">
                      <button type="button" className="truncate font-medium text-fg outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), setEditing(r))}>
                        {r.name}
                      </button>
                      {r.isDefault && <Badge tone="accent">Default</Badge>}
                    </div>
                    {meta.hasFrom && r.fromEmail && <div className="truncate text-xs text-fg-muted">{r.fromName ? `${r.fromName} <${r.fromEmail}>` : r.fromEmail}</div>}
                  </TD>
                  <TD muted className="hidden md:table-cell">
                    {driverById.get(r.driver)?.name ?? r.driver}
                  </TD>
                  {meta.scoped && <TD className="hidden md:table-cell">{scopeLabel(r)}</TD>}
                  <TD>
                    <span title={r.lastTestedAt ? formatDateTime(r.lastTestedAt) : undefined}>
                      {r.lastTestOk === null || r.lastTestOk === undefined || !r.lastTestedAt ? (
                        <StatusDot tone="neutral" label={<span className="text-fg-muted">Never tested</span>} />
                      ) : r.lastTestOk ? (
                        <StatusDot tone="success" label={<span className="text-fg-muted">Passed {timeAgo(r.lastTestedAt)}</span>} />
                      ) : (
                        <StatusDot tone="danger" label={<span className="text-fg-muted">Failed {timeAgo(r.lastTestedAt)}</span>} />
                      )}
                    </span>
                  </TD>
                  {meta.toggleable && (
                    <TD align="center" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        size="sm"
                        aria-label={`${r.enabled === false ? 'Enable' : 'Disable'} ${r.name}`}
                        checked={r.enabled !== false}
                        onCheckedChange={(v) => patch.mutate({ id: r.id, body: { enabled: v } })}
                      />
                    </TD>
                  )}
                  <TD align="right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton label="Provider actions" size="sm" variant="ghost">
                          <MoreHorizontal />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing(r)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Send />} onSelect={() => setTesting(r)}>
                          {meta.testRecipient ? 'Send test' : 'Test connection'}
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Star />} disabled={r.isDefault} onSelect={() => patch.mutate({ id: r.id, body: { isDefault: true } })}>
                          Set as default
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(r)}>
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

      <ProviderSheet orgId={orgId} meta={meta} target={editing} onOpenChange={(o) => !o && setEditing(null)} onTest={(r) => setTesting(r)} existingCount={rows.length} />
      <TestDialog orgId={orgId} meta={meta} record={testing} onOpenChange={(o) => !o && setTesting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        title={`Delete “${deleting?.name ?? ''}”?`}
        description={
          deleting?.isDefault
            ? `This is the default ${meta.noun.toLowerCase()}. Websites fall back to the next available provider or the platform default. Stored credentials are destroyed.`
            : 'Websites using this provider fall back to the default. Stored credentials are destroyed.'
        }
        confirmLabel="Delete"
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : undefined)}
      />
    </div>
  );
}
