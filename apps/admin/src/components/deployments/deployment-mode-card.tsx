'use client';

import type { ProviderRecord, Website } from '@atrium/sdk';
import { Badge, Banner, Button, Card, CardHeader, Field, RadioGroup, Select, Skeleton, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import Link from 'next/link';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

type Mode = Website['deploymentMode'];

export function DeploymentModeCard({ websiteId, website, organizationId }: { websiteId: string; website: Website | undefined; organizationId: string | undefined }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  const canManageIntegrations = can('integration.manage');
  const mode: Mode = website?.deploymentMode ?? 'PLATFORM';

  const integrations = useQuery({
    queryKey: qk.providers(organizationId ?? '', 'deployment'),
    queryFn: () => api.providers.integrations.list(organizationId!, { kind: 'DEPLOYMENT' }),
    enabled: !!organizationId && mode === 'INDEPENDENT',
  });

  const save = useMutation({
    mutationFn: (body: { deploymentMode?: Mode; deploymentIntegrationId?: string | null }) => api.websites.update(websiteId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.website(websiteId), exact: true });
      const prev = qc.getQueryData<Website>(qk.website(websiteId));
      if (prev) qc.setQueryData<Website>(qk.website(websiteId), { ...prev, ...body } as Website);
      return { prev };
    },
    onSuccess: (site, body) => {
      qc.setQueryData<Website>(qk.website(websiteId), (prev) => ({ ...(prev ?? {}), ...site, permissions: site.permissions ?? prev?.permissions ?? [] }) as Website);
      toast.success(body.deploymentMode ? (body.deploymentMode === 'PLATFORM' ? 'Using platform hosting' : 'Using independent deployment') : 'Deployment integration saved');
    },
    onError: (err, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.website(websiteId), ctx.prev);
      toast.error('Could not save deployment settings', { description: errorMessage(err) });
    },
  });

  const list: ProviderRecord[] = (integrations.data ?? []).filter((i) => i.enabled !== false);
  const selected = website?.deploymentIntegrationId ?? undefined;

  return (
    <Card>
      <CardHeader title="Deployment mode" description="Choose where the published site is served from." />
      <div className="space-y-4 px-4 py-4">
        <RadioGroup
          variant="cards"
          className="sm:grid-cols-2"
          value={mode}
          disabled={!canEdit || save.isPending}
          onValueChange={(v) => v !== mode && save.mutate({ deploymentMode: v as Mode })}
          options={[
            { value: 'PLATFORM', label: 'Platform hosted', description: 'Served by Atrium’s edge with automatic SSL. Publishing makes changes live instantly.' },
            { value: 'INDEPENDENT', label: 'Independent (Vercel)', description: 'Each publish builds and deploys to your own Vercel project through a connected integration.' },
          ]}
        />

        {mode === 'INDEPENDENT' &&
          (integrations.isPending ? (
            <Skeleton className="h-8 w-72" />
          ) : integrations.isError ? (
            <Banner tone="danger" action={<Button size="xs" variant="ghost" onClick={() => void integrations.refetch()}>Retry</Button>}>
              Could not load deployment integrations. {integrations.error.message}
            </Banner>
          ) : list.length === 0 ? (
            <Banner
              icon={<Plug />}
              tone="warning"
              action={
                canManageIntegrations && organizationId ? (
                  <Button size="xs" asChild>
                    <Link href={`/org/${organizationId}/integrations`}>Add integration</Link>
                  </Button>
                ) : undefined
              }
            >
              Connect a Vercel deployment integration for your organization before deploying.
              {!canManageIntegrations && <span className="text-fg-muted"> Ask an admin with integration access.</span>}
            </Banner>
          ) : (
            <Field label="Deployment integration" help={selected ? undefined : 'Pick the account this website deploys to.'} className="max-w-md">
              <Select
                value={selected}
                placeholder="Select an integration"
                disabled={!canEdit || save.isPending}
                onValueChange={(v) => v !== selected && save.mutate({ deploymentIntegrationId: v })}
                options={list.map((i) => ({
                  value: i.id,
                  label: (
                    <span className="flex items-center gap-2">
                      {i.name}
                      {i.lastTestOk === false && (
                        <Badge tone="danger" size="xs">
                          Failing
                        </Badge>
                      )}
                    </span>
                  ),
                  description: i.driver,
                }))}
              />
            </Field>
          ))}
      </div>
    </Card>
  );
}
