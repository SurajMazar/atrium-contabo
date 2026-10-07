'use client';

import { Button, Field, FieldGroup, Input, PageHeader, Skeleton, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { errorMessage, useApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';

/** /org/[orgId]/settings — the organization's name and basic facts (owners and admins edit). */
export function OrgSettingsScreen({ orgId }: { orgId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can, reload } = useSession();
  const canEdit = can('organization.update');
  const org = useQuery({ queryKey: ['org', orgId, 'details'], queryFn: () => api.organizations.get(orgId) });
  const [name, setName] = useState('');
  useEffect(() => {
    if (org.data) setName(org.data.name);
  }, [org.data]);

  const save = useMutation({
    mutationFn: () => api.organizations.update(orgId, { name: name.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org', orgId, 'details'] });
      await reload(); // switcher, breadcrumbs
      toast.success('Organization updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canEdit && name.trim() && name.trim() !== org.data?.name) save.mutate();
  };

  return (
    <PermissionPage permission="organization.read">
      <Page>
        <PageHeader title="Organization settings" description="The name members and clients see across the admin and emails." />
        {org.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <form onSubmit={submit}>
            <FieldGroup title="General">
              <div className="space-y-4">
                <Field label="Name" help={canEdit ? undefined : 'Changing the name requires the organization.update permission.'}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={!canEdit} className="sm:max-w-md" />
                </Field>
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-fg-muted">URL slug</div>
                    <div className="font-mono text-fg">{org.data?.slug}</div>
                  </div>
                  <div>
                    <div className="text-xs text-fg-muted">Plan</div>
                    <div className="text-fg">{org.data?.planKey}</div>
                  </div>
                  <div>
                    <div className="text-xs text-fg-muted">Created</div>
                    <div className="text-fg">{org.data?.createdAt ? formatDate(org.data.createdAt) : '—'}</div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={!name.trim() || name.trim() === org.data?.name}>
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </FieldGroup>
          </form>
        )}
      </Page>
    </PermissionPage>
  );
}
