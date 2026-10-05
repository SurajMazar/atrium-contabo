'use client';

import { DEFAULT_PLANS, FEATURE_FLAGS, slugify } from '@atrium/schema';
import { Badge, Button, Card, ChoiceChips, CodeEditor, cn, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton, Switch, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '@/components/common/page';
import { errorMessage, useApi } from '@/lib/api';
import { formatUsd } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { parseJsonObject } from './json-dialog';
import { arr, bool, num, rec, str } from './narrow';
import { SaveBar } from './save-bar';

interface PlanDraft {
  /** Stable client id (the key can change for unsaved plans). */
  cid: string;
  key: string;
  name: string;
  priceMonthly: number;
  features: string[];
  limitsText: string;
  active: boolean;
  isNew: boolean;
}

function toDraft(p: Record<string, unknown>): PlanDraft {
  const key = str(p.key);
  return {
    cid: key,
    key,
    name: str(p.name, key),
    priceMonthly: num(p.priceMonthly),
    features: arr(p.features).filter((f): f is string => typeof f === 'string'),
    limitsText: JSON.stringify(rec(p.limits), null, 2),
    active: p.active === undefined ? true : bool(p.active),
    isNew: false,
  };
}

function errorsOf(p: PlanDraft, all: PlanDraft[]): { key?: string; name?: string; limits?: string; price?: string } {
  const e: { key?: string; name?: string; limits?: string; price?: string } = {};
  if (!p.key) e.key = 'Key is required';
  else if (!/^[a-z0-9][a-z0-9-_]*$/.test(p.key)) e.key = 'Lowercase letters, numbers, - and _ only';
  else if (all.some((o) => o.cid !== p.cid && o.key === p.key)) e.key = 'Another plan uses this key';
  if (!p.name.trim()) e.name = 'Name is required';
  if (!Number.isInteger(p.priceMonthly) || p.priceMonthly < 0) e.price = 'Whole, non-negative amount';
  const parsed = parseJsonObject(p.limitsText, { numbersOnly: true });
  if ('error' in parsed) e.limits = parsed.error;
  return e;
}

export function AdminPlans() {
  const api = useApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.admin('plans'), queryFn: () => api.admin.plans(), refetchOnWindowFocus: false });
  const server = useMemo(() => (q.data ?? []).map((p) => toDraft(p as unknown as Record<string, unknown>)).filter((p) => p.key), [q.data]);
  const [draft, setDraft] = useState<PlanDraft[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setDraft(server);
    setSelected((s) => (s && server.some((p) => p.cid === s) ? s : (server[0]?.cid ?? null)));
  }, [server]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(server);
  const invalid = draft.some((p) => Object.keys(errorsOf(p, draft)).length > 0);
  const current = draft.find((p) => p.cid === selected) ?? draft[0] ?? null;
  const errs = current ? errorsOf(current, draft) : {};

  const patch = (cid: string, p: Partial<PlanDraft>) => setDraft((rows) => rows.map((r) => (r.cid === cid ? { ...r, ...p } : r)));

  const addPlan = () => {
    const cid = `new-${Date.now()}`;
    const limits = DEFAULT_PLANS[0]?.limits ?? {};
    setDraft((rows) => [...rows, { cid, key: '', name: 'New plan', priceMonthly: 0, features: [], limitsText: JSON.stringify(limits, null, 2), active: true, isNew: true }]);
    setSelected(cid);
  };

  const save = useMutation({
    mutationFn: () =>
      api.admin.savePlans(
        draft.map((p) => {
          const parsed = parseJsonObject(p.limitsText, { numbersOnly: true });
          return { key: p.key, name: p.name.trim(), priceMonthly: p.priceMonthly, features: p.features, limits: 'value' in parsed ? parsed.value : {}, active: p.active };
        }),
      ),
    onSuccess: () => {
      toast.success('Plans saved');
      void qc.invalidateQueries({ queryKey: qk.admin('plans') });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save plans')),
  });

  const featureOptions = Object.entries(FEATURE_FLAGS).map(([value, description]) => ({ value, label: value, description }));

  return (
    <Page width="wide">
      <PageHeader
        title="Plans"
        description="Limits and features for each subscription tier. Changes apply to every organization on the plan."
        actions={
          draft.length > 0 && (
            <Button size="sm" leadingIcon={<Plus />} onClick={addPlan}>
              New plan
            </Button>
          )
        }
      />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <Skeleton className="h-48" />
          <Skeleton className="h-96" />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : draft.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CreditCard />}
            title="No plans defined"
            description="Organizations need a plan for limits and features. Create one to get started."
            action={
              <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={addPlan}>
                New plan
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Plans" className="overflow-hidden rounded-lg border border-border bg-surface">
            <ul className="divide-y divide-border">
              {draft.map((p) => {
                const bad = Object.keys(errorsOf(p, draft)).length > 0;
                const before = server.find((s) => s.cid === p.cid);
                const edited = !before || JSON.stringify(before) !== JSON.stringify(p);
                return (
                  <li key={p.cid}>
                    <button
                      type="button"
                      onClick={() => setSelected(p.cid)}
                      aria-current={p.cid === current?.cid || undefined}
                      className={cn('flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', p.cid === current?.cid ? 'bg-accent-soft/50' : 'hover:bg-surface-2/60')}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{p.name || 'Untitled'}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          {formatUsd(p.priceMonthly)}/mo{!p.active && ' · Inactive'}
                        </span>
                      </span>
                      {bad ? (
                        <Badge tone="danger" size="xs">
                          Fix
                        </Badge>
                      ) : edited ? (
                        <Badge tone="warning" size="xs">
                          {p.isNew ? 'New' : 'Edited'}
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {current && (
            <Card className="divide-y divide-border">
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Name" required error={errs.name}>
                  <Input
                    value={current.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      patch(current.cid, current.isNew && (current.key === '' || current.key === slugify(current.name)) ? { name, key: slugify(name) } : { name });
                    }}
                  />
                </Field>
                <Field label="Key" required error={errs.key} help={current.isNew ? 'Stored on organizations; can’t be changed later.' : 'Keys are permanent.'}>
                  <Input value={current.key} onChange={(e) => patch(current.cid, { key: e.target.value.toLowerCase() })} readOnly={!current.isNew} disabled={!current.isNew} className="font-mono text-xs" />
                </Field>
                <Field label="Monthly price" error={errs.price} help="Whole US dollars. 0 for free plans.">
                  <Input type="number" min={0} step={1} prefix={<span className="text-xs">$</span>} value={String(current.priceMonthly)} onChange={(e) => patch(current.cid, { priceMonthly: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </Field>
                <div className="flex items-end pb-1.5">
                  <Switch className="w-full" label="Available for new organizations" description="Inactive plans keep existing subscribers." checked={current.active} onCheckedChange={(v) => patch(current.cid, { active: v })} />
                </div>
              </div>
              <div className="space-y-2 p-4">
                <div>
                  <h3 className="text-sm font-medium text-fg">Features</h3>
                  <p className="text-xs text-fg-muted">Feature flags included in this plan.</p>
                </div>
                <ChoiceChips multiple options={featureOptions} value={current.features} onChange={(v) => patch(current.cid, { features: Array.isArray(v) ? v : [v] })} />
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-fg">Limits</h3>
                    <p className="text-xs text-fg-muted">A JSON object of numeric limits, e.g. websites, members, storageMb, aiRequestsPerMonth.</p>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={!!errs.limits}
                    onClick={() => {
                      const parsed = parseJsonObject(current.limitsText, { numbersOnly: true });
                      if ('value' in parsed) patch(current.cid, { limitsText: JSON.stringify(parsed.value, null, 2) });
                    }}
                  >
                    Format
                  </Button>
                </div>
                <CodeEditor value={current.limitsText} onChange={(limitsText) => patch(current.cid, { limitsText })} language="json" minRows={10} invalid={!!errs.limits} aria-label="Plan limits JSON" />
                {errs.limits && <p className="text-xs text-danger">{errs.limits}</p>}
              </div>
              {current.isNew && (
                <div className="flex justify-end p-3">
                  <Button
                    size="xs"
                    variant="danger-ghost"
                    onClick={() => {
                      setDraft((rows) => rows.filter((r) => r.cid !== current.cid));
                      setSelected(draft.find((r) => r.cid !== current.cid)?.cid ?? null);
                    }}
                  >
                    Remove unsaved plan
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      <SaveBar dirty={dirty} saving={save.isPending} disabled={invalid} message={invalid ? 'Fix the highlighted plans before saving' : 'Unsaved plan changes'} onSave={() => save.mutate()} onReset={() => setDraft(server)} />
    </Page>
  );
}
