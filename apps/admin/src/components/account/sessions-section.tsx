'use client';

import type { SessionInfo } from '@atrium/sdk';
import { Badge, Button, ConfirmDialog, ErrorState, FieldGroup, Skeleton, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { parseUserAgent } from './user-agent';

export function SessionsSection() {
  const api = useApi();
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState<SessionInfo | null>(null);
  const [revokeOthers, setRevokeOthers] = useState(false);

  const q = useQuery({ queryKey: qk.sessions(), queryFn: () => api.auth.sessions() });
  const sessions = useMemo(
    () => [...(q.data?.items ?? [])].sort((a, b) => (a.current === b.current ? new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime() : a.current ? -1 : 1)),
    [q.data],
  );
  const others = sessions.filter((s) => !s.current);

  const dropFromCache = (ids: string[]) =>
    qc.setQueryData<{ items: SessionInfo[] }>(qk.sessions(), (d) => (d ? { ...d, items: d.items.filter((s) => !ids.includes(s.id)) } : d));

  const revoke = useMutation({
    mutationFn: (s: SessionInfo) => api.auth.revokeSession(s.id),
    onSuccess: (_d, s) => {
      dropFromCache([s.id]);
      toast.success('Session signed out');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not revoke session')),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sessions() }),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(others.map((s) => api.auth.revokeSession(s.id)));
      const done = others.filter((_, i) => results[i]?.status === 'fulfilled').map((s) => s.id);
      return { done, failed: results.length - done.length };
    },
    onSuccess: ({ done, failed }) => {
      dropFromCache(done);
      if (failed) toast.error(`${failed} session${failed === 1 ? '' : 's'} could not be signed out`);
      else toast.success(done.length === 1 ? 'Signed out 1 other session' : `Signed out ${done.length} other sessions`);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sessions() }),
  });

  return (
    <section id="sessions" className="scroll-mt-6">
      <FieldGroup
        title="Sessions"
        description="Devices currently signed in to your account. Sign out any you don’t recognize."
        actions={
          others.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setRevokeOthers(true)}>
              Sign out other sessions
            </Button>
          )
        }
      >
        {q.isPending ? (
          <div className="-my-2 divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState className="py-6" description={q.error.message} onRetry={() => void q.refetch()} />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-fg-muted">No active sessions.</p>
        ) : (
          <ul className="-my-2 divide-y divide-border">
            {sessions.map((s) => {
              const ua = parseUserAgent(s.userAgent);
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">
                    {ua.mobile ? <Smartphone /> : <Monitor />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg" title={s.userAgent ?? undefined}>
                        {ua.browser} on {ua.os}
                      </span>
                      {s.current && (
                        <Badge size="xs" tone="success">
                          This device
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-fg-muted">
                      <span className="font-mono">{s.ip ?? 'Unknown IP'}</span>
                      <span className="mx-1.5 text-fg-subtle">·</span>
                      <span title={formatDateTime(s.lastUsedAt)}>{s.current ? 'Active now' : `Last active ${timeAgo(s.lastUsedAt)}`}</span>
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="xs" variant="ghost" onClick={() => setRevoking(s)}>
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </FieldGroup>
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        tone="danger"
        title="Sign out this session?"
        description={revoking ? `${parseUserAgent(revoking.userAgent).browser} on ${parseUserAgent(revoking.userAgent).os} will need to sign in again.` : undefined}
        confirmLabel="Revoke session"
        onConfirm={() => (revoking ? revoke.mutateAsync(revoking) : undefined)}
      />
      <ConfirmDialog
        open={revokeOthers}
        onOpenChange={setRevokeOthers}
        tone="danger"
        title="Sign out other sessions?"
        description={`${others.length === 1 ? '1 other device' : `${others.length} other devices`} will be signed out. This device stays signed in.`}
        confirmLabel="Sign out others"
        onConfirm={() => revokeAll.mutateAsync()}
      />
    </section>
  );
}
