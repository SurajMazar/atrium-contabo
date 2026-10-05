'use client';

import type { Invitation } from '@atrium/sdk';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Skeleton, Table, TableContainer, TBody, TD, TH, THead, TR, toast } from '@atrium/ui';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Mail, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

export function InvitationsTable({ orgId, query, onInvite }: { orgId: string; query: UseQueryResult<Invitation[]>; onInvite: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canInvite = can('user.invite');
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  const revoke = useMutation({
    mutationFn: (inv: Invitation) => api.organizations.revokeInvitation(orgId, inv.id),
    onSuccess: (_d, inv) => {
      qc.setQueryData<Invitation[]>(qk.invitations(orgId), (list) => list?.filter((x) => x.id !== inv.id));
      void qc.invalidateQueries({ queryKey: qk.invitations(orgId) });
      toast.success(`Invitation for ${inv.email} revoked`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not revoke invitation')),
  });

  const rows = useMemo(
    () =>
      [...(query.data ?? [])]
        .filter((i) => !i.acceptedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [query.data],
  );

  if (query.isPending) {
    return (
      <TableContainer>
        <div className="h-8 border-b border-border bg-surface-2/60" />
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex h-10 items-center gap-6 px-3">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </TableContainer>
    );
  }
  if (query.isError) return <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong">
        <EmptyState
          icon={<Mail />}
          title="No pending invitations"
          description="Invitations you send appear here until they’re accepted or expire."
          action={
            canInvite && (
              <Button size="sm" variant="primary" leadingIcon={<UserPlus />} onClick={onInvite}>
                Invite members
              </Button>
            )
          }
        />
      </div>
    );
  }

  const now = Date.now();

  return (
    <>
      <TableContainer>
        <Table>
          <THead>
            <tr>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH className="hidden md:table-cell">Sent</TH>
              <TH>Expires</TH>
              <TH className="w-24">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((inv) => {
              const expired = new Date(inv.expiresAt).getTime() < now;
              return (
                <TR key={inv.id} className="hover:bg-surface-2/40">
                  <TD className="font-medium text-fg">{inv.email}</TD>
                  <TD muted>{inv.role.name}</TD>
                  <TD muted className="hidden whitespace-nowrap md:table-cell" title={formatDateTime(inv.createdAt)}>
                    {timeAgo(inv.createdAt)}
                  </TD>
                  <TD muted className="whitespace-nowrap" title={formatDateTime(inv.expiresAt)}>
                    {expired ? <Badge tone="warning">Expired</Badge> : formatDate(inv.expiresAt)}
                  </TD>
                  <TD align="right">
                    {canInvite && (
                      <Button size="xs" variant="ghost" onClick={() => setRevoking(inv)}>
                        {expired ? 'Remove' : 'Revoke'}
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableContainer>
      <p className="mt-2 text-xs text-fg-subtle">Invite links are delivered by email only. To resend an expired invitation, remove it and invite again.</p>
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        tone="danger"
        title="Revoke invitation?"
        description={revoking ? `The link sent to ${revoking.email} will stop working.` : undefined}
        confirmLabel="Revoke invitation"
        onConfirm={() => (revoking ? revoke.mutateAsync(revoking) : undefined)}
      />
    </>
  );
}
