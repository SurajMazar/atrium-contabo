'use client';

import type { PlatformProviderKind, PlatformProviderStatus } from '@atrium/sdk';
import { Banner, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Page } from '@/components/common/page';
import { useApi } from '@/lib/api';
import { PLATFORM_KINDS, PLATFORM_SCOPE } from './kinds';
import { ProviderList } from './provider-list';

const ENV_HINT: Record<PlatformProviderKind, string> = {
  email: 'SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / MAIL_FROM',
  sms: '—',
  storage: 'STORAGE_DRIVER / S3_* / AZURE_STORAGE_* (local disk otherwise)',
  ai: 'ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY',
};

/**
 * Super-admin "Platform providers": the platform's own email, SMS, storage and AI credentials,
 * managed here instead of env variables. Organizations can still bring their own in Integrations;
 * these are the defaults behind them (and env stays as the last fallback).
 */
export function PlatformProvidersScreen() {
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'email';
  const tab = PLATFORM_KINDS.some((k) => k.kind === raw) ? raw : 'email';
  const status = useQuery({ queryKey: ['admin', 'providers', 'status'], queryFn: () => api.admin.providers.status(), refetchInterval: 15_000 });

  const setTab = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(params.toString());
      if (next === 'email') sp.delete('tab');
      else sp.set('tab', next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <Page>
      <PageHeader
        title="Platform providers"
        description="The platform’s own email, SMS, storage and AI credentials. Organizations use these unless they connect their own in Integrations. Secrets are encrypted and never shown again after saving."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          {PLATFORM_KINDS.map((m) => (
            <TabsTrigger key={m.kind} value={m.kind}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {PLATFORM_KINDS.map((m) => (
          <TabsContent key={m.kind} value={m.kind} className="space-y-4 outline-none">
            <SourceBanner kind={m.kind as PlatformProviderKind} status={status.data} />
            <ProviderList orgId={PLATFORM_SCOPE} meta={m} />
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  );
}

function SourceBanner({ kind, status }: { kind: PlatformProviderKind; status?: PlatformProviderStatus }) {
  const s = status?.[kind];
  if (!s) return null;
  if (s.source === 'admin') {
    return (
      <Banner tone="success">
        In use: <strong>{s.provider?.name}</strong> ({s.provider?.driver}). Changes apply to new sends within a minute — no restart needed.
      </Banner>
    );
  }
  if (s.source === 'env') {
    return (
      <Banner tone="info">
        Currently configured from environment variables ({ENV_HINT[kind]}). Add a provider here to manage it from the panel; it takes precedence over env.
      </Banner>
    );
  }
  return (
    <Banner tone="warning">
      {kind === 'ai'
        ? 'No platform AI key. Organizations must connect their own provider before AI generation and editing work.'
        : kind === 'sms'
          ? 'No platform SMS gateway. SMS actions only work for organizations that connect their own provider.'
          : 'Nothing configured yet.'}
    </Banner>
  );
}
