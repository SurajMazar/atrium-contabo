'use client';

import { Combobox, Field, RadioGroup } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export type WebsiteAccessMode = 'all' | 'specific';

/** "All websites" or a chosen list — used when inviting or adding a member. */
export function WebsiteAccessField({
  orgId,
  enabled,
  isOwner,
  mode,
  onModeChange,
  websiteIds,
  onWebsiteIdsChange,
  showError,
}: {
  orgId: string;
  enabled: boolean;
  isOwner: boolean;
  mode: WebsiteAccessMode;
  onModeChange: (m: WebsiteAccessMode) => void;
  websiteIds: string[];
  onWebsiteIdsChange: (ids: string[]) => void;
  showError?: boolean;
}) {
  const api = useApi();
  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId), enabled });
  const options = useMemo(() => (websites.data ?? []).map((w) => ({ value: w.id, label: w.name, description: w.primaryDomain ?? w.slug })), [websites.data]);
  if (isOwner) return <p className="text-xs text-fg-muted">Owners always have access to every website.</p>;
  const scoped = mode === 'specific';
  return (
    <Field
      label="Website access"
      error={showError && scoped && websiteIds.length === 0 ? 'Choose at least one website' : undefined}
      help={scoped ? 'They only see these websites — no organization dashboard, team, billing or settings.' : undefined}
    >
      <RadioGroup
        value={mode}
        onValueChange={(v) => onModeChange(v as WebsiteAccessMode)}
        options={[
          { value: 'all', label: 'All websites', description: 'Including websites created later' },
          { value: 'specific', label: 'Specific websites' },
        ]}
      />
      {scoped && (
        <div className="mt-2">
          <Combobox
            multiple
            aria-label="Websites"
            options={options}
            value={websiteIds}
            onChange={onWebsiteIdsChange}
            loading={websites.isPending}
            placeholder="Choose websites"
            searchPlaceholder="Search websites"
            emptyText={websites.isError ? 'Could not load websites' : 'No websites'}
          />
        </div>
      )}
    </Field>
  );
}
