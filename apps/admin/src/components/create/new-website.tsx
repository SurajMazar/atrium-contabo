'use client';

import { AtriumApiError, type Template } from '@atrium/sdk';
import { slugify } from '@atrium/schema';
import {
  Badge,
  Button,
  ChoiceChips,
  cn,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Skeleton,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FileUp, LayoutTemplate, Square, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Forbidden } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

type Method = 'template' | 'blank' | 'import';

export function NewWebsite({ initialMethod }: { initialMethod: Method | null }) {
  const { currentOrg, can } = useSession();
  const [method, setMethod] = useState<Method | null>(initialMethod);
  const [template, setTemplate] = useState<Template | null>(null);

  if (!currentOrg) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState title="Create an organization first" description="Websites belong to an organization." action={<Button asChild size="sm" variant="primary"><Link href="/onboarding">Get started</Link></Button>} />
      </div>
    );
  }
  if (!can('website.create')) return <div className="py-16"><Forbidden permission="website.create" /></div>;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {method === null ? (
        <MethodPicker onPick={setMethod} />
      ) : method === 'template' && !template ? (
        <TemplateGallery onBack={() => setMethod(null)} onPick={setTemplate} onBlank={() => setMethod('blank')} />
      ) : method === 'import' ? (
        <ImportWebsite orgId={currentOrg.id} onBack={() => setMethod(null)} />
      ) : (
        <NameStep orgId={currentOrg.id} template={template} onBack={() => (template ? setTemplate(null) : setMethod(null))} />
      )}
    </div>
  );
}

function MethodPicker({ onPick }: { onPick: (m: Method) => void }) {
  const { can } = useSession();
  const options: Array<{ key: 'ai' | Method; icon: typeof Sparkles; title: string; description: string; href?: string; disabled?: boolean }> = [
    { key: 'ai', icon: Sparkles, title: 'Generate with AI', description: 'Describe your business. Atrium plans the pages, writes the copy and builds a design system you can refine.', href: '/w/new/ai', disabled: !can('ai.use') },
    { key: 'template', icon: LayoutTemplate, title: 'Start from a template', description: 'Pick a professionally designed blueprint and make it yours.' },
    { key: 'blank', icon: Square, title: 'Blank website', description: 'Start with an empty homepage, default header and footer.' },
  ];
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Create a website</h1>
      <p className="mt-1 text-sm text-fg-muted">Choose how you’d like to start. You can change everything later.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {options.map((o) => {
          const inner = (
            <>
              <span className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted">
                <o.icon className="size-4" strokeWidth={1.5} />
              </span>
              <span className="mt-4 block text-sm font-medium text-fg">{o.title}</span>
              <span className="mt-1 block text-sm text-fg-muted">{o.description}</span>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-fg-muted group-hover:text-fg">
                Continue <ArrowRight className="size-3.5" strokeWidth={1.5} />
              </span>
            </>
          );
          const cls = cn(
            'group flex flex-col rounded-lg border border-border bg-surface p-4 text-left outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring',
            o.disabled && 'pointer-events-none opacity-50',
          );
          return o.href ? (
            <Link key={o.key} href={o.href} className={cls} aria-disabled={o.disabled}>
              {inner}
            </Link>
          ) : (
            <button key={o.key} type="button" className={cls} onClick={() => o.key !== 'ai' && onPick(o.key)}>
              {inner}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onPick('import')} className="mt-4 inline-flex items-center gap-1.5 text-sm text-fg-muted outline-none hover:text-fg focus-visible:underline">
        <FileUp className="size-3.5" strokeWidth={1.5} />
        Import an exported website (.json or .zip)
      </button>
    </div>
  );
}

function TemplateGallery({ onBack, onPick, onBlank }: { onBack: () => void; onPick: (t: Template) => void; onBlank: () => void }) {
  const api = useApi();
  const { currentOrg } = useSession();
  const [category, setCategory] = useState<string>('all');
  const [preview, setPreview] = useState<Template | null>(null);
  const q = useQuery({ queryKey: qk.templates('SITE', currentOrg?.id), queryFn: () => api.templates.list({ kind: 'SITE', organizationId: currentOrg?.id }) });
  const categories = useMemo(() => Array.from(new Set((q.data ?? []).map((t) => t.category).filter(Boolean) as string[])).sort(), [q.data]);
  const list = (q.data ?? []).filter((t) => category === 'all' || t.category === category);

  return (
    <div>
      <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft />} onClick={onBack} className="-ml-2 mb-3">
        Back
      </Button>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Choose a template</h1>
      <p className="mt-1 text-sm text-fg-muted">Every template is fully editable: pages, theme, content and forms.</p>
      {categories.length > 1 && (
        <ChoiceChips className="mt-4" value={category} onChange={(v) => setCategory(v as string)} options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]} />
      )}
      <div className="mt-5">
        {q.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border">
                <Skeleton className="aspect-[4/3] rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<LayoutTemplate />} title="No templates available" description="Your platform has no site templates yet. Start from a blank website instead." action={<Button size="sm" variant="primary" onClick={onBlank}>Start blank</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <div key={t.id} className="group overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
                <button type="button" onClick={() => setPreview(t)} className="block aspect-[4/3] w-full overflow-hidden border-b border-border bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Preview ${t.name}`}>
                  {t.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.01]" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-sm text-fg-subtle">{t.name}</span>
                  )}
                </button>
                <div className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                      {t.organizationId && <Badge size="xs">Yours</Badge>}
                    </div>
                    {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{t.description}</p>}
                  </div>
                  <Button size="xs" variant="secondary" onClick={() => onPick(t)}>
                    Use
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent size="xl">
          {preview && (
            <>
              <DialogHeader title={preview.name} description={preview.description ?? preview.category ?? undefined} />
              <DialogBody className="bg-surface-2 p-0">
                {preview.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.thumbnailUrl} alt={`${preview.name} preview`} className="w-full" />
                ) : (
                  <p className="p-10 text-center text-sm text-fg-muted">No preview image for this template.</p>
                )}
              </DialogBody>
              <DialogFooter>
                {preview.tags.length > 0 && <div className="mr-auto flex flex-wrap gap-1">{preview.tags.slice(0, 5).map((t) => <Badge key={t}>{t}</Badge>)}</div>}
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onPick(preview);
                    setPreview(null);
                  }}
                >
                  Use this template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NameStep({ orgId, template, onBack }: { orgId: string; template: Template | null; onBack: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  const create = useMutation({
    mutationFn: () =>
      api.websites.create(orgId, {
        name: name.trim(),
        slug: effectiveSlug || undefined,
        source: template ? { type: 'template', templateKey: template.key ?? template.id } : { type: 'blank' },
      }),
    onSuccess: (w) => {
      void qc.invalidateQueries({ queryKey: qk.websites(orgId) });
      qc.setQueryData(qk.website(w.id), w);
      toast.success(`${w.name} created`);
      router.push(`/w/${w.id}/editor`);
    },
    onError: (e) => {
      if (e instanceof AtriumApiError && (e.isConflict || e.isValidation)) setSlugError(e.isConflict ? 'This address is taken. Try another.' : e.message);
      else toast.error(e instanceof Error ? e.message : 'Could not create website');
    },
  });

  return (
    <div className="mx-auto max-w-md">
      <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft />} onClick={onBack} className="-ml-2 mb-3">
        Back
      </Button>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Name your website</h1>
      <p className="mt-1 text-sm text-fg-muted">{template ? `Starting from “${template.name}”.` : 'Starting from a blank website.'}</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (effectiveSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effectiveSlug)) return setSlugError('Use lowercase letters, numbers and hyphens');
          setSlugError(null);
          create.mutate();
        }}
      >
        <Field label="Website name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Lakeside Retreat" maxLength={120} />
        </Field>
        <Field label="Address" help="Used for your platform address until you connect a domain. You can change it later." error={slugError}>
          <Input
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
            }}
            className="font-mono"
            placeholder="lakeside-retreat"
          />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={create.isPending} disabled={!name.trim()}>
          Create website
        </Button>
      </form>
    </div>
  );
}

function ImportWebsite({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const imp = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      if (name.trim()) fd.append('name', name.trim());
      return api.websites.import(orgId, fd);
    },
    onSuccess: (w) => {
      void qc.invalidateQueries({ queryKey: qk.websites(orgId) });
      toast.success(`Imported ${w.name}`);
      router.push(`/w/${w.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Import failed'),
  });
  return (
    <div className="mx-auto max-w-md">
      <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft />} onClick={onBack} className="-ml-2 mb-3">
        Back
      </Button>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Import a website</h1>
      <p className="mt-1 text-sm text-fg-muted">Upload a <span className="font-mono text-xs">site.json</span> or a full export <span className="font-mono text-xs">.zip</span>. A new website is created; nothing is overwritten.</p>
      <div className="mt-6 space-y-4">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-8 text-sm outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileUp className="size-4 text-fg-muted" strokeWidth={1.5} />
          <span className="font-medium text-fg">{file ? file.name : 'Choose a file'}</span>
          <span className="text-xs text-fg-muted">.json or .zip</span>
        </button>
        <input ref={ref} type="file" hidden accept=".json,.zip,application/json,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Field label="Name" optional help="Defaults to the name in the export.">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button variant="primary" className="w-full" disabled={!file} loading={imp.isPending} onClick={() => imp.mutate()}>
          Import
        </Button>
      </div>
    </div>
  );
}
