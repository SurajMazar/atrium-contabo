'use client';

import {
  Avatar,
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  CopyField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  RadioGroup,
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
import { Check, KeyRound, MailCheck, MoreHorizontal, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX, Users } from 'lucide-react';
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
  emailVerified: boolean;
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
    emailVerified: bool(r.emailVerified),
    disabled: bool(r.disabled) || !!r.disabledAt,
    organizations: numOrNull(r.organizations ?? r.memberships),
    lastLoginAt: strOrNull(r.lastLoginAt),
    createdAt: str(r.createdAt),
    avatarUrl: strOrNull(r.avatarUrl),
  };
}

type Action = { user: AdminUser; kind: 'disable' | 'enable' | 'grant' | 'revoke' | 'verify' };

export function AdminUsers() {
  const api = useApi();
  const qc = useQueryClient();
  const { user: me } = useSession();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const list = useAdminList<Row>('users', { search: debounced || undefined }, (q) => api.admin.users(q));
  const [action, setAction] = useState<Action | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [settingPassword, setSettingPassword] = useState<AdminUser | null>(null);
  const users = list.items.map(toUser).filter((u) => u.id);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { disabled?: boolean; isSuperAdmin?: boolean; emailVerified?: true } }) => api.admin.updateUser(id, body),
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
      else if (body.emailVerified) toast.success('Email marked as confirmed');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: adminPrefix('users') }),
  });

  const copy: Record<Action['kind'], { title: (u: AdminUser) => string; description: string; label: string; danger: boolean }> = {
    disable: { title: (u) => `Disable ${u.name || u.email}?`, description: 'They are signed out everywhere and can’t sign in until re-enabled. Their organizations and content are untouched.', label: 'Disable user', danger: true },
    enable: { title: (u) => `Enable ${u.name || u.email}?`, description: 'They will be able to sign in again.', label: 'Enable user', danger: false },
    grant: { title: (u) => `Make ${u.name || u.email} a super admin?`, description: 'Super admins can view and change every organization, user and platform setting.', label: 'Grant super admin', danger: true },
    revoke: { title: (u) => `Revoke super admin from ${u.name || u.email}?`, description: 'They keep their organization memberships but lose platform administration.', label: 'Revoke', danger: true },
    verify: { title: (u) => `Mark ${u.email} as confirmed?`, description: 'Do this only if you know this person owns the address. They can then accept invitations without clicking a confirmation link.', label: 'Mark as confirmed', danger: false },
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
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-xs text-fg-muted">{u.email}</span>
                              {!u.emailVerified && <Badge tone="warning">Email unconfirmed</Badge>}
                            </div>
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
                            <DropdownMenuItem icon={<KeyRound />} disabled={self} onSelect={() => setSettingPassword(u)}>
                              Set password…
                            </DropdownMenuItem>
                            {!u.emailVerified && (
                              <DropdownMenuItem icon={<MailCheck />} onSelect={() => setAction({ user: u, kind: 'verify' })}>
                                Mark email as confirmed
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
                            <DropdownMenuItem icon={<Trash2 />} tone="danger" disabled={self} onSelect={() => setDeleting(u)}>
                              Delete permanently…
                            </DropdownMenuItem>
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
          const body = action.kind === 'verify' ? { emailVerified: true as const } : action.kind === 'disable' ? { disabled: true } : action.kind === 'enable' ? { disabled: false } : { isSuperAdmin: action.kind === 'grant' };
          return update.mutateAsync({ id: action.user.id, body });
        }}
      />
      <SetPasswordDialog user={settingPassword} onClose={() => setSettingPassword(null)} />
      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} onDeleted={() => void qc.invalidateQueries({ queryKey: adminPrefix('users') })} />
    </Page>
  );
}

/**
 * Set a password for someone: generated (shown once) or typed. They are signed out everywhere and
 * must choose their own at the next sign-in, because you now know this one.
 */
function SetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const api = useApi();
  const [mode, setMode] = useState<'generate' | 'type'>('generate');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ password?: string } | null>(null);
  const set = useMutation({
    mutationFn: () => api.admin.setUserPassword(user!.id, mode === 'type' ? typed : undefined),
    onSuccess: (r) => {
      setDone({ password: r.password });
      toast.success(`New password set for ${user?.email}`);
    },
    onError: (err) => setError(errorMessage(err, 'Could not set the password')),
  });
  const close = () => {
    setMode('generate');
    setTyped('');
    setError(undefined);
    setDone(null);
    onClose();
  };
  const canSubmit = mode === 'generate' || typed.length > 0;
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !set.isPending && close()}>
      <DialogContent size="sm">
        {done ? (
          <>
            <DialogHeader title="Password set" description={`${user?.email} has been signed out everywhere and must choose a new password at the next sign-in.`} />
            <DialogBody className="space-y-3">
              {done.password ? (
                <>
                  <Field label="Password">
                    <CopyField value={done.password} label="Password" />
                  </Field>
                  <Banner tone="warning">This password is shown only once. Share it securely.</Banner>
                </>
              ) : (
                <p className="text-sm text-fg-muted">Share the password you typed with them securely.</p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="primary" leadingIcon={<Check />} onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) set.mutate();
            }}
            className="flex min-h-0 flex-col"
          >
            <DialogHeader title={`Set a password for ${user?.name || user?.email}?`} description="They are signed out everywhere and must choose their own password at the next sign-in." />
            <DialogBody className="space-y-4">
              {error && <Banner tone="danger">{error}</Banner>}
              <RadioGroup
                value={mode}
                onValueChange={(v) => {
                  setMode(v as 'generate' | 'type');
                  setError(undefined);
                }}
                options={[
                  { value: 'generate', label: 'Generate a password', description: 'Shown to you once' },
                  { value: 'type', label: 'Type a password' },
                ]}
              />
              {mode === 'type' && (
                <Field label="New password" help="At least 10 characters, mixing upper and lower case letters, numbers and symbols.">
                  <Input
                    type="password"
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setError(undefined);
                    }}
                    maxLength={200}
                    autoComplete="new-password"
                  />
                </Field>
              )}
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" type="button" onClick={close} disabled={set.isPending}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" type="submit" loading={set.isPending} disabled={!canSubmit}>
                Set password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Permanent deletion: type the email to confirm; refused for sole owners (the API says which organizations). */
function DeleteUserDialog({ user, onClose, onDeleted }: { user: AdminUser | null; onClose: () => void; onDeleted: () => void }) {
  const api = useApi();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const del = useMutation({
    mutationFn: () => api.admin.deleteUser(user!.id, typed.trim()),
    onSuccess: () => {
      toast.success(`${user?.email} was deleted`);
      onDeleted();
      close();
    },
    onError: (err) => setError(errorMessage(err, 'Could not delete this user')),
  });
  const close = () => {
    setTyped('');
    setError(undefined);
    onClose();
  };
  const matches = !!user && typed.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !del.isPending && close()}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) del.mutate();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader title={`Delete ${user?.name || user?.email} permanently?`} description="Their account, sessions and organization memberships are removed and cannot be restored. Content they created stays." />
          <DialogBody className="space-y-3">
            {error && <Banner tone="danger">{error}</Banner>}
            <Field label={`Type ${user?.email ?? 'the email'} to confirm`}>
              <Input
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setError(undefined);
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button size="sm" variant="ghost" type="button" onClick={close} disabled={del.isPending}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" type="submit" loading={del.isPending} disabled={!matches}>
              Delete permanently
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
