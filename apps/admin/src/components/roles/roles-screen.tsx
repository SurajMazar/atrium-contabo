'use client';

import type { Role } from '@atrium/sdk';
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
  PageHeader,
  Skeleton,
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
import { Copy, Eye, KeyRound, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { RequirePermission } from '@/components/common/permission';
import { errorMessage, useApi } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { groupPermissions, normalizeCatalog } from './permission-groups';
import { RoleEditor, type RoleSeed } from './role-editor';

type EditorState = { open: false } | { open: true; role: Role | null; seed?: RoleSeed };

export function RolesScreen({ orgId }: { orgId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canManage = can('role.manage');
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [deleting, setDeleting] = useState<Role | null>(null);

  const roles = useQuery({ queryKey: qk.roles(orgId), queryFn: () => api.organizations.roles(orgId) });
  const members = useQuery({ queryKey: qk.members(orgId), queryFn: () => api.organizations.members(orgId) });
  const catalog = useQuery({ queryKey: qk.permissionsCatalog(), queryFn: () => api.organizations.permissions(), staleTime: 60 * 60_000, retry: 1 });

  // Falls back to the bundled PERMISSIONS constant while loading or if the endpoint fails.
  const groups = useMemo(() => groupPermissions(normalizeCatalog(catalog.data)), [catalog.data]);
  const totalPermissions = useMemo(() => groups.reduce((n, g) => n + g.permissions.length, 0), [groups]);

  const memberCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of members.data ?? []) m.set(x.role.id, (m.get(x.role.id) ?? 0) + 1);
    return m;
  }, [members.data]);

  const rows = useMemo(() => {
    const list = (roles.data ?? []).map((r) => ({ ...r, memberCount: r.memberCount ?? (members.data ? (memberCounts.get(r.id) ?? 0) : undefined) }));
    // Owner first, then system roles, then custom roles alphabetically.
    return list.sort((a, b) => {
      if (a.key === 'owner') return -1;
      if (b.key === 'owner') return 1;
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [roles.data, members.data, memberCounts]);

  const remove = useMutation({
    mutationFn: (r: Role) => api.organizations.deleteRole(orgId, r.id),
    onSuccess: (_d, r) => {
      qc.setQueryData<Role[]>(qk.roles(orgId), (list) => list?.filter((x) => x.id !== r.id));
      void qc.invalidateQueries({ queryKey: qk.roles(orgId) });
      toast.success(`Role “${r.name}” deleted`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete role')),
  });

  const duplicate = (r: Role) =>
    setEditor({
      open: true,
      role: null,
      seed: { name: `${r.name} copy`, description: r.description ?? '', permissions: r.key === 'owner' ? groups.flatMap((g) => g.permissions.map((p) => p.key)) : r.permissions },
    });

  const editorRole = editor.open ? editor.role : null;
  const liveEditorRole = editorRole ? (rows.find((r) => r.id === editorRole.id) ?? editorRole) : null;

  return (
    <Page>
      <PageHeader
        title="Roles"
        description="Roles bundle permissions. Every member has exactly one role in this organization."
        actions={
          <RequirePermission permission="role.manage">
            <Button size="sm" variant="primary" leadingIcon={<Plus />} disabled={!canManage} onClick={() => setEditor({ open: true, role: null })}>
              New role
            </Button>
          </RequirePermission>
        }
      />

      {roles.isPending ? (
        <TableContainer>
          <div className="h-8 border-b border-border bg-surface-2/60" />
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex h-14 items-center gap-6 px-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </TableContainer>
      ) : roles.isError ? (
        <ErrorState description={roles.error.message} onRetry={() => void roles.refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<KeyRound />}
            title="No roles yet"
            description="Create a role to control what members can do."
            action={
              canManage && (
                <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setEditor({ open: true, role: null })}>
                  New role
                </Button>
              )
            }
          />
        </div>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Role</TH>
                <TH className="w-24">Type</TH>
                <TH align="right" className="w-24">
                  Members
                </TH>
                <TH align="right" className="w-28">
                  Permissions
                </TH>
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const isOwner = r.key === 'owner';
                return (
                  <TR key={r.id} interactive onClick={() => setEditor({ open: true, role: r })}>
                    <TD className="h-auto py-2.5">
                      <button type="button" className="text-left font-medium text-fg outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), setEditor({ open: true, role: r }))}>
                        {r.name}
                      </button>
                      {r.description && <div className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{r.description}</div>}
                    </TD>
                    <TD>{r.isSystem ? <Badge tone="outline">System</Badge> : <span className="text-xs text-fg-muted">Custom</span>}</TD>
                    <TD align="right" muted>
                      {r.memberCount === undefined ? '—' : formatNumber(r.memberCount)}
                    </TD>
                    <TD align="right" muted>
                      {isOwner ? 'All' : `${r.permissions.length}/${totalPermissions}`}
                    </TD>
                    <TD align="right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton label={`Actions for ${r.name}`} size="xs">
                            <MoreHorizontal />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem icon={canManage && !isOwner ? <Pencil /> : <Eye />} onSelect={() => setEditor({ open: true, role: r })}>
                            {canManage && !isOwner ? 'Edit role' : 'View role'}
                          </DropdownMenuItem>
                          {canManage && (
                            <DropdownMenuItem icon={<Copy />} onSelect={() => duplicate(r)}>
                              Duplicate as custom role
                            </DropdownMenuItem>
                          )}
                          {canManage && !r.isSystem && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(r)}>
                                Delete role
                              </DropdownMenuItem>
                            </>
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
      )}

      <RoleEditor
        orgId={orgId}
        open={editor.open}
        onOpenChange={(o) => !o && setEditor({ open: false })}
        role={liveEditorRole}
        seed={editor.open ? editor.seed : undefined}
        roles={roles.data ?? []}
        groups={groups}
        canManage={canManage}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        title={`Delete “${deleting?.name ?? ''}”?`}
        description={
          deleting && memberCounts.get(deleting.id)
            ? `${memberCounts.get(deleting.id) === 1 ? '1 member has' : `${memberCounts.get(deleting.id)} members have`} this role. Reassign them to another role first so they keep access.`
            : 'This custom role will be permanently removed.'
        }
        confirmLabel="Delete role"
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />
    </Page>
  );
}
