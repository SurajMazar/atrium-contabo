'use client';

import type { List, Webhook, WebhookDelivery } from '@atrium/sdk';
import {
  Badge,
  Banner,
  Button,
  CopyButton,
  CopyField,
  DescriptionList,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  Sheet,
  SheetContent,
  Skeleton,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  type BadgeTone,
} from '@atrium/ui';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Pencil, RefreshCw, RotateCcw, Send, Webhook as WebhookIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, formatDuration, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { eventsSummary, isAllEvents } from './events';
import { SignatureCard } from './signature-card';

const STATUS: Record<WebhookDelivery['status'], { tone: BadgeTone; label: string }> = {
  SUCCESS: { tone: 'success', label: 'Success' },
  FAILED: { tone: 'danger', label: 'Failed' },
  RETRYING: { tone: 'warning', label: 'Retrying' },
  PENDING: { tone: 'neutral', label: 'Pending' },
};

export function DeliveryStatusBadge({ status }: { status: WebhookDelivery['status'] }) {
  const m = STATUS[status] ?? { tone: 'neutral' as const, label: String(status).toLowerCase() };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

type Pages = InfiniteData<List<WebhookDelivery>, string | undefined>;

export function WebhookDetailSheet({ webhook, websiteName, onOpenChange, onEdit }: { webhook: Webhook | null; websiteName: (id: string | null) => string; onOpenChange: (open: boolean) => void; onEdit: (w: Webhook) => void }) {
  return (
    <Sheet open={!!webhook} onOpenChange={onOpenChange}>
      {webhook && <DetailBody key={webhook.id} webhook={webhook} websiteName={websiteName} onEdit={onEdit} />}
    </Sheet>
  );
}

function DetailBody({ webhook, websiteName, onEdit }: { webhook: Webhook; websiteName: (id: string | null) => string; onEdit: (w: Webhook) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.webhookDeliveries(webhook.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const deliveries = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.webhooks.deliveries(webhook.id, pageParam ? { cursor: pageParam } : {}),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((d) => d.status === 'PENDING' || d.status === 'RETRYING')) ? 3000 : false),
  });

  const items = useMemo(() => deliveries.data?.pages.flatMap((p) => p.items) ?? [], [deliveries.data]);
  const selected = items.find((d) => d.id === selectedId) ?? null;

  const ping = useMutation({
    mutationFn: () => api.webhooks.test(webhook.id),
    onSuccess: (d) => {
      qc.setQueryData<Pages>(key, (data) => (data && data.pages[0] ? { ...data, pages: [{ ...data.pages[0], items: [d, ...data.pages[0].items.filter((x) => x.id !== d.id)] }, ...data.pages.slice(1)] } : data));
      toast.success('Test ping queued');
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not send test ping')),
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.webhooks.retryDelivery(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Pages>(key);
      qc.setQueryData<Pages>(key, (data) => (data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((d) => (d.id === id ? { ...d, status: 'RETRYING' as const } : d)) })) } : data));
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(err, 'Could not retry delivery'));
    },
    onSuccess: () => toast.success('Retry queued'),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <SheetContent
      size="xl"
      title={webhook.name}
      description={webhook.enabled ? 'Enabled' : 'Disabled — events are not being sent'}
      actions={
        <>
          <Button size="sm" variant="ghost" leadingIcon={<Pencil />} onClick={() => onEdit(webhook)}>
            Edit
          </Button>
          <Button size="sm" variant="secondary" leadingIcon={<Send />} loading={ping.isPending} onClick={() => ping.mutate()}>
            Send test ping
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-1.5">
            <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Endpoint</div>
            <CopyField value={webhook.url} label="Endpoint URL" />
          </div>
          <div className="space-y-1.5">
            <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Scope</div>
            <div className="flex h-8 items-center text-sm text-fg">{websiteName(webhook.websiteId)}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Events · {eventsSummary(webhook.events)}</div>
          <div className="flex flex-wrap gap-1">
            {isAllEvents(webhook.events) && webhook.events.includes('*') ? (
              <Badge tone="outline">All events</Badge>
            ) : (
              webhook.events.map((e) => (
                <Badge key={e} tone="outline" className="font-mono">
                  {e}
                </Badge>
              ))
            )}
          </div>
        </div>

        <Tabs defaultValue="deliveries">
          <TabsList className="mb-4">
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="verify">Verify signatures</TabsTrigger>
          </TabsList>
          <TabsContent value="deliveries" className="outline-none">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-fg-muted">Most recent first. Failed deliveries retry automatically with backoff.</p>
              <Button size="xs" variant="ghost" leadingIcon={<RefreshCw />} loading={deliveries.isRefetching && !deliveries.isFetchingNextPage} onClick={() => void deliveries.refetch()}>
                Refresh
              </Button>
            </div>
            {deliveries.isPending ? (
              <TableContainer>
                <div className="divide-y divide-border">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex h-10 items-center gap-4 px-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="ml-auto h-4 w-16" />
                    </div>
                  ))}
                </div>
              </TableContainer>
            ) : deliveries.isError ? (
              <TableContainer>
                <ErrorState description={deliveries.error.message} onRetry={() => void deliveries.refetch()} />
              </TableContainer>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-strong">
                <EmptyState
                  compact
                  icon={<WebhookIcon />}
                  title="No deliveries yet"
                  description="Deliveries appear here when a subscribed event happens. Send a test ping to check your endpoint."
                  action={
                    <Button size="sm" variant="primary" leadingIcon={<Send />} loading={ping.isPending} onClick={() => ping.mutate()}>
                      Send test ping
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <TableContainer>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Event</TH>
                        <TH>Status</TH>
                        <TH align="right">Attempts</TH>
                        <TH align="right">Response</TH>
                        <TH align="right" className="hidden md:table-cell">
                          Duration
                        </TH>
                        <TH align="right">Time</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {items.map((d) => (
                        <TR key={d.id} interactive onClick={() => setSelectedId(d.id)} selected={d.id === selectedId}>
                          <TD mono>
                            <button type="button" className="outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), setSelectedId(d.id))}>
                              {d.event}
                            </button>
                          </TD>
                          <TD>
                            <DeliveryStatusBadge status={d.status} />
                          </TD>
                          <TD align="right" muted>
                            {d.attempts}
                          </TD>
                          <TD align="right" mono className={responseTone(d.responseStatus)}>
                            {d.responseStatus ?? '—'}
                          </TD>
                          <TD align="right" muted className="hidden md:table-cell">
                            {d.durationMs !== null ? formatDuration(d.durationMs) : '—'}
                          </TD>
                          <TD align="right" muted>
                            <span title={formatDateTime(d.createdAt)}>{timeAgo(d.createdAt)}</span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
                {deliveries.hasNextPage && (
                  <div className="mt-3 flex justify-center">
                    <Button size="sm" variant="ghost" loading={deliveries.isFetchingNextPage} onClick={() => void deliveries.fetchNextPage()}>
                      Load older deliveries
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="verify" className="outline-none">
            <SignatureCard />
          </TabsContent>
        </Tabs>
      </div>

      <DeliveryDialog delivery={selected} onOpenChange={(o) => !o && setSelectedId(null)} onRetry={(id) => retry.mutate(id)} retrying={retry.isPending} />
    </SheetContent>
  );
}

function responseTone(code: number | null) {
  if (code === null) return 'text-fg-subtle';
  if (code >= 200 && code < 300) return 'text-success';
  if (code >= 400) return 'text-danger';
  return 'text-fg-muted';
}

function pretty(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function CodeBlock({ title, value, empty }: { title: string; value: string; empty: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2/40">
      <div className="flex h-9 items-center justify-between border-b border-border pl-3 pr-1">
        <span className="text-xs font-medium text-fg-muted">{title}</span>
        {value && <CopyButton value={value} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {value ? <pre className="max-h-80 overflow-auto p-3 font-mono text-xs leading-5 text-fg">{value}</pre> : <p className="px-3 py-4 text-xs text-fg-subtle">{empty}</p>}
    </div>
  );
}

function DeliveryDialog({ delivery, onOpenChange, onRetry, retrying }: { delivery: WebhookDelivery | null; onOpenChange: (o: boolean) => void; onRetry: (id: string) => void; retrying: boolean }) {
  const busy = delivery?.status === 'PENDING' || delivery?.status === 'RETRYING';
  return (
    <Dialog open={!!delivery} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={<span className="font-mono">{delivery?.event ?? ''}</span>} description={delivery ? `Delivery ${delivery.id}` : undefined} />
        {delivery && (
          <DialogBody className="space-y-4">
            <DescriptionList
              items={[
                { label: 'Status', value: <DeliveryStatusBadge status={delivery.status} /> },
                { label: 'Response code', value: <span className={`font-mono text-xs ${responseTone(delivery.responseStatus)}`}>{delivery.responseStatus ?? 'No response'}</span> },
                { label: 'Attempts', value: delivery.attempts },
                { label: 'Duration', value: delivery.durationMs !== null ? formatDuration(delivery.durationMs) : '—' },
                { label: 'Created', value: formatDateTime(delivery.createdAt) },
              ]}
            />
            {delivery.error && <Banner tone="danger">{delivery.error}</Banner>}
            <CodeBlock title="Request payload" value={pretty(delivery.payload)} empty="Payload not available." />
            <CodeBlock title="Response body" value={pretty(delivery.responseBody)} empty={busy ? 'Waiting for a response…' : 'The endpoint returned an empty body.'} />
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" size="sm" leadingIcon={<RotateCcw />} disabled={!delivery || busy} loading={retrying} onClick={() => delivery && onRetry(delivery.id)}>
            {delivery?.status === 'SUCCESS' ? 'Redeliver' : 'Retry delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
