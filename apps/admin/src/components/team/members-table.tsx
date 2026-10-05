'use client';

import type { Member, Role } from '@atrium/sdk';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tooltip,
  nextSort,
  sortRows,
  toast,
  type SortState,
} from '@atrium/ui';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { MoreHorizontal, Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { WebsiteAccess } from './website-access';

export function MembersTable({ orgId, query, roles, onInvite }: { orgId: string; query: UseQueryResult<Member[]>; roles: Role[]; onInvite: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const { user, can } = useSession();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [removing, setRemoving] = useState<Member | null>(null);

  const canManageRoles = can('role.manage');
  const canRemove = can('user.remove');

  const update = useMutation({
    mutationFn: ({ memberId, body }: { memberId: string; body: { roleId?: string; websiteIds?: string[] } }) => api.organizations.updateMember(orgId, memberId, body),
    onMutate: async ({ memberId, body }) => {
      await qc.cancelQueries({ queryKey: qk.members(orgId) });
      const prev = qc.getQueryData<Member[]>(qk.members(orgId));
      qc.setQueryData<Member[]>(qk.members(orgId), (list) =>
        list?.map((m) => {
          if (m.id !== memberId) return m;
          const role = body.roleId ? roles.find((r) => r.id === body.roleId) : undefined;
          return {
            ...m,
            ...(role ? { role: { id: role.id, key: role.key, name: role.name } } : {}),
            ...(body.websiteIds ? { websiteIds: body.websiteIds } : {}),
          };
        }),
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.members(orgId), ctx.prev);
      toast.error(errorMessage(err, 'Could not update member'));
    },
    onSuccess: (_d, { body }) => {
      toast.success(body.roleId ? 'Role updated' : 'Website access updated');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.members(orgId) });
      void qc.invalidateQueries({ queryKey: qk.roles(orgId) });
    },
  });

  const remove = useMutation({
    mutationFn: (m: Member) => api.organizations.removeMember(orgId, m.id),
    onSuccess: (_d, m) => {
      qc.setQueryData<Member[]>(qk.members(orgId), (list) => list?.filter((x) => x.id !== m.id));
      void qc.invalidateQueries({ queryKey: qk.members(orgId) });
      void qc.invalidateQueries({ queryKey: qk.roles(orgId) });
      toast.success(`${m.user.name || m.user.email} removed`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not remove member')),
  });

  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.id, label: r.name })), [roles]);

  const rows = useMemo(() => {
    const f = search.trim().toLowerCase();
    const list = (query.data ?? []).filter((m) => !f || m.user.name.toLowerCase().includes(f) || m.user.email.toLowerCase().includes(f) || m.role.name.toLowerCase().includes(f));
    return sortRows(list, sort ?? { key: 'name', dir: 'asc' }, (m, k) => (k === 'name' ? (m.user.name || m.user.email).toLowerCase() : k === 'role' ? m.role.name : m.createdAt));
  }, [query.data, search, sort]);

  if (query.isPending) return <MembersSkeleton />;
  if (query.isError) return <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />;

  if (query.data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong">
        <EmptyState
          icon={<Users />}
          title="No members yet"
          description="Invite teammates to collaborate on websites in this organization."
          action={
            can('user.invite') && (
              <Button size="sm" variant="primary" leadingIcon={<UserPlus />} onClick={onInvite}>
                Invite members
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Input size="sm" prefix={<Search />} placeholder="Search by name, email or role" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" aria-label="Search members" />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title="No members match" description="Try a different search." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH sortable sorted={sort?.key === 'name' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'name'))}>
                  Member
                </TH>
                <TH sortable sorted={sort?.key === 'role' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'role'))}>
                  Role
                </TH>
                <TH>Website access</TH>
                <TH className="hidden md:table-cell" sortable sorted={sort?.key === 'createdAt' && sort.dir} onSort={() => setSort((s) => nextSort(s, 'createdAt'))}>
                  Joined
                </TH>
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((m) => {
                const isMe = m.user.id === user?.id;
                const isOwner = m.role.key === 'owner';
                const options = roleOptions.some((o) => o.value === m.role.id) ? roleOptions : [{ value: m.role.id, label: m.role.name }, ...roleOptions];
                const roleLocked = isMe || !canManageRoles;
                return (
                  <TR key={m.id} className="hover:bg-surface-2/40">
                    <TD>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar src={m.user.avatarUrl} name={m.user.name || m.user.email} size="md" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-fg">{m.user.name || m.user.email}</span>
                            {isMe && <Badge size="xs">You</Badge>}
                          </div>
                          <div className="truncate text-xs text-fg-muted">{m.user.email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD className="w-52">
                      <Tooltip content={isMe ? 'You can’t change your own role' : !canManageRoles ? 'You need the “role.manage” permission' : null}>
                        <span className="inline-flex w-full">
                          <Select
                            size="sm"
                            aria-label={`Role for ${m.user.email}`}
                            value={m.role.id}
                            options={options}
                            disabled={roleLocked}
                            className="w-full"
                            onValueChange={(roleId) => roleId !== m.role.id && update.mutate({ memberId: m.id, body: { roleId } })}
                          />
                        </span>
                      </Tooltip>
                    </TD>
                    <TD className="w-60">
                      <WebsiteAccess orgId={orgId} member={m} disabled={isMe || !canManageRoles || isOwner} disabledReason={isOwner ? 'Owners always have access to every website' : isMe ? 'You can’t change your own access' : 'You need the “role.manage” permission'} onSave={(websiteIds) => update.mutateAsync({ memberId: m.id, body: { websiteIds } })} />
                    </TD>
                    <TD muted className="hidden whitespace-nowrap md:table-cell" title={formatDate(m.createdAt)}>
                      {timeAgo(m.createdAt)}
                    </TD>
                    <TD align="right">
                      {canRemove && !isMe && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton label={`Actions for ${m.user.email}`} size="xs">
                              <MoreHorizontal />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem icon={<UserMinus />} tone="danger" onSelect={() => setRemoving(m)}>
                              Remove from organization
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.user.name || removing?.user.email || 'member'}?`}
        description="They’ll immediately lose access to this organization and all of its websites. You can invite them again later."
        confirmLabel="Remove member"
        onConfirm={() => (removing ? remove.mutateAsync(removing) : undefined)}
      />
    </>
  );
}

function MembersSkeleton() {
  return (
    <TableContainer>
      <div className="h-8 border-b border-border bg-surface-2/60" />
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex h-14 items-center gap-3 px-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="w-56 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-7 w-44" />
            <Skeleton className="ml-auto hidden h-3 w-16 md:block" />
          </div>
        ))}
      </div>
    </TableContainer>
  );
}
