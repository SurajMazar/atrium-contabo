'use client';

import type { Domain } from '@atrium/sdk';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  ConfirmDialog,
  CopyButton,
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
  TBody,
  TD,
  TH,
  THead,
  Tooltip,
  TR,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, CornerDownRight, ExternalLink, Globe, MoreHorizontal, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Page } from '@/components/common/page';
import { GenericStatus } from '@/components/common/status';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { AddDomainDialog } from './add-domain-dialog';
import { DnsGuidance } from './dns-guidance';
import { counterpart } from './domain-utils';

const isVerified = (d: Domain) => !!d.verifiedAt || /^(active|verified|valid)$/i.test(d.status);

export function DomainsScreen({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { website } = useWebsite();
  const { can } = useSession();
  const canManage = can('domain.manage', websiteId);
  const key = qk.domains(websiteId);

  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Domain | null>(null);
  const [verifying, setVerifying] = useState<Set<string>>(new Set());

  const q = useQuery({ queryKey: key, queryFn: () => api.domains.list(websiteId) });

  // Expand the first domain that still needs DNS work.
  useEffect(() => {
    if (expanded === null && q.data?.length) {
      const pending = q.data.find((d) => !isVerified(d));
      if (pending) setExpanded(pending.id);
    }
  }, [q.data, expanded]);

  const patch = (fn: (list: Domain[]) => Domain[]) => qc.setQueryData<Domain[]>(key, (list) => (list ? fn(list) : list));

  const update = useMutation({
    mutationFn: ({ domain, body }: { domain: Domain; body: { isPrimary?: boolean; redirectToPrimary?: boolean } }) => api.domains.update(domain.id, body),
    onMutate: async ({ domain, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Domain[]>(key);
      patch((list) =>
        list.map((d) => {
          if (d.id === domain.id) return { ...d, ...body, ...(body.isPrimary ? { redirectToPrimary: false } : {}) };
          return body.isPrimary ? { ...d, isPrimary: false } : d;
        }),
      );
      return { prev };
    },
    onSuccess: (res, { body }) => {
      patch((list) => list.map((d) => (d.id === res.id ? res : d)));
      if (body.isPrimary) {
        toast.success(`${res.hostname} is now the primary domain`);
        void qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true });
        void qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) });
      } else toast.success(res.redirectToPrimary ? `${res.hostname} redirects to the primary domain` : `${res.hostname} no longer redirects`);
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error('Could not update domain', { description: errorMessage(err) });
    },
    onSettled: (_r, _e, { body }) => {
      if (body.isPrimary) void qc.invalidateQueries({ queryKey: key });
    },
  });

  const verify = async (d: Domain) => {
    setVerifying((s) => new Set(s).add(d.id));
    try {
      const res = await api.domains.verify(d.id);
      patch((list) => list.map((x) => (x.id === res.id ? res : x)));
      if (isVerified(res)) toast.success(`${res.hostname} is verified`, { description: `SSL: ${res.sslStatus}` });
      else toast.message(`${res.hostname} isn’t ready yet`, { description: `DNS status: ${res.dnsStatus.replace(/[-_]/g, ' ')}. Changes can take up to 48 hours.` });
    } catch (err) {
      toast.error('Could not verify domain', { description: errorMessage(err) });
    } finally {
      setVerifying((s) => {
        const n = new Set(s);
        n.delete(d.id);
        return n;
      });
    }
  };

  const remove = useMutation({
    mutationFn: (d: Domain) => api.domains.remove(d.id),
    onSuccess: (_r, d) => {
      patch((list) => list.filter((x) => x.id !== d.id));
      toast.success(`Removed ${d.hostname}`);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true });
    },
    onError: (err) => toast.error('Could not remove domain', { description: errorMessage(err) }),
  });

  const addCounterpart = useMutation({
    mutationFn: (host: string) => api.domains.add(websiteId, host),
    onSuccess: (d) => {
      patch((list) => [...list, d]);
      toast.success(`Added ${d.hostname}`);
      setExpanded(d.id);
    },
    onError: (err) => toast.error('Could not add domain', { description: errorMessage(err) }),
  });

  const domains = q.data ?? [];
  const hosts = domains.map((d) => d.hostname);
  const platformUrl = website?.platformUrl;

  return (
    <Page width="wide">
      <PageHeader
        title="Domains"
        description="Connect custom domains and choose which one is primary."
        actions={
          canManage && (
            <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
              Add domain
            </Button>
          )
        }
      />

      <div className="space-y-4">
        {platformUrl && (
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Platform address</div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1">
                <a href={platformUrl} target="_blank" rel="noreferrer" className="truncate font-mono text-sm text-fg hover:underline">
                  {platformUrl.replace(/^https?:\/\//, '')}
                </a>
                <CopyButton value={platformUrl} label="Copy platform URL" />
              </div>
            </div>
            <p className="max-w-sm text-xs text-fg-muted">Always available, with SSL, whether or not you connect a custom domain.</p>
            <Button size="sm" variant="ghost" asChild>
              <a href={platformUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Visit
              </a>
            </Button>
          </Card>
        )}

        <Card>
          <CardHeader title="Custom domains" description={domains.length ? 'Select a domain to see the DNS records it needs.' : undefined} />
          {q.isPending ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex h-11 items-center gap-4 px-3">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="ml-auto h-6 w-16" />
                </div>
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
          ) : domains.length === 0 ? (
            <EmptyState
              icon={<Globe />}
              title="No custom domains"
              description="Your site is live at the platform address above. Add a domain you own to use your own brand."
              action={
                canManage && (
                  <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
                    Add domain
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Domain</TH>
                    <TH>Status</TH>
                    <TH>DNS</TH>
                    <TH>SSL</TH>
                    <TH className="hidden xl:table-cell">Environment</TH>
                    <TH className="hidden xl:table-cell">Provider</TH>
                    <TH className="hidden md:table-cell">Redirect</TH>
                    <TH className="hidden lg:table-cell" align="right">
                      Checked
                    </TH>
                    <TH className="w-32">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {domains.map((d) => {
                    const open = expanded === d.id;
                    const busy = verifying.has(d.id);
                    return (
                      <Fragment key={d.id}>
                        <TR selected={open} className="hover:bg-surface-2/40">
                          <TD className="max-w-[320px]">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={`dns-${d.id}`}
                              onClick={() => setExpanded(open ? '' : d.id)}
                              className="-mx-1 flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {open ? <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} /> : <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} />}
                              <span className="truncate font-medium text-fg">{d.hostname}</span>
                              {d.isPrimary && (
                                <Badge tone="accent" size="xs">
                                  Primary
                                </Badge>
                              )}
                            </button>
                          </TD>
                          <TD>
                            <GenericStatus value={d.status} />
                          </TD>
                          <TD>
                            <GenericStatus value={d.dnsStatus} />
                          </TD>
                          <TD>
                            <GenericStatus value={d.sslStatus} />
                          </TD>
                          <TD muted className="hidden capitalize xl:table-cell">
                            {d.environment}
                          </TD>
                          <TD muted className="hidden capitalize xl:table-cell">
                            {d.provider}
                          </TD>
                          <TD className="hidden md:table-cell">
                            {d.isPrimary ? (
                              <span className="text-xs text-fg-subtle">—</span>
                            ) : (
                              <Tooltip content={d.redirectToPrimary ? 'Redirects to the primary domain' : 'Serves the site directly'}>
                                <span className="inline-flex">
                                  <Switch
                                    size="sm"
                                    aria-label={`Redirect ${d.hostname} to primary`}
                                    checked={d.redirectToPrimary}
                                    disabled={!canManage}
                                    onCheckedChange={(v) => update.mutate({ domain: d, body: { redirectToPrimary: v } })}
                                  />
                                </span>
                              </Tooltip>
                            )}
                          </TD>
                          <TD muted align="right" className="hidden whitespace-nowrap lg:table-cell">
                            {d.lastCheckedAt ? <span title={formatDateTime(d.lastCheckedAt)}>{timeAgo(d.lastCheckedAt)}</span> : 'Never'}
                          </TD>
                          <TD className="pl-0">
                            <div className="flex items-center justify-end gap-1">
                              {canManage && (
                                <Button size="xs" variant="ghost" leadingIcon={<RefreshCw className={cn(busy && 'animate-spin')} />} disabled={busy} onClick={() => void verify(d)}>
                                  {busy ? 'Checking' : 'Verify'}
                                </Button>
                              )}
                              {canManage && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <IconButton label={`Actions for ${d.hostname}`} size="xs">
                                      <MoreHorizontal />
                                    </IconButton>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem icon={<Star />} disabled={d.isPrimary} onSelect={() => update.mutate({ domain: d, body: { isPrimary: true } })}>
                                      {d.isPrimary ? 'Primary domain' : 'Set as primary'}
                                    </DropdownMenuItem>
                                    {!d.isPrimary && (
                                      <DropdownMenuItem icon={<CornerDownRight />} onSelect={() => update.mutate({ domain: d, body: { redirectToPrimary: !d.redirectToPrimary } })}>
                                        {d.redirectToPrimary ? 'Stop redirecting' : 'Redirect to primary'}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem icon={<ExternalLink />} onSelect={() => window.open(`https://${d.hostname}`, '_blank', 'noopener,noreferrer')}>
                                      Visit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setRemoving(d)}>
                                      Remove
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </TD>
                        </TR>
                        {open && (
                          <tr id={`dns-${d.id}`} className="bg-surface-2/30">
                            <td colSpan={9} className="p-0">
                              <DnsGuidance
                                domain={d}
                                canManage={canManage}
                                hasCounterpart={(() => {
                                  const c = counterpart(d.hostname);
                                  return !c || hosts.includes(c);
                                })()}
                                adding={addCounterpart.isPending}
                                onAddCounterpart={(h) => addCounterpart.mutate(h)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <AddDomainDialog open={adding} onOpenChange={setAdding} websiteId={websiteId} existing={hosts} onAdded={(d) => setExpanded(d.id)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={removing ? `Remove ${removing.hostname}?` : 'Remove domain'}
        description={
          removing?.isPrimary
            ? 'This is the primary domain. Visitors using it will stop reaching the site, and the next domain becomes primary.'
            : 'Visitors using this domain will stop reaching the site. You can add it again later.'
        }
        confirmLabel="Remove domain"
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing);
        }}
      />
    </Page>
  );
}
