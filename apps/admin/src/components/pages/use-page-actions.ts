'use client';

import { AtriumApiError, type PageSummary } from '@atrium/sdk';
import { toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export type PageStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';
export const normalizeStatus = (s: string): PageStatus => String(s).toUpperCase() as PageStatus;

export interface PageUpdateVars {
  page: PageSummary;
  title?: string;
  slug?: string;
  status?: 'draft' | 'published' | 'scheduled' | 'archived';
  publishAt?: string | null;
  /** Toast shown on success. */
  success?: string;
}

/** Page-list mutations with optimistic cache updates and conflict handling. */
export function usePageActions(websiteId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.pages(websiteId);

  const patchRows = (fn: (rows: PageSummary[]) => PageSummary[]) => qc.setQueryData<PageSummary[]>(key, (rows) => (rows ? fn(rows) : rows));
  const snapshot = async () => {
    await qc.cancelQueries({ queryKey: key });
    return qc.getQueryData<PageSummary[]>(key);
  };
  const rollback = (prev: PageSummary[] | undefined) => {
    if (prev) qc.setQueryData(key, prev);
  };
  const refreshDraft = () => {
    void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
  };

  const update = useMutation({
    mutationFn: ({ page, title, slug, status, publishAt }: PageUpdateVars) => api.pages.update(page.id, { title, slug, status, publishAt, revision: page.revision }),
    onMutate: async (v) => {
      const prev = await snapshot();
      patchRows((rows) =>
        rows.map((r) =>
          r.id === v.page.id
            ? { ...r, ...(v.title !== undefined ? { title: v.title } : {}), ...(v.slug !== undefined && !r.isHomepage ? { slug: v.slug } : {}), ...(v.status ? { status: normalizeStatus(v.status) } : {}) }
            : r,
        ),
      );
      return { prev };
    },
    onSuccess: (res, v) => {
      patchRows((rows) => rows.map((r) => (r.id === v.page.id ? { ...r, revision: res.revision, updatedAt: res.updatedAt } : r)));
      if (v.success) toast.success(v.success);
      void qc.invalidateQueries({ queryKey: qk.page(v.page.id) });
      refreshDraft();
    },
    onError: (err, _v, ctx) => {
      rollback(ctx?.prev);
      if (err instanceof AtriumApiError && err.isConflict) {
        toast.error('This page changed since you loaded it', { description: `${err.message}. The list has been refreshed — try again.` });
        void qc.invalidateQueries({ queryKey: key });
        return;
      }
      toast.error('Could not update page', { description: errorMessage(err) });
    },
  });

  const setHomepage = useMutation({
    mutationFn: (page: PageSummary) => api.pages.setHomepage(page.id),
    onMutate: async (page) => {
      const prev = await snapshot();
      patchRows((rows) => rows.map((r) => ({ ...r, isHomepage: r.id === page.id })));
      return { prev };
    },
    onSuccess: (_r, page) => {
      toast.success(`“${page.title}” is now the homepage`);
      void qc.invalidateQueries({ queryKey: key });
      refreshDraft();
    },
    onError: (err, _p, ctx) => {
      rollback(ctx?.prev);
      toast.error('Could not set homepage', { description: errorMessage(err) });
    },
  });

  const duplicate = useMutation({
    mutationFn: (page: PageSummary) => api.pages.duplicate(page.id),
    onSuccess: (created) => {
      toast.success('Page duplicated', { description: `Created “${created.title}” at /${created.slug}` });
      void qc.invalidateQueries({ queryKey: key });
      refreshDraft();
    },
    onError: (err) => toast.error('Could not duplicate page', { description: errorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (page: PageSummary) => api.pages.remove(page.id),
    onMutate: async (page) => {
      const prev = await snapshot();
      patchRows((rows) => rows.filter((r) => r.id !== page.id));
      return { prev };
    },
    onSuccess: (_r, page) => {
      toast.success(`Deleted “${page.title}”`);
      qc.removeQueries({ queryKey: qk.page(page.id) });
      refreshDraft();
    },
    onError: (err, _p, ctx) => {
      rollback(ctx?.prev);
      toast.error('Could not delete page', { description: errorMessage(err) });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return { update, setHomepage, duplicate, remove };
}
