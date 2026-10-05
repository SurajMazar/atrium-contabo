'use client';

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@atrium/ui';
import { useQueries } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { KINDS, KIND_KEYS, providerApi } from './kinds';
import { ProviderList } from './provider-list';

export function IntegrationsScreen({ orgId }: { orgId: string }) {
  return (
    <PermissionPage permission="integration.manage">
      <IntegrationsInner orgId={orgId} />
    </PermissionPage>
  );
}

function IntegrationsInner({ orgId }: { orgId: string }) {
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'email';
  const tab = (KIND_KEYS as string[]).includes(raw) ? raw : 'email';

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

  // Counts for tab badges; each list is cached under the same key the tab uses.
  const counts = useQueries({
    queries: KINDS.map((m) => ({ queryKey: qk.providers(orgId, m.kind), queryFn: () => providerApi(api, m).list(orgId) })),
  });

  return (
    <Page>
      <PageHeader title="Integrations" description="Connect your own providers for email, SMS, storage, AI, deployments and spam protection. Platform defaults are used for anything not configured." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          {KINDS.map((m, i) => (
            <TabsTrigger key={m.kind} value={m.kind} count={counts[i]?.data?.length || undefined}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((m) => (
          <TabsContent key={m.kind} value={m.kind} className="outline-none">
            <ProviderList orgId={orgId} meta={m} />
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  );
}
