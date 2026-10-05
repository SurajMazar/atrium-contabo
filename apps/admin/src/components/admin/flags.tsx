'use client';

import { FEATURE_FLAGS } from '@atrium/schema';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Switch, Table, TableContainer, TBody, TD, TH, THead, TR, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Flag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { JsonDialog } from './json-dialog';
import { bool, rec, str } from './narrow';
import { TableSkeleton } from './parts';
import { SaveBar } from './save-bar';

interface FlagRow {
  key: string;
  description: string;
  enabled: boolean;
  rules: Record<string, unknown>;
}

export function AdminFlags() {
  const api = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.admin('flags'), queryFn: () => api.admin.featureFlags(), refetchOnWindowFocus: false });
  const server = useMemo<FlagRow[]>(
    () => (q.data ?? []).map((f) => ({ key: str(f.key), description: str(f.description), enabled: bool(f.enabled), rules: rec(f.rules) })).filter((f) => f.key),
    [q.data],
  );
  const [draft, setDraft] = useState<FlagRow[]>([]);
  const [editing, setEditing] = useState<FlagRow | null>(null);
  useEffect(() => setDraft(server), [server]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(server);
  const changed = draft.filter((d) => JSON.stringify(d) !== JSON.stringify(server.find((s) => s.key === d.key))).length;

  const save = useMutation({
    mutationFn: () => api.admin.saveFeatureFlags(draft.map((f) => ({ key: f.key, enabled: f.enabled, rules: f.rules }))),
    onSuccess: () => {
      toast.success('Feature flags saved');
      void qc.invalidateQueries({ queryKey: qk.admin('flags') });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save feature flags')),
  });

  const patch = (key: string, p: Partial<FlagRow>) => setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <Page>
      <PageHeader title="Feature flags" description="Global switches. Plans and per-organization overrides decide who gets a feature; a flag that is off here is off for everyone." />
      {q.isPending ? (
        <TableSkeleton cols={4} rows={8} />
      ) : q.isError ? (
        <Card>
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : draft.length === 0 ? (
        <Card>
          <EmptyState icon={<Flag />} title="No feature flags defined" description="Flags are created by the database seed. Run the seed to register the built-in flags." />
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Flag</TH>
                <TH className="hidden md:table-cell">Description</TH>
                <TH>Rules</TH>
                <TH align="center">Enabled</TH>
              </tr>
            </THead>
            <TBody>
              {draft.map((f) => {
                const ruleCount = Object.keys(f.rules).length;
                const before = server.find((s) => s.key === f.key);
                const modified = !!before && JSON.stringify(before) !== JSON.stringify(f);
                return (
                  <TR key={f.key}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-fg">{f.key}</span>
                        {modified && (
                          <Badge tone="warning" size="xs">
                            Edited
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD muted className="hidden max-w-[360px] md:table-cell">
                      <span className="line-clamp-2">{f.description || (FEATURE_FLAGS as Record<string, string>)[f.key] || '—'}</span>
                    </TD>
                    <TD>
                      <Button size="xs" variant="ghost" leadingIcon={<Braces />} onClick={() => setEditing(f)}>
                        {ruleCount === 0 ? 'No rules' : `${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'}`}
                      </Button>
                    </TD>
                    <TD align="center">
                      <Switch size="sm" aria-label={`Toggle ${f.key}`} checked={f.enabled} onCheckedChange={(v) => patch(f.key, { enabled: v })} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <SaveBar dirty={dirty} saving={save.isPending} message={`${changed} ${changed === 1 ? 'flag' : 'flags'} changed`} onSave={() => save.mutate()} onReset={() => setDraft(server)} />

      <JsonDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={<span className="font-mono">{editing?.key}</span>}
        description="Targeting rules evaluated by the API, e.g. percentage rollouts or allowed organization ids."
        value={editing?.rules ?? {}}
        help='Example: { "organizations": ["org_123"], "percentage": 25 }'
        onApply={(rules) => editing && patch(editing.key, { rules })}
      />
    </Page>
  );
}
