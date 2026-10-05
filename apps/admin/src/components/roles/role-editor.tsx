'use client';

import type { Role } from '@atrium/sdk';
import { DEFAULT_ROLES } from '@atrium/schema';
import { Badge, Banner, Button, ConfirmDialog, Field, Input, Select, Sheet, SheetContent, Textarea, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, Lock, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import type { PermissionGroup } from './permission-groups';
import { PermissionMatrix } from './permission-matrix';

export interface RoleSeed {
  name: string;
  description: string;
  permissions: string[];
}

export function RoleEditor({
  orgId,
  open,
  onOpenChange,
  role,
  seed,
  roles,
  groups,
  canManage,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing role to edit; `null` creates a new custom role. */
  role: Role | null;
  /** Initial values when creating (e.g. duplicating). */
  seed?: RoleSeed;
  roles: Role[];
  groups: PermissionGroup[];
  canManage: boolean;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { reload } = useSession();
  const isNew = role === null;
  const isOwner = role?.key === 'owner';
  const readOnly = !canManage || isOwner;
  const allKeys = useMemo(() => groups.flatMap((g) => g.permissions.map((p) => p.key)), [groups]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [preset, setPreset] = useState('blank');
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setPreset('blank');
    if (role) {
      setName(role.name);
      setDescription(role.description ?? '');
      setPermissions(role.key === 'owner' ? allKeys : role.permissions);
    } else {
      setName(seed?.name ?? '');
      setDescription(seed?.description ?? '');
      setPermissions(seed?.permissions ?? []);
    }
    // Reset only when the sheet opens or the target changes — background refetches must not wipe edits.
  }, [open, role?.id, seed]);

  const initial = role ? { name: role.name, description: role.description ?? '', permissions: role.permissions } : { name: seed?.name ?? '', description: seed?.description ?? '', permissions: seed?.permissions ?? [] };
  const dirty =
    name.trim() !== initial.name ||
    description.trim() !== (initial.description ?? '') ||
    permissions.length !== initial.permissions.length ||
    permissions.some((p) => !initial.permissions.includes(p));

  const nameTaken = roles.some((r) => r.id !== role?.id && r.name.trim().toLowerCase() === name.trim().toLowerCase());
  const nameError = submitted && !name.trim() ? 'Name is required' : nameTaken ? 'A role with this name already exists' : undefined;

  const done = () => {
    void qc.invalidateQueries({ queryKey: qk.roles(orgId) });
    void qc.invalidateQueries({ queryKey: qk.members(orgId) });
    // Permissions of the current user may have changed.
    void reload();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || undefined, permissions };
      return role ? api.organizations.updateRole(orgId, role.id, role.isSystem ? { description: body.description, permissions } : body) : api.organizations.createRole(orgId, body);
    },
    onSuccess: (saved) => {
      qc.setQueryData<Role[]>(qk.roles(orgId), (list) => {
        if (!list) return list;
        const merged = { ...(role ?? {}), ...saved } as Role;
        return role ? list.map((r) => (r.id === role.id ? merged : r)) : [...list, merged];
      });
      done();
      toast.success(role ? 'Role saved' : `Role “${saved.name ?? name.trim()}” created`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save role')),
  });

  const remove = useMutation({
    mutationFn: () => api.organizations.deleteRole(orgId, role!.id),
    onSuccess: () => {
      qc.setQueryData<Role[]>(qk.roles(orgId), (list) => list?.filter((r) => r.id !== role!.id));
      done();
      toast.success('Role deleted');
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete role')),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (readOnly || !name.trim() || nameTaken) return;
    save.mutate();
  };

  const title = isNew ? 'New role' : readOnly ? role.name : `Edit ${role.name}`;
  const memberCount = role?.memberCount;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          size="xl"
          title={title}
          description={isNew ? 'Custom roles grant exactly the permissions you choose.' : role.isSystem ? 'System role' : 'Custom role'}
          actions={
            role && (
              <div className="mr-1 flex items-center gap-1.5">
                {role.isSystem && <Badge tone="outline">System</Badge>}
                {typeof memberCount === 'number' && <Badge>{memberCount === 1 ? '1 member' : `${memberCount} members`}</Badge>}
              </div>
            )
          }
          footer={
            <>
              {role && !role.isSystem && canManage && (
                <Button variant="danger-ghost" size="sm" leadingIcon={<Trash2 />} onClick={() => setConfirmDelete(true)} className="mr-auto">
                  Delete role
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button variant="primary" size="sm" loading={save.isPending} disabled={(!isNew && !dirty) || nameTaken} onClick={() => submit()}>
                  {isNew ? 'Create role' : 'Save changes'}
                </Button>
              )}
            </>
          }
        >
          <form onSubmit={submit} className="space-y-5">
            {isOwner ? (
              <Banner tone="neutral" icon={<Crown />}>
                The owner role always has every permission, including billing and deleting the organization. It can’t be edited or deleted.
              </Banner>
            ) : !canManage ? (
              <Banner tone="neutral" icon={<Lock />}>
                You can view this role. Editing roles requires the <code className="font-mono text-xs">role.manage</code> permission.
              </Banner>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={nameError} help={role?.isSystem && !isOwner ? 'System role names can’t be changed.' : undefined}>
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly || role?.isSystem} placeholder="e.g. Content reviewer" maxLength={60} autoFocus={isNew} />
              </Field>
              {isNew && (
                <Field label="Start from" help="Copies a preset’s permissions. You can adjust them below.">
                  <Select
                    value={preset}
                    onValueChange={(v) => {
                      setPreset(v);
                      if (v === 'blank') return setPermissions([]);
                      const p = DEFAULT_ROLES.find((r) => r.key === v);
                      if (p) {
                        setPermissions(p.permissions.filter((k) => allKeys.includes(k)));
                        if (!description.trim()) setDescription(p.description);
                      }
                    }}
                    options={[
                      { value: 'blank', label: 'Blank (no permissions)' },
                      ...DEFAULT_ROLES.filter((r) => r.key !== 'owner').map((r) => ({ value: r.key, label: r.name, description: r.description })),
                    ]}
                  />
                </Field>
              )}
              <Field label="Description" optional className="sm:col-span-2">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} rows={2} maxLength={240} placeholder="What is this role for?" />
              </Field>
            </div>

            <div>
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-fg">Permissions</h3>
                <p className="mt-0.5 text-xs text-fg-muted">Website-level permissions apply to every website the member can access.</p>
              </div>
              <PermissionMatrix groups={groups} value={permissions} onChange={setPermissions} readOnly={readOnly} />
            </div>
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        </SheetContent>
      </Sheet>
      {role && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          tone="danger"
          title={`Delete “${role.name}”?`}
          description={
            memberCount
              ? `${memberCount === 1 ? '1 member has' : `${memberCount} members have`} this role. Reassign them to another role first so they keep access.`
              : 'This custom role will be permanently removed.'
          }
          confirmLabel="Delete role"
          onConfirm={() => remove.mutateAsync()}
        />
      )}
    </>
  );
}
