'use client';

import { AtriumApiError } from '@atrium/sdk';
import type { PageSeo } from '@atrium/schema';
import { Badge, Banner, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, EmptyState, ErrorState, Skeleton, Tooltip, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, PenTool, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

export interface Recommendation {
  field: string;
  current: string | null;
  suggested: string;
  reason: string;
}

type ApplicableField = 'title' | 'description' | 'ogTitle' | 'ogDescription' | 'keywords' | 'canonical' | 'ogImage';

const FIELD_ALIASES: Record<string, ApplicableField> = {
  title: 'title',
  metatitle: 'title',
  seotitle: 'title',
  description: 'description',
  metadescription: 'description',
  seodescription: 'description',
  ogtitle: 'ogTitle',
  ogdescription: 'ogDescription',
  keywords: 'keywords',
  canonical: 'canonical',
  canonicalurl: 'canonical',
  ogimage: 'ogImage',
};

const FIELD_LABEL: Record<ApplicableField, string> = {
  title: 'Meta title',
  description: 'Meta description',
  ogTitle: 'Social title',
  ogDescription: 'Social description',
  keywords: 'Keywords',
  canonical: 'Canonical URL',
  ogImage: 'Social image',
};

/** Map an AI field name (e.g. "seo.metaDescription") onto a PageSeo key, or null if it can't be applied automatically. */
export function resolveField(field: string): ApplicableField | null {
  const key = field.replace(/^(page\.)?seo\./i, '').replace(/[\s_-]/g, '').toLowerCase();
  return FIELD_ALIASES[key] ?? null;
}

function coerce(field: ApplicableField, suggested: string): PageSeo[ApplicableField] {
  if (field === 'keywords') {
    return suggested
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return suggested.trim();
}

/** Apply recommendations to a page: fetch → merge seo → PATCH with the fresh revision (one retry on 409). */
export function useApplySeo(websiteId: string, pageId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recs: Recommendation[]) => {
      const attempt = async () => {
        const page = await api.pages.get(pageId);
        const doc = page.document;
        const seo: PageSeo = { ...(doc.seo ?? {}) };
        for (const r of recs) {
          const f = resolveField(r.field);
          if (f) (seo as Record<string, unknown>)[f] = coerce(f, r.suggested);
        }
        return api.pages.update(pageId, { document: { ...doc, seo }, revision: page.revision });
      };
      try {
        return await attempt();
      } catch (err) {
        // Someone saved the page between our read and write: re-read once and retry.
        if (err instanceof AtriumApiError && err.isConflict) return attempt();
        throw err;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.seo(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.page(pageId) });
      void qc.invalidateQueries({ queryKey: qk.pages(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.isConflict) toast.error('This page is being edited', { description: 'It changed while we were applying suggestions. Try again in a moment.' });
      else toast.error('Could not apply suggestion', { description: err instanceof Error ? err.message : undefined });
    },
  });
}

export function AiSuggestionsDialog({ websiteId, page, open, onOpenChange }: { websiteId: string; page: { pageId: string; title: string; slug: string } | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const api = useApi();
  const { can } = useSession();
  const canEdit = can('page.update', websiteId);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [busyRow, setBusyRow] = useState<number | 'all' | null>(null);
  const pageId = page?.pageId ?? '';
  const gen = useMutation({ mutationFn: () => api.ai.seo(websiteId, pageId) });
  const apply = useApplySeo(websiteId, pageId);
  const requested = useRef<string | null>(null);

  // Generate once per page per open; results stay until the dialog closes.
  useEffect(() => {
    if (open && page && requested.current !== page.pageId) {
      requested.current = page.pageId;
      setApplied(new Set());
      gen.reset();
      gen.mutate();
    }
    if (!open) requested.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page?.pageId]);

  const recs: Recommendation[] = Array.isArray(gen.data?.recommendations) ? gen.data.recommendations : [];
  const applicable = recs.map((r, i) => ({ r, i, field: resolveField(r.field) })).filter((x) => x.field && !applied.has(x.i));

  const applyRows = async (rows: Array<{ r: Recommendation; i: number }>, key: number | 'all') => {
    setBusyRow(key);
    try {
      await apply.mutateAsync(rows.map((x) => x.r));
      setApplied((s) => new Set([...s, ...rows.map((x) => x.i)]));
      toast.success(rows.length === 1 ? 'Suggestion applied' : `${rows.length} suggestions applied`);
    } catch {
      /* toasted in onError */
    } finally {
      setBusyRow(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title="AI suggestions"
          description={
            page ? (
              <>
                Recommendations for <span className="font-medium text-fg">{page.title}</span> <span className="font-mono text-xs">/{page.slug}</span>
              </>
            ) : undefined
          }
        />
        <DialogBody className="p-0">
          {gen.isPending || gen.isIdle ? (
            <div className="divide-y divide-border" aria-busy>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 px-5 py-4">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
              <p className="flex items-center gap-2 px-5 py-3 text-xs text-fg-muted">
                <Sparkles className="size-3.5 text-accent" strokeWidth={1.5} />
                Analyzing page content…
              </p>
            </div>
          ) : gen.isError ? (
            <ErrorState title="Could not generate suggestions" description={gen.error.message} onRetry={() => gen.mutate()} />
          ) : recs.length === 0 ? (
            <EmptyState compact icon={<Check />} title="Nothing to improve" description="The AI found no SEO changes worth making on this page." />
          ) : (
            <ul className="divide-y divide-border">
              {recs.map((r, i) => {
                const field = resolveField(r.field);
                const done = applied.has(i);
                return (
                  <li key={i} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0 space-y-2">
                      <Badge tone="outline" className="font-mono">
                        {field ? FIELD_LABEL[field] : r.field}
                      </Badge>
                      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                        <dt className="text-xs text-fg-subtle">Current</dt>
                        <dd className="min-w-0 break-words text-fg-muted">{r.current?.trim() ? r.current : <span className="italic text-fg-subtle">Not set</span>}</dd>
                        <dt className="text-xs text-fg-subtle">Suggested</dt>
                        <dd className="min-w-0 break-words text-fg">{r.suggested}</dd>
                      </dl>
                      {r.reason && <p className="text-xs text-fg-muted">{r.reason}</p>}
                    </div>
                    <div className="flex items-start sm:justify-end">
                      {done ? (
                        <span className="inline-flex h-7 items-center gap-1 text-xs font-medium text-success">
                          <Check className="size-3.5" strokeWidth={2} /> Applied
                        </span>
                      ) : field ? (
                        <Button size="sm" onClick={() => void applyRows([{ r, i }], i)} loading={busyRow === i} disabled={!canEdit || busyRow !== null}>
                          Apply
                        </Button>
                      ) : (
                        <Tooltip content="This change needs to be made in the editor">
                          <Button size="sm" variant="ghost" leadingIcon={<PenTool />} asChild>
                            <Link href={`/w/${websiteId}/editor?page=${encodeURIComponent(pageId)}`}>Open editor</Link>
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!canEdit && recs.length > 0 && (
            <div className="px-5 pb-4">
              <Banner tone="neutral">You need the page.update permission to apply suggestions.</Banner>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" leadingIcon={<RefreshCw />} onClick={() => { setApplied(new Set()); gen.mutate(); }} disabled={gen.isPending || busyRow !== null} className="mr-auto">
            Regenerate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" variant="primary" onClick={() => void applyRows(applicable.map(({ r, i }) => ({ r, i })), 'all')} loading={busyRow === 'all'} disabled={!canEdit || applicable.length === 0 || busyRow !== null}>
            Apply all{applicable.length > 0 ? ` (${applicable.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
