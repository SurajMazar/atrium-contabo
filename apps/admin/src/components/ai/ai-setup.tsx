'use client';

import type { AiStatus } from '@atrium/sdk';
import { Banner, Button, cn, Field, Input, Select } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, KeyRound, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export const aiStatusKey = (orgId: string) => ['org', orgId, 'ai-status'] as const;

/** Whether AI can run for the organization, and where its key comes from. */
export function useAiStatus(orgId: string | null | undefined) {
  const api = useApi();
  return useQuery({ queryKey: aiStatusKey(orgId ?? ''), queryFn: () => api.ai.status(orgId!), enabled: !!orgId, staleTime: 30_000 });
}

const LABELS: Record<string, string> = { anthropic: 'Anthropic Claude', openai: 'OpenAI', gemini: 'Google Gemini' };
const KEY_HINT: Record<string, string> = { anthropic: 'sk-ant-…', openai: 'sk-…', gemini: 'AIza…' };

/**
 * Shown wherever AI is used when no provider is available. Members with integration.manage can
 * connect a key right here (stored encrypted as the organization's default AI integration);
 * super admins are pointed at the platform-wide key; everyone else learns who can fix it.
 */
export function AiSetupCard({ orgId, status, compact, className }: { orgId: string; status: AiStatus; compact?: boolean; className?: string }) {
  if (status.ready) return null;
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4', className)}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">Connect an AI provider</div>
          <p className="mt-0.5 text-xs leading-5 text-fg-muted">
            AI generation and editing need a Claude, OpenAI or Gemini API key.
            {status.canConfigure ? ' Add one for your organization — it is encrypted and only used for your sites.' : ' Ask an organization admin (Integrations permission) to connect one.'}
          </p>
        </div>
      </div>
      {status.canConfigure && <ConnectForm orgId={orgId} compact={compact} />}
      {status.canConfigurePlatform && (
        <p className="mt-3 text-xs text-fg-muted">
          Super admin? Set one shared key for every organization in{' '}
          <Link href="/admin/providers?tab=ai" className="font-medium text-accent hover:underline">
            Platform providers
          </Link>
          .
        </p>
      )}
      {status.canConfigure && (
        <p className="mt-2 text-xs text-fg-subtle">
          More options (website-specific keys, custom base URLs) live in{' '}
          <Link href={`/org/${orgId}/integrations?tab=ai`} className="font-medium text-accent hover:underline">
            Integrations
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function ConnectForm({ orgId, compact }: { orgId: string; compact?: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const drivers = useQuery({ queryKey: qk.drivers('ai'), queryFn: () => api.providers.drivers('ai'), staleTime: 5 * 60_000 });
  const options = (drivers.data ?? []).filter((d) => d.id !== 'demo').map((d) => ({ value: d.id, label: LABELS[d.id] ?? d.name }));
  const [driver, setDriver] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const connect = useMutation({
    mutationFn: async () => {
      const created = await api.providers.integrations.create(orgId, { kind: 'AI', name: LABELS[driver] ?? driver, driver, config: {}, secrets: { apiKey: apiKey.trim() }, isDefault: true, enabled: true });
      const test = await api.providers.integrations.test(created.id, {}).catch((e: Error) => ({ ok: false, message: e.message }));
      return test;
    },
    onSuccess: (test) => {
      setResult(test);
      setApiKey('');
      void qc.invalidateQueries({ queryKey: aiStatusKey(orgId) });
      void qc.invalidateQueries({ queryKey: qk.providers(orgId, 'ai') });
    },
    onError: (e: Error) => setResult({ ok: false, message: e.message }),
  });

  return (
    <form
      className={cn('mt-3 grid gap-3', !compact && 'sm:grid-cols-[180px_1fr_auto] sm:items-end')}
      onSubmit={(e) => {
        e.preventDefault();
        if (apiKey.trim().length >= 10) connect.mutate();
      }}
    >
      <Field label="Provider">
        <Select size="sm" value={driver} onValueChange={setDriver} options={options.length ? options : [{ value: 'anthropic', label: 'Anthropic Claude' }]} />
      </Field>
      <Field label="API key">
        <Input size="sm" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={KEY_HINT[driver] ?? 'API key'} />
      </Field>
      <Button type="submit" size="sm" variant="primary" leadingIcon={<Sparkles />} loading={connect.isPending} disabled={apiKey.trim().length < 10}>
        Connect
      </Button>
      {result && (
        <Banner tone={result.ok ? 'success' : 'danger'} icon={result.ok ? <CheckCircle2 /> : <AlertCircle />} className={cn('text-xs', !compact && 'sm:col-span-3')}>
          {result.ok ? 'Connected — AI is ready.' : `Saved, but the test failed: ${result.message}`}
        </Banner>
      )}
    </form>
  );
}

/** One-line note when the offline demo provider is answering instead of a real model. */
export function AiDemoNote({ status, className }: { status?: AiStatus; className?: string }) {
  if (!status?.demoMode) return null;
  return (
    <p className={cn('text-[11px] leading-4 text-fg-subtle', className)}>
      Running on the offline demo AI (<code>AI_DEMO=1</code>). Real providers connected in Integrations or Platform providers are used once demo mode is off.
    </p>
  );
}
