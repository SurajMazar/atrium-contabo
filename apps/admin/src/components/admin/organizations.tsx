'use client';

import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  SegmentedControl,
  Sheet,
  SheetContent,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@atrium/ui';
import { FEATURE_FLAGS } from '@atrium/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Ban, Building2, CircleCheck, CreditCard, Flag, Globe, MoreHorizontal, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { AddMemberDialog } from '@/components/team/add-member-dialog';
import { CreateOrganizationAdminDialog } from './create-organization';
import { errorMessage, useApi } from '@/lib/api';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';
import { bool, num, rec, str, type Row } from './narrow';
import { AdminSearch, LoadMore, TableSkeleton, adminPrefix, useAdminList, type AdminPages } from './parts';

interface Org {
  id: string;
  name: string;
  slug: string;
  planKey: string;
  members: number;
  websites: number;
  createdAt: string;
  suspended: boolean;
  featureFlags: Record<string, boolean>;
  adminHostname: string | null;
  analyticsEnabled: boolean;
}

function toOrg(r: Row): Org {
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rec(r.featureFlags))) if (typeof v === 'boolean') flags[k] = v;
  return {
    id: str(r.id),
    name: str(r.name, 'Untitled'),
    slug: str(r.slug),
    planKey: str(r.planKey),
    members: num(r.members ?? rec(r._count).members),
    websites: num(r.websites ?? rec(r._count).websites),
    createdAt: str(r.createdAt),
    suspended: bool(r.suspended) || !!r.suspendedAt,
    featureFlags: flags,
    adminHostname: str(r.adminHostname) || null,
    analyticsEnabled: bool(r.analyticsEnabled),
  };
}

export function AdminOrganizations() {
  const [createOpen, setCreateOpen] = useState(false);
  const api = useApi();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const list = useAdminList<Row>('organizations', { search: debounced || undefined }, (q) => api.admin.organizations(q));
  const plans = useQuery({ queryKey: qk.admin('plans'), queryFn: () => api.admin.plans(), staleTime: 5 * 60_000 });
  const [suspending, setSuspending] = useState<Org | null>(null);
  const [flagsFor, setFlagsFor] = useState<Org | null>(null);
  const [renaming, setRenaming] = useState<Org | null>(null);
  const [addingTo, setAddingTo] = useState<Org | null>(null);
  const [domainFor, setDomainFor] = useState<Org | null>(null);
  const [deleting, setDeleting] = useState<Org | null>(null);
  const [newName, setNewName] = useState('');

  const orgs = list.items.map(toOrg).filter((o) => o.id);
  const planName = (key: string) => plans.data?.find((p) => p.key === key)?.name ?? key;

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; planKey?: string; suspended?: boolean; featureFlags?: Record<string, boolean>; analyticsEnabled?: boolean } }) => api.admin.updateOrganization(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: list.key });
      const prev = qc.getQueryData<AdminPages<Row>>(list.key);
      qc.setQueryData<AdminPages<Row>>(list.key, (d) => (d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((o) => (str(o.id) === id ? { ...o, ...body } : o)) })) } : d));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(list.key, ctx.prev);
      toast.error(errorMessage(err, 'Could not update organization'));
    },
    onSuccess: (_r, { body }) => {
      if (body.name) toast.success(`Renamed to ${body.name}`);
      else if (body.planKey) toast.success(`Plan changed to ${planName(body.planKey)}`);
      else if (body.suspended !== undefined) toast.success(body.suspended ? 'Organization suspended' : 'Organization reinstated');
      else if (body.featureFlags) toast.success('Feature overrides saved');
      else if (body.analyticsEnabled !== undefined) toast.success(body.analyticsEnabled ? 'Analytics turned on' : 'Analytics turned off');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: adminPrefix('organizations') }),
  });

  const remove = useMutation({
    mutationFn: (o: Org) => api.admin.deleteOrganization(o.id, o.slug),
    onSuccess: (_r, o) => toast.success(`${o.name} was deleted`),
    onError: (err) => toast.error(errorMessage(err, 'Could not delete organization')),
    onSettled: () => void qc.invalidateQueries({ queryKey: adminPrefix('organizations') }),
  });

  return (
    <Page width="wide">
      <PageHeader
        title="Organizations"
        description="Every tenant on the platform. Create organizations for clients, change plans, suspend access or override feature flags."
        actions={
          <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setCreateOpen(true)}>
            New organization
          </Button>
        }
      />
      <CreateOrganizationAdminDialog open={createOpen} onOpenChange={setCreateOpen} />
      {addingTo && <AdminAddMember org={addingTo} onClose={() => setAddingTo(null)} />}
      {domainFor && <AdminDomainDialog org={domainFor} onClose={() => setDomainFor(null)} />}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (renaming && name && name !== renaming.name) update.mutate({ id: renaming.id, body: { name } });
              setRenaming(null);
            }}
            className="flex min-h-0 flex-col"
          >
            <DialogHeader title="Rename organization" description="Members see the new name right away. The URL slug stays the same." />
            <DialogBody>
              <Field label="Name">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoFocus />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" type="submit" disabled={!newName.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="mb-4">
        <AdminSearch value={search} onChange={setSearch} placeholder="Search by name or slug" />
      </div>
      {list.isPending ? (
        <TableSkeleton cols={6} />
      ) : list.isError ? (
        <TableContainer>
          <ErrorState description={list.error.message} onRetry={() => void list.refetch()} />
        </TableContainer>
      ) : orgs.length === 0 ? (
        <TableContainer>
          <EmptyState compact icon={<Building2 />} title={debounced ? 'No organizations match' : 'No organizations yet'} description={debounced ? 'Try a different name or slug.' : undefined} />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Organization</TH>
                  <TH>Plan</TH>
                  <TH align="right">Members</TH>
                  <TH align="right">Websites</TH>
                  <TH className="hidden md:table-cell">Created</TH>
                  <TH>Status</TH>
                  <TH className="w-10">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {orgs.map((o) => {
                  const overrides = Object.keys(o.featureFlags).length;
                  return (
                    <TR key={o.id}>
                      <TD>
                        <div className="font-medium text-fg">{o.name}</div>
                        <div className="font-mono text-xs text-fg-subtle">{o.slug}</div>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <Badge tone="outline">{o.planKey ? planName(o.planKey) : 'None'}</Badge>
                          {overrides > 0 && (
                            <Badge tone="neutral" title="Feature flag overrides">
                              <Flag /> {overrides}
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD align="right" muted>
                        {formatNumber(o.members)}
                      </TD>
                      <TD align="right" muted>
                        {formatNumber(o.websites)}
                      </TD>
                      <TD muted className="hidden md:table-cell">
                        <span title={formatDate(o.createdAt)}>{timeAgo(o.createdAt)}</span>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          {o.suspended ? <Badge tone="danger" dot>Suspended</Badge> : <Badge tone="success" dot>Active</Badge>}
                          {o.analyticsEnabled && (
                            <Badge tone="neutral" title="Built-in analytics is collected">
                              <BarChart3 /> Analytics
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD align="right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton label={`Actions for ${o.name}`} size="sm" variant="ghost">
                              <MoreHorizontal />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger icon={<CreditCard />}>Change plan</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {plans.isPending ? (
                                  <DropdownMenuLabel>Loading plans…</DropdownMenuLabel>
                                ) : (plans.data ?? []).length === 0 ? (
                                  <DropdownMenuLabel>No plans defined</DropdownMenuLabel>
                                ) : (
                                  <DropdownMenuRadioGroup value={o.planKey} onValueChange={(planKey) => planKey !== o.planKey && update.mutate({ id: o.id, body: { planKey } })}>
                                    {(plans.data ?? []).map((p) => (
                                      <DropdownMenuRadioItem key={p.key} value={p.key}>
                                        {p.name}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem icon={<UserPlus />} onSelect={() => setAddingTo(o)}>
                              Add member…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              icon={<Pencil />}
                              onSelect={() => {
                                setNewName(o.name);
                                setRenaming(o);
                              }}
                            >
                              Rename…
                            </DropdownMenuItem>
                            <DropdownMenuItem icon={<Globe />} onSelect={() => setDomainFor(o)}>
                              Admin domain…
                            </DropdownMenuItem>
                            <DropdownMenuItem icon={<Flag />} onSelect={() => setFlagsFor(o)}>
                              Feature overrides…
                            </DropdownMenuItem>
                            <DropdownMenuItem icon={<BarChart3 />} onSelect={() => update.mutate({ id: o.id, body: { analyticsEnabled: !o.analyticsEnabled } })}>
                              {o.analyticsEnabled ? 'Turn analytics off' : 'Turn analytics on'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {o.suspended ? (
                              <>
                                <DropdownMenuItem icon={<CircleCheck />} onSelect={() => setSuspending(o)}>
                                  Reinstate
                                </DropdownMenuItem>
                                <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(o)}>
                                  Delete organization…
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem icon={<Ban />} tone="danger" onSelect={() => setSuspending(o)}>
                                Suspend
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
        open={!!suspending}
        onOpenChange={(o) => !o && setSuspending(null)}
        tone={suspending?.suspended ? 'default' : 'danger'}
        title={suspending?.suspended ? `Reinstate ${suspending.name}?` : `Suspend ${suspending?.name ?? ''}?`}
        description={
          suspending?.suspended
            ? 'Members regain access to the admin and published websites come back online.'
            : 'Members lose access to the admin and the organization’s published websites stop serving. This is logged in the audit trail. A suspended organization can then be deleted permanently.'
        }
        confirmLabel={suspending?.suspended ? 'Reinstate' : 'Suspend organization'}
        confirmText={suspending?.suspended ? undefined : suspending?.slug || undefined}
        onConfirm={() => (suspending ? update.mutateAsync({ id: suspending.id, body: { suspended: !suspending.suspended } }) : undefined)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        title={`Delete ${deleting?.name ?? ''} permanently?`}
        description={
          deleting
            ? `This removes the organization and everything in it: ${formatNumber(deleting.websites)} website${deleting.websites === 1 ? '' : 's'} with their pages, versions, domains, forms and submissions, plus media files, integrations, roles and its audit trail. Its ${formatNumber(deleting.members)} member${deleting.members === 1 ? '' : 's'} keep their accounts. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete organization"
        confirmText={deleting?.slug || undefined}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />

      <FlagOverridesSheet
        org={flagsFor}
        planFeatures={plans.data?.find((p) => p.key === flagsFor?.planKey)?.features ?? null}
        saving={update.isPending}
        onOpenChange={(o) => !o && setFlagsFor(null)}
        onSave={async (featureFlags) => {
          if (!flagsFor) return;
          await update.mutateAsync({ id: flagsFor.id, body: { featureFlags } });
          setFlagsFor(null);
        }}
      />
    </Page>
  );
}

type Tri = 'inherit' | 'on' | 'off';

function FlagOverridesSheet({ org, planFeatures, saving, onOpenChange, onSave }: { org: Org | null; planFeatures: string[] | null; saving: boolean; onOpenChange: (o: boolean) => void; onSave: (flags: Record<string, boolean>) => Promise<void> }) {
  return (
    <Sheet open={!!org} onOpenChange={onOpenChange}>
      {org && <FlagOverridesBody key={org.id} org={org} planFeatures={planFeatures} saving={saving} onSave={onSave} onCancel={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function FlagOverridesBody({ org, planFeatures, saving, onSave, onCancel }: { org: Org; planFeatures: string[] | null; saving: boolean; onSave: (flags: Record<string, boolean>) => Promise<void>; onCancel: () => void }) {
  const keys = [...new Set([...Object.keys(FEATURE_FLAGS), ...Object.keys(org.featureFlags)])];
  const [baseline] = useState<Record<string, Tri>>(() => Object.fromEntries(keys.map((k) => [k, org.featureFlags[k] === true ? 'on' : org.featureFlags[k] === false ? 'off' : 'inherit'])));
  const [state, setState] = useState(baseline);
  const dirty = keys.some((k) => state[k] !== baseline[k]);

  const submit = () => {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(state)) if (v !== 'inherit') out[k] = v === 'on';
    void onSave(out).catch(() => undefined);
  };

  return (
    <SheetContent
      size="md"
      title="Feature overrides"
      description={org.name}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={submit}>
            Save overrides
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs text-fg-muted">Overrides win over the plan. Leave a flag on Inherit to follow the plan{planFeatures ? '' : ' and global flag settings'}.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {keys.map((k) => {
          const inPlan = planFeatures?.includes(k);
          return (
            <li key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-mono text-xs text-fg">{k}</div>
                <div className="truncate text-xs text-fg-muted">{(FEATURE_FLAGS as Record<string, string>)[k] ?? 'Custom flag'}</div>
                {planFeatures && <div className="mt-0.5 text-2xs text-fg-subtle">{inPlan ? 'Included in plan' : 'Not in plan'}</div>}
              </div>
              <SegmentedControl<Tri>
                size="xs"
                aria-label={`${k} override`}
                value={state[k] ?? 'inherit'}
                onValueChange={(v) => setState((s) => ({ ...s, [k]: v }))}
                options={[
                  { value: 'inherit', label: 'Inherit' },
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </li>
          );
        })}
      </ul>
    </SheetContent>
  );
}

/** Super admin: add someone to this organization (roles are loaded for that organization). */
function AdminAddMember({ org, onClose }: { org: Org; onClose: () => void }) {
  const api = useApi();
  const roles = useQuery({ queryKey: ['admin', 'org-roles', org.id], queryFn: () => api.organizations.roles(org.id) });
  return <AddMemberDialog platform orgId={org.id} orgName={org.name} open onOpenChange={(o) => !o && onClose()} roles={roles.data ?? []} rolesLoading={roles.isPending} />;
}

/**
 * The organization's own admin address (e.g. admin.example.com). Its sign-in page shows the
 * organization's branding and the API trusts it as a sign-in origin. DNS, the reverse proxy and the
 * certificate for the hostname are set up outside the app.
 */
function AdminDomainDialog({ org, onClose }: { org: Org; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [value, setValue] = useState(org.adminHostname ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (adminHostname: string | null) => api.admin.updateOrganization(org.id, { adminHostname }),
    onSuccess: (_r, host) => {
      toast.success(host ? `${org.name} now signs in at ${host}` : `Admin domain removed from ${org.name}`);
      void qc.invalidateQueries({ queryKey: adminPrefix('organizations') });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, 'Could not save the admin domain')),
  });
  const host = value.trim().toLowerCase();
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate(host || null);
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader title="Admin domain" description={`A sign-in address for ${org.name}. Its login screen shows the organization's branding, and members land in this organization.`} />
          <DialogBody className="space-y-3">
            <Field label="Hostname" error={error ?? undefined} help="Leave empty to remove it.">
              <Input value={value} onChange={(e) => (setValue(e.target.value), setError(null))} placeholder="admin.example.com" maxLength={253} autoFocus spellCheck={false} autoCapitalize="none" />
            </Field>
            <p className="text-xs text-fg-muted">
              Point the hostname at this server (DNS), add it to the reverse proxy for the admin app with an HTTPS certificate. No restart is needed: sign-in on it is allowed as soon as you save.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button size="sm" variant="ghost" type="button" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={save.isPending} disabled={host === (org.adminHostname ?? '')}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
