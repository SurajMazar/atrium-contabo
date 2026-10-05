'use client';

import {
  Avatar,
  Badge,
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
  StatusDot,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, ShieldCheck, ShieldOff, UserCheck, UserX, Users } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useDebounced } from '@/lib/use-debounced';
import { bool, num, numOrNull, str, strOrNull, type Row } from './narrow';
import { AdminSearch, LoadMore, TableSkeleton, adminPrefix, useAdminList, type AdminPages } from './parts';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  disabled: boolean;
  organizations: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
}

function toUser(r: Row): AdminUser {
  return {
    id: str(r.id),
    name: str(r.name),
    email: str(r.email),
    isSuperAdmin: bool(r.isSuperAdmin),
    mfaEnabled: bool(r.mfaEnabled),
    disabled: bool(r.disabled) || !!r.disabledAt,
    organizations: numOrNull(r.organizations ?? r.memberships),
    lastLoginAt: strOrNull(r.lastLoginAt),
    createdAt: str(r.createdAt),
    avatarUrl: strOrNull(r.avatarUrl),
  };
}

type Action = { user: AdminUser; kind: 'disable' | 'enable' | 'grant' | 'revoke' };

export function AdminUsers() {
  const api = useApi();
  const qc = useQueryClient();
  const { user: me } = useSession();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const list = useAdminList<Row>('users', { search: debounced || undefined }, (q) => api.admin.users(q));
  const [action, setAction] = useState<Action | null>(null);
  const users = list.items.map(toUser).filter((u) => u.id);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { disabled?: boolean; isSuperAdmin?: boolean } }) => api.admin.updateUser(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: list.key });
      const prev = qc.getQueryData<AdminPages<Row>>(list.key);
      qc.setQueryData<AdminPages<Row>>(list.key, (d) => (d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((u) => (str(u.id) === id ? { ...u, ...body, ...(body.disabled === false ? { disabledAt: null } : {}) } : u)) })) } : d));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(list.key, ctx.prev);
      toast.error(errorMessage(err, 'Could not update user'));
    },
    onSuccess: (_r, { body }) => {
      if (body.disabled !== undefined) toast.success(body.disabled ? 'User disabled and signed out' : 'User enabled');
      else if (body.isSuperAdmin !== undefined) toast.success(body.isSuperAdmin ? 'Super admin granted' : 'Super admin revoked');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: adminPrefix('users') }),
  });

  const copy: Record<Action['kind'], { title: (u: AdminUser) => string; description: string; label: string; danger: boolean }> = {
    disable: { title: (u) => `Disable ${u.name || u.email}?`, description: 'They are signed out everywhere and can’t sign in until re-enabled. Their organizations and content are untouched.', label: 'Disable user', danger: true },
    enable: { title: (u) => `Enable ${u.name || u.email}?`, description: 'They will be able to sign in again.', label: 'Enable user', danger: false },
    grant: { title: (u) => `Make ${u.name || u.email} a super admin?`, description: 'Super admins can view and change every organization, user and platform setting.', label: 'Grant super admin', danger: true },
    revoke: { title: (u) => `Revoke super admin from ${u.name || u.email}?`, description: 'They keep their organization memberships but lose platform administration.', label: 'Revoke', danger: true },
  };

  return (
    <Page width="wide">
      <PageHeader title="Users" description="Every account on the platform." />
      <div className="mb-4">
        <AdminSearch value={search} onChange={setSearch} placeholder="Search by name or email" />
      </div>
      {list.isPending ? (
        <TableSkeleton cols={6} />
      ) : list.isError ? (
        <TableContainer>
          <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
        </TableContainer>
      ) : users.length === 0 ? (
        <TableContainer>
          <EmptyState compact icon={<Users />} title={debounced ? 'No users match' : 'No users yet'} description={debounced ? 'Try a different name or email.' : undefined} />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>User</TH>
                  <TH>Status</TH>
                  <TH>MFA</TH>
                  <TH align="right" className="hidden md:table-cell">
                    Orgs
                  </TH>
                  <TH className="hidden md:table-cell">Last sign-in</TH>
                  <TH align="right">Joined</TH>
                  <TH className="w-10">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {users.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <TR key={u.id}>
                      <TD>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar src={u.avatarUrl} name={u.name || u.email} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-fg">{u.name || '—'}</span>
                              {u.isSuperAdmin && <Badge tone="accent">Super admin</Badge>}
                              {self && <Badge tone="outline">You</Badge>}
                            </div>
                            <div className="truncate text-xs text-fg-muted">{u.email}</div>
                          </div>
                        </div>
                      </TD>
                      <TD>{u.disabled ? <Badge tone="danger" dot>Disabled</Badge> : <Badge tone="success" dot>Active</Badge>}</TD>
                      <TD>
                        <StatusDot tone={u.mfaEnabled ? 'success' : 'neutral'} label={<span className="text-xs text-fg-muted">{u.mfaEnabled ? 'On' : 'Off'}</span>} />
                      </TD>
                      <TD align="right" muted className="hidden md:table-cell">
                        {u.organizations === null ? '—' : formatNumber(num(u.organizations))}
                      </TD>
                      <TD muted className="hidden md:table-cell">
                        {u.lastLoginAt ? <span title={formatDate(u.lastLoginAt)}>{timeAgo(u.lastLoginAt)}</span> : 'Never'}
                      </TD>
                      <TD align="right" muted>
                        <span title={formatDate(u.createdAt)}>{timeAgo(u.createdAt)}</span>
                      </TD>
                      <TD align="right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton label={`Actions for ${u.email}`} size="sm" variant="ghost">
                              <MoreHorizontal />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.isSuperAdmin ? (
                              <DropdownMenuItem icon={<ShieldOff />} disabled={self} onSelect={() => setAction({ user: u, kind: 'revoke' })}>
                                Revoke super admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem icon={<ShieldCheck />} onSelect={() => setAction({ user: u, kind: 'grant' })}>
                                Make super admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {u.disabled ? (
                              <DropdownMenuItem icon={<UserCheck />} onSelect={() => setAction({ user: u, kind: 'enable' })}>
                                Enable user
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem icon={<UserX />} tone="danger" disabled={self} onSelect={() => setAction({ user: u, kind: 'disable' })}>
                                Disable user
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </>
      )}

      <ConfirmDialog
        open={!!action}
        onOpenChange={(o) => !o && setAction(null)}
        tone={action && copy[action.kind].danger ? 'danger' : 'default'}
        title={action ? copy[action.kind].title(action.user) : ''}
        description={action ? copy[action.kind].description : undefined}
        confirmLabel={action ? copy[action.kind].label : 'Confirm'}
        onConfirm={() => {
          if (!action) return;
          const body = action.kind === 'disable' ? { disabled: true } : action.kind === 'enable' ? { disabled: false } : { isSuperAdmin: action.kind === 'grant' };
          return update.mutateAsync({ id: action.user.id, body });
        }}
      />
    </Page>
  );
}
