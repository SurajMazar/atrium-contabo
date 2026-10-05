'use client';

import { slugify } from '@atrium/schema';
import type { PageWithDocument, Template } from '@atrium/sdk';
import { Button, cn, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, ErrorState, Field, Input, Skeleton, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, FilePlus2, PenTool } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export const SLUG_RE = /^$|^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Lowercase, hyphenate and keep `/` separators so nested paths survive. */
export function normalizeSlugInput(v: string) {
  return v
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9/-]/g, '')
    .replace(/\/{2,}/g, '/');
}

export function validateSlug(slug: string, taken: string[], opts: { allowEmpty?: boolean } = {}): string | null {
  if (!slug && !opts.allowEmpty) return 'Enter a URL slug';
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, numbers and single hyphens; separate segments with /';
  if (slug.length > 200) return 'Keep the slug under 200 characters';
  if (taken.includes(slug)) return `A page already exists at /${slug}`;
  return null;
}

export function CreatePageDialog({
  open,
  onOpenChange,
  websiteId,
  organizationId,
  takenSlugs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  websiteId: string;
  organizationId: string | undefined;
  takenSlugs: string[];
}) {
  const api = useApi();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<PageWithDocument | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setSlug('');
      setSlugTouched(false);
      setTemplateId(null);
      setSubmitted(false);
      setCreated(null);
    }
  }, [open]);

  const templates = useQuery({
    queryKey: qk.templates('PAGE', organizationId),
    queryFn: () => api.templates.list({ kind: 'PAGE', organizationId }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const effectiveSlug = slugTouched ? slug : slugify(title);
  const slugError = validateSlug(effectiveSlug, takenSlugs);
  const titleError = title.trim() ? null : 'Enter a page title';

  const create = useMutation({
    mutationFn: () => api.pages.create(websiteId, { title: title.trim(), slug: effectiveSlug, templateId: templateId ?? undefined }),
    onSuccess: (page) => {
      setCreated(page);
      toast.success('Page created', { description: `/${page.slug}` });
      void qc.invalidateQueries({ queryKey: qk.pages(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
    },
    onError: (err) => toast.error('Could not create page', { description: errorMessage(err) }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (titleError || slugError) return;
    create.mutate();
  };

  const grouped = useMemo(() => {
    const list = templates.data ?? [];
    const map = new Map<string, Template[]>();
    for (const t of list) {
      const c = t.category ?? 'Other';
      map.set(c, [...(map.get(c) ?? []), t]);
    }
    return [...map.entries()];
  }, [templates.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {created ? (
          <>
            <DialogHeader title="Page created" />
            <DialogBody>
              <div className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{created.title}</p>
                  <p className="font-mono text-xs text-fg-muted">/{created.slug}</p>
                  <p className="mt-2 text-sm text-fg-muted">The page is a draft. It goes live the next time you publish the website.</p>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  Done
                </Button>
              </DialogClose>
              <Button size="sm" variant="primary" asChild autoFocus>
                <Link href={`/w/${websiteId}/editor?page=${created.id}`}>
                  <PenTool />
                  Open in editor
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents" noValidate>
            <DialogHeader title="New page" description="Pages are created as drafts." />
            <DialogBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title" required error={submitted ? titleError : null}>
                  <Input autoFocus value={title} placeholder="About us" maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="URL" required error={effectiveSlug || submitted || slugTouched ? slugError : null} help={!slugError ? 'Derived from the title until you edit it.' : undefined}>
                  <Input
                    prefix={<span className="font-mono text-xs">/</span>}
                    className="font-mono"
                    value={effectiveSlug}
                    placeholder="about-us"
                    spellCheck={false}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(normalizeSlugInput(e.target.value));
                    }}
                  />
                </Field>
              </div>

              <div>
                <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Start from</div>
                <div role="radiogroup" aria-label="Start from" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <TemplateCard selected={templateId === null} onSelect={() => setTemplateId(null)} name="Blank page" category="Empty canvas" />
                  {templates.isPending &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="overflow-hidden rounded-md border border-border">
                        <Skeleton className="aspect-[16/10] rounded-none" />
                        <div className="space-y-1.5 p-2">
                          <Skeleton className="h-3 w-2/3" />
                          <Skeleton className="h-2.5 w-1/3" />
                        </div>
                      </div>
                    ))}
                  {grouped.flatMap(([, list]) =>
                    list.map((t) => <TemplateCard key={t.id} selected={templateId === t.id} onSelect={() => setTemplateId(t.id)} name={t.name} category={t.category} thumbnailUrl={t.thumbnailUrl} description={t.description} />),
                  )}
                </div>
                {templates.isError && <ErrorState title="Could not load templates" description="You can still create a blank page." onRetry={() => void templates.refetch()} className="py-6" />}
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" variant="primary" type="submit" loading={create.isPending}>
                Create page
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ selected, onSelect, name, category, thumbnailUrl, description }: { selected: boolean; onSelect: () => void; name: string; category?: string | null; thumbnailUrl?: string | null; description?: string | null }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={description ?? undefined}
      className={cn(
        'group relative overflow-hidden rounded-md border bg-surface text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-surface-2">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" loading="lazy" className="size-full object-cover object-top" />
        ) : (
          <div className="flex size-full items-center justify-center text-fg-subtle">
            <FilePlus2 className="size-5" strokeWidth={1.25} />
          </div>
        )}
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg">
            <Check className="size-3" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-sm font-medium text-fg">{name}</div>
        <div className="truncate text-xs text-fg-muted">{category ?? 'Template'}</div>
      </div>
    </button>
  );
}
