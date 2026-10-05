'use client';

import { AtriumApiError, type DraftResponse } from '@atrium/sdk';
import type { WebsiteDefinition } from '@atrium/schema';
import { toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './api';
import { qk } from './query-keys';

/** Load the full editable draft (`GET /websites/:id/draft`). */
export function useDraft(websiteId: string, opts: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({ queryKey: qk.draft(websiteId), queryFn: () => api.websites.draft(websiteId), enabled: opts.enabled ?? true, staleTime: 10_000 });
}

export type SitePatch = {
  settings?: WebsiteDefinition['settings'];
  navigation?: WebsiteDefinition['navigation'];
  customCss?: string;
};

/**
 * Save site-level draft fields via `PUT /websites/:id/draft/site` using the
 * draft's current `revisions.site`. On 409 the draft is refetched and the user
 * is told to review and re-apply. Updates the cached draft optimistically.
 */
export function useSaveSite(websiteId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SitePatch) => {
      const cached = qc.getQueryData<DraftResponse>(qk.draft(websiteId));
      const draft: DraftResponse = cached ?? (await qc.fetchQuery({ queryKey: qk.draft(websiteId), queryFn: () => api.websites.draft(websiteId) }));
      return api.websites.saveSite(websiteId, { ...patch, revision: draft.revisions.site });
    },
    onSuccess: (res, patch) => {
      qc.setQueryData<DraftResponse>(qk.draft(websiteId), (d) =>
        d
          ? {
              ...d,
              definition: {
                ...d.definition,
                ...(patch.settings ? { settings: patch.settings } : {}),
                ...(patch.navigation ? { navigation: patch.navigation } : {}),
                ...(patch.customCss !== undefined ? { customCss: patch.customCss } : {}),
              },
              revisions: { ...d.revisions, site: res.revision },
            }
          : d,
      );
      void qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true });
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
        toast.error('Someone else changed these settings', { description: 'We loaded the latest version. Review and save again.' });
      } else if (err instanceof AtriumApiError && err.isValidation) {
        toast.error('Some values are invalid', { description: err.message });
      } else {
        toast.error(err instanceof Error ? err.message : 'Save failed');
      }
    },
  });
}

/** Merge a partial settings object into the current draft settings. */
export function mergeSettings(current: WebsiteDefinition['settings'], patch: Partial<WebsiteDefinition['settings']>): WebsiteDefinition['settings'] {
  return { ...current, ...patch };
}
