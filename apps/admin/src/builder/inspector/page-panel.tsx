'use client';

import { analyzePageSeo } from '@atrium/builder-core';
import { slugify, StructuredDataTypeSchema, type PageDocument, type PageSeo } from '@atrium/schema';
import { AlertTriangle, CheckCircle2, ExternalLink, History, ImageIcon, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { editPage, updatePage } from '../actions';
import { cn } from '../lib/cn';
import { useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { requestMedia, useUiStore } from '../store/ui';
import { Badge, Btn, CommitInput, Group, NativeSelect, PanelHeader, Row, Segmented, Switch } from '../ui/primitives';

const SD_TYPES = StructuredDataTypeSchema.options;

function Counter({ value, min, max }: { value: number; min: number; max: number }) {
  const tone = value === 0 ? 'text-fg-subtle' : value < min || value > max ? 'text-warning' : 'text-success';
  return <span className={cn('font-mono text-[11px]', tone)}>{value}/{max}</span>;
}

export function PagePanel() {
  const page = useDocumentStore((s) => s.definition?.pages.find((p) => p.id === s.pageId));
  const definition = useDocumentStore((s) => s.definition);
  const perms = usePerms();
  if (!page || !definition) return <div className="p-4 text-xs text-fg-muted">No page selected.</div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {page.title}
            {page.isHomepage && <Badge tone="accent">Home</Badge>}
          </span>
        }
        actions={
          <Btn size="xs" variant="ghost" icon={<History className="size-3.5" />} onClick={() => useUiStore.setState({ historyOpen: true })}>
            Versions
          </Btn>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PageSettings page={page} disabled={!perms.edit} />
        <SeoSettings page={page} disabled={!perms.edit} />
        <SeoScore page={page} />
        {perms.code && <PageCode page={page} disabled={!perms.edit} />}
        {!perms.code && <p className="px-3 py-3 text-[11px] text-fg-subtle">Page custom CSS and scripts require the “Add custom code” permission.</p>}
        <p className="px-3 py-3 text-[11px] text-fg-subtle">Select an element on the canvas to edit it.</p>
      </div>
    </div>
  );
}

function PageSettings({ page, disabled }: { page: PageDocument; disabled: boolean }) {
  const [slugError, setSlugError] = useState<string | null>(null);
  return (
    <Group id="page-settings" title="Page">
      <Row label="Title">
        <CommitInput value={page.title} disabled={disabled} onCommit={(title) => title.trim() && updatePage(page.id, { title: title.trim() }, { label: 'Rename page' })} />
      </Row>
      <Row label="URL" help={page.isHomepage ? 'The homepage is always served at /' : undefined}>
        <div className="space-y-1">
          <div className="flex items-center">
            <span className="mr-1 text-xs text-fg-subtle">/</span>
            <CommitInput
              value={page.slug}
              mono
              disabled={disabled || page.isHomepage}
              placeholder={page.isHomepage ? '(homepage)' : 'page-url'}
              onCommit={(raw) => {
                const slug = raw.split('/').map((s) => slugify(s)).filter(Boolean).join('/');
                if (!slug) return setSlugError('Enter a URL');
                setSlugError(null);
                if (slug !== page.slug) updatePage(page.id, { slug }, { label: 'Change page URL' });
              }}
            />
          </div>
          {slugError && <p className="text-[11px] text-danger">{slugError}</p>}
        </div>
      </Row>
      <Row label="Status">
        <NativeSelect value={page.status} disabled={disabled} onChange={(status) => updatePage(page.id, { status: status as PageDocument['status'] }, { label: 'Change page status' })} options={['draft', 'published', 'scheduled', 'archived'].map((s) => ({ label: s[0]!.toUpperCase() + s.slice(1), value: s }))} />
      </Row>
      <Row label="Header">
        <Segmented value={page.layout.header} disabled={disabled} onChange={(header) => updatePage(page.id, { layout: { header } }, { label: 'Change header layout' })} options={[{ label: 'Default', value: 'default' }, { label: 'Overlay', value: 'transparent' }, { label: 'Hidden', value: 'hidden' }]} />
      </Row>
      <Row label="Footer">
        <Segmented value={page.layout.footer} disabled={disabled} onChange={(footer) => updatePage(page.id, { layout: { footer } }, { label: 'Change footer layout' })} options={[{ label: 'Default', value: 'default' }, { label: 'Hidden', value: 'hidden' }]} />
      </Row>
    </Group>
  );
}

function SeoSettings({ page, disabled }: { page: PageDocument; disabled: boolean }) {
  const seo = page.seo;
  const setSeo = (patch: Partial<PageSeo>, key: string) =>
    editPage(page.id, 'Edit page SEO', (p) => {
      const next = { ...p.seo, ...patch } as Record<string, unknown>;
      for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
      p.seo = next as PageSeo;
    }, { mergeKey: `seo:${page.id}:${key}` });
  const robots = seo.robots ?? { index: true, follow: true };
  const sd = new Set((seo.structuredData ?? []).map((s) => s.type));

  return (
    <Group id="page-seo" title="SEO & social">
      <Row label="Meta title" stacked actions={<Counter value={(seo.title ?? '').length} min={15} max={65} />}>
        <CommitInput value={seo.title ?? ''} placeholder={page.title} disabled={disabled} onCommit={(title) => setSeo({ title: title || undefined }, 'title')} />
      </Row>
      <Row label="Meta description" stacked actions={<Counter value={(seo.description ?? '').length} min={70} max={160} />}>
        <CommitInput multiline rows={3} value={seo.description ?? ''} placeholder="Summarize the page in 120–160 characters" disabled={disabled} onCommit={(description) => setSeo({ description: description || undefined }, 'description')} />
      </Row>
      <SearchPreview page={page} />
      <Row label="Canonical URL" stacked>
        <CommitInput value={seo.canonical ?? ''} placeholder="https://example.com/page" disabled={disabled} onCommit={(canonical) => setSeo({ canonical: canonical || undefined }, 'canonical')} />
      </Row>
      <Row label="Social title" stacked>
        <CommitInput value={seo.ogTitle ?? ''} placeholder={seo.title ?? page.title} disabled={disabled} onCommit={(ogTitle) => setSeo({ ogTitle: ogTitle || undefined }, 'ogTitle')} />
      </Row>
      <Row label="Social description" stacked>
        <CommitInput multiline rows={2} value={seo.ogDescription ?? ''} placeholder={seo.description} disabled={disabled} onCommit={(ogDescription) => setSeo({ ogDescription: ogDescription || undefined }, 'ogDescription')} />
      </Row>
      <Row label="Social image" stacked>
        {seo.ogImage ? (
          <div className="relative overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={seo.ogImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
            <div className="absolute bottom-1 right-1 flex gap-1">
              <Btn size="xs" variant="secondary" disabled={disabled} onClick={() => requestMedia({ kind: 'image', onSelect: ([m]) => m && setSeo({ ogImage: m.url }, 'og') })}>Replace</Btn>
              <Btn size="xs" variant="secondary" disabled={disabled} onClick={() => setSeo({ ogImage: undefined }, 'og')}>Remove</Btn>
            </div>
          </div>
        ) : (
          <Btn size="sm" variant="secondary" className="w-full" disabled={disabled} icon={<ImageIcon className="size-3.5" />} onClick={() => requestMedia({ kind: 'image', onSelect: ([m]) => m && setSeo({ ogImage: m.url }, 'og') })}>
            Choose image (1200×630)
          </Btn>
        )}
      </Row>
      <Row label="Twitter card">
        <NativeSelect value={seo.twitterCard} placeholder="Site default" disabled={disabled} onChange={(v) => setSeo({ twitterCard: (v || undefined) as PageSeo['twitterCard'] }, 'twitter')} options={[{ label: 'Summary', value: 'summary' }, { label: 'Large image', value: 'summary_large_image' }]} />
      </Row>
      <Row label="Index page" className="grid-cols-[minmax(0,1fr)_auto]">
        <Switch checked={robots.index} disabled={disabled} onChange={(index) => setSeo({ robots: { ...robots, index } }, 'robots')} />
      </Row>
      <Row label="Follow links" className="grid-cols-[minmax(0,1fr)_auto]">
        <Switch checked={robots.follow} disabled={disabled} onChange={(follow) => setSeo({ robots: { ...robots, follow } }, 'robots')} />
      </Row>
      <Row label="Exclude from sitemap" className="grid-cols-[minmax(0,1fr)_auto]">
        <Switch checked={!!seo.excludeFromSitemap} disabled={disabled} onChange={(v) => setSeo({ excludeFromSitemap: v || undefined }, 'sitemap')} />
      </Row>
      <Row label="Structured data" stacked help="Auto-generated from your business details and page content.">
        <div className="flex flex-wrap gap-1">
          {SD_TYPES.filter((t) => t !== 'Custom').map((t) => {
            const on = sd.has(t);
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const list = (seo.structuredData ?? []).filter((x) => x.type !== t);
                  setSeo({ structuredData: on ? (list.length ? list : undefined) : [...list, { type: t, auto: true }] }, 'sd');
                }}
                className={cn('h-6 rounded-md border px-1.5 text-[11px]', on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-fg-muted hover:bg-surface-2')}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Row>
    </Group>
  );
}

function SearchPreview({ page }: { page: PageDocument }) {
  const site = useDocumentStore((s) => s.definition?.settings.seo);
  const title = (site?.titleTemplate ?? '%s').replace('%s', page.seo.title ?? page.title).replace('{site}', site?.siteTitle ?? '');
  return (
    <div className="rounded-md border border-border bg-surface-2 p-2">
      <p className="truncate text-[11px] text-fg-subtle">{(site?.canonicalBase ?? 'https://your-site.com').replace(/\/$/, '')}/{page.slug}</p>
      <p className="truncate text-[13px] text-[#1a0dab] dark:text-[#8ab4f8]">{title}</p>
      <p className="line-clamp-2 text-[11px] leading-4 text-fg-muted">{page.seo.description || site?.description || 'Add a meta description to control how this page appears in search results.'}</p>
    </div>
  );
}

export function SeoScore({ page }: { page: PageDocument }) {
  const definition = useDocumentStore((s) => s.definition);
  const report = useMemo(() => (definition ? analyzePageSeo(page, definition) : null), [page, definition]);
  if (!report) return null;
  const tone = report.score >= 80 ? 'success' : report.score >= 50 ? 'warning' : 'danger';
  return (
    <Group id="page-seo-score" title={<span className="flex items-center gap-2">SEO score <Badge tone={tone}>{report.score}</Badge></span>}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-danger')} style={{ width: `${report.score}%` }} />
      </div>
      <ul className="space-y-1.5">
        {report.checks.map((c) => (
          <li key={c.id} className="flex gap-2 text-xs">
            {c.status === 'pass' ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> : c.status === 'warn' ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" />}
            <span className="min-w-0">
              <span className="text-fg">{c.label}</span>
              {c.detail && <span className="block text-[11px] leading-4 text-fg-muted">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Group>
  );
}

function PageCode({ page, disabled }: { page: PageDocument; disabled: boolean }) {
  return (
    <Group id="page-code" title="Custom code" defaultOpen={!!(page.customCss || page.scripts?.head || page.scripts?.body)}>
      <Row label="Page CSS" stacked>
        <CommitInput multiline mono rows={5} value={page.customCss ?? ''} disabled={disabled} placeholder=".my-class { … }" onCommit={(customCss) => updatePage(page.id, { customCss }, { label: 'Edit page CSS' })} />
      </Row>
      <Row label="Head scripts" stacked>
        <CommitInput multiline mono rows={3} value={page.scripts?.head ?? ''} disabled={disabled} placeholder="<script>…</script>" onCommit={(head) => editPage(page.id, 'Edit page scripts', (p) => void (p.scripts = { ...p.scripts, head: head || undefined }))} />
      </Row>
      <Row label="Body scripts" stacked>
        <CommitInput multiline mono rows={3} value={page.scripts?.body ?? ''} disabled={disabled} placeholder="<script>…</script>" onCommit={(body) => editPage(page.id, 'Edit page scripts', (p) => void (p.scripts = { ...p.scripts, body: body || undefined }))} />
      </Row>
      <a href="https://developer.mozilla.org/docs/Web/HTML/Element/script" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
        Scripts run only on the published site <ExternalLink className="size-3" />
      </a>
    </Group>
  );
}
