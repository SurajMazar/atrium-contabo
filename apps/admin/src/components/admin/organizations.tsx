'use client';

import {
  Badge,
  Button,
  ConfirmDialog,
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
  IconButton,
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
import { Ban, Building2, CircleCheck, CreditCard, Flag, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/components/common/page';
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
  };
}

export function AdminOrganizations() {
  const api = useApi();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const list = useAdminList<Row>('organizations', { search: debounced || undefined }, (q) => api.admin.organizations(q));
  const plans = useQuery({ queryKey: qk.admin('plans'), queryFn: () => api.admin.plans(), staleTime: 5 * 60_000 });
  const [suspending, setSuspending] = useState<Org | null>(null);
  const [flagsFor, setFlagsFor] = useState<Org | null>(null);

  const orgs = list.items.map(toOrg).filter((o) => o.id);
  const planName = (key: string) => plans.data?.find((p) => p.key === key)?.name ?? key;

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { planKey?: string; suspended?: boolean; featureFlags?: Record<string, boolean> } }) => api.admin.updateOrganization(id, body),
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
      if (body.planKey) toast.success(`Plan changed to ${planName(body.planKey)}`);
      else if (body.suspended !== undefined) toast.success(body.suspended ? 'Organization suspended' : 'Organization reinstated');
      else if (body.featureFlags) toast.success('Feature overrides saved');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: adminPrefix('organizations') }),
  });

  return (
    <Page width="wide">
      <PageHeader title="Organizations" description="Every tenant on the platform. Change plans, suspend access or override feature flags." />
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
                      <TD>{o.suspended ? <Badge tone="danger" dot>Suspended</Badge> : <Badge tone="success" dot>Active</Badge>}</TD>
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
                            <DropdownMenuItem icon={<Flag />} onSelect={() => setFlagsFor(o)}>
                              Feature overrides…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {o.suspended ? (
                              <DropdownMenuItem icon={<CircleCheck />} onSelect={() => setSuspending(o)}>
                                Reinstate
                              </DropdownMenuItem>
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
            : 'Members lose access to the admin and the organization’s published websites stop serving. This is logged in the audit trail.'
        }
        confirmLabel={suspending?.suspended ? 'Reinstate' : 'Suspend organization'}
        confirmText={suspending?.suspended ? undefined : suspending?.slug || undefined}
        onConfirm={() => (suspending ? update.mutateAsync({ id: suspending.id, body: { suspended: !suspending.suspended } }) : undefined)}
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
