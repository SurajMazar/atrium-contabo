'use client';

import type { SiteSeo, WebsiteDefinition } from '@atrium/schema';
import { Banner, ErrorState, Field, FieldGroup, Input, Skeleton, Switch, Textarea } from '@atrium/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { MediaField } from '@/components/media/media-field';
import { SaveBar, useBeforeUnload } from '@/components/settings/save-bar';
import { isUrl, opt, useSettingsForm, type FormErrors } from '@/components/settings/use-settings-form';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { applyTitleTemplate, SearchPreview } from './search-preview';
import { jsonError, StructuredDataEditor, type StructuredDataRow } from './structured-data-editor';

interface SeoForm {
  siteTitle: string;
  titleTemplate: string;
  description: string;
  ogImage: string;
  index: boolean;
  follow: boolean;
  canonicalBase: string;
  twitterHandle: string;
  google: string;
  bing: string;
  structuredData: StructuredDataRow[];
}

function read(def: WebsiteDefinition): SeoForm {
  const s = (def.settings?.seo ?? {}) as Partial<SiteSeo>;
  return {
    siteTitle: s.siteTitle ?? def.settings?.name ?? '',
    titleTemplate: s.titleTemplate ?? '%s — {site}',
    description: s.description ?? '',
    ogImage: s.ogImage ?? '',
    index: s.robots?.index ?? true,
    follow: s.robots?.follow ?? true,
    canonicalBase: s.canonicalBase ?? '',
    twitterHandle: (s.twitterHandle ?? '').replace(/^@/, ''),
    google: s.verification?.google ?? '',
    bing: s.verification?.bing ?? '',
    structuredData: (s.structuredData ?? []).map((d, i) => ({ key: `sd-${i}-${d.type}`, type: d.type, auto: d.auto ?? true, json: d.data && Object.keys(d.data).length ? JSON.stringify(d.data, null, 2) : '' })),
  };
}

function write(def: WebsiteDefinition, f: SeoForm) {
  const seo: SiteSeo = {
    ...(def.settings.seo ?? {}),
    siteTitle: f.siteTitle.trim(),
    titleTemplate: f.titleTemplate.trim() || '%s — {site}',
    description: f.description.trim(),
    ogImage: opt(f.ogImage),
    robots: { index: f.index, follow: f.follow },
    canonicalBase: opt(f.canonicalBase)?.replace(/\/+$/, ''),
    twitterHandle: opt(f.twitterHandle) ? `@${f.twitterHandle.trim().replace(/^@/, '')}` : undefined,
    verification: { google: opt(f.google), bing: opt(f.bing) },
    structuredData: f.structuredData.map((r) => ({ type: r.type, auto: r.auto, ...(r.json.trim() ? { data: JSON.parse(r.json) as Record<string, unknown> } : {}) })),
  };
  return { settings: { ...def.settings, seo } };
}

function validate(f: SeoForm): FormErrors {
  const e: FormErrors = {};
  if (!f.siteTitle.trim()) e.siteTitle = 'Site title is required';
  if (f.titleTemplate.trim() && !f.titleTemplate.includes('%s')) e.titleTemplate = 'Include %s where the page title should go';
  if (f.canonicalBase.trim() && !isUrl(f.canonicalBase)) e.canonicalBase = 'Enter a full URL, e.g. https://example.com';
  if (f.twitterHandle.trim() && !/^@?[A-Za-z0-9_]{1,15}$/.test(f.twitterHandle.trim())) e.twitterHandle = 'Letters, numbers and underscores, up to 15 characters';
  f.structuredData.forEach((r) => {
    const err = jsonError(r.json);
    if (err) e[`sd.${r.key}`] = err;
  });
  return e;
}

function descriptionHint(len: number) {
  const tone = len === 0 ? 'text-fg-subtle' : len < 120 || len > 160 ? 'text-warning' : 'text-success';
  return (
    <span className={`tabular-nums ${tone}`} aria-live="polite">
      {len} / 160
    </span>
  );
}

export function SiteSeoForm({ websiteId }: { websiteId: string }) {
  const { can } = useSession();
  const { organizationId, website } = useWebsite();
  // Site defaults live in the site settings document (PUT /draft/site requires website.update).
  const canEdit = can('website.update', websiteId);
  const qc = useQueryClient();
  // Page scores depend on site defaults (canonical, OG image, structured data).
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'SEO defaults saved', onSaved: () => void qc.invalidateQueries({ queryKey: qk.seo(websiteId) }) });
  useBeforeUnload(f.dirty);

  if (f.isPending) return <FormSkeleton />;
  if (f.isError || !f.form || !f.draft) return <ErrorState description={f.error?.message} onRetry={f.refetch} />;

  const v = f.form;
  const def = f.draft.definition;
  const home = def.pages?.find((p) => p.isHomepage) ?? def.pages?.[0];
  const sampleTitle = home?.seo?.title || home?.title || 'Home';
  const exampleTitle = applyTitleTemplate(v.titleTemplate, 'About', v.siteTitle);
  const previewTitle = home?.seo?.title ? home.seo.title : applyTitleTemplate(v.titleTemplate, sampleTitle, v.siteTitle);
  const previewUrl = v.canonicalBase.trim() && isUrl(v.canonicalBase) ? v.canonicalBase : (website?.primaryDomain ? `https://${website.primaryDomain}` : website?.platformUrl) ?? 'https://example.com';
  const dis = !canEdit;

  return (
    <div>
      {!canEdit && (
        <Banner tone="neutral" icon={<Lock />} className="mb-4">
          Site-wide SEO defaults are part of the website settings. You need the <code className="font-mono text-xs">website.update</code> permission to change them.
        </Banner>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <FieldGroup title="Titles and description" description="Used on every page that doesn’t set its own.">
            <div className="space-y-4">
              <Field label="Site title" required error={f.errors.siteTitle}>
                <Input value={v.siteTitle} onChange={(e) => f.patch({ siteTitle: e.target.value })} disabled={dis} placeholder="Harbor House Hotel" />
              </Field>
              <Field
                label="Title template"
                error={f.errors.titleTemplate}
                help={
                  <>
                    <code className="font-mono">%s</code> is the page title, <code className="font-mono">{'{site}'}</code> the site title. Example: <span className="text-fg">{exampleTitle}</span>
                  </>
                }
              >
                <Input value={v.titleTemplate} onChange={(e) => f.patch({ titleTemplate: e.target.value })} disabled={dis} className="font-mono" placeholder="%s — {site}" />
              </Field>
              <Field label="Meta description" hint={descriptionHint(v.description.trim().length)} help="Aim for 120–160 characters that summarize what visitors will find.">
                <Textarea value={v.description} onChange={(e) => f.patch({ description: e.target.value })} disabled={dis} rows={3} maxLength={400} />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Social sharing" description="Default preview when a page is shared on social networks and messaging apps.">
            <div className="space-y-4">
              <Field label="Open Graph image" help="1200 × 630 px works best. Pages can override it.">
                {organizationId ? <MediaField value={v.ogImage} onChange={(url) => f.patch({ ogImage: url ?? '' })} organizationId={organizationId} websiteId={websiteId} disabled={dis} /> : <Skeleton className="h-14 w-24" />}
              </Field>
              <Field label="X (Twitter) handle" optional error={f.errors.twitterHandle}>
                <Input value={v.twitterHandle} onChange={(e) => f.patch({ twitterHandle: e.target.value.replace(/^@/, '') })} disabled={dis} prefix={<span className="text-sm">@</span>} placeholder="harborhouse" className="max-w-xs" />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Indexing" description="Control how search engines crawl the site.">
            <div className="space-y-4">
              <Switch checked={v.index} onCheckedChange={(index) => f.patch({ index })} disabled={dis} label="Allow search engines to index the site" description="Turn off for staging or private sites. Adds noindex to every page." />
              <Switch checked={v.follow} onCheckedChange={(follow) => f.patch({ follow })} disabled={dis} label="Allow search engines to follow links" description="Turn off to add nofollow to every page." />
              {!v.index && (
                <Banner tone="warning">
                  The site will be hidden from search results once published.
                </Banner>
              )}
              <Field label="Canonical base URL" error={f.errors.canonicalBase} help="Used to build canonical links and the sitemap. Usually your primary domain.">
                <Input value={v.canonicalBase} onChange={(e) => f.patch({ canonicalBase: e.target.value })} disabled={dis} placeholder={website?.primaryDomain ? `https://${website.primaryDomain}` : 'https://example.com'} className="font-mono" />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Site verification" description="Verification codes from search consoles. Paste only the content value of the meta tag.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Google Search Console" optional>
                <Input value={v.google} onChange={(e) => f.patch({ google: e.target.value.trim() })} disabled={dis} className="font-mono" placeholder="abc123…" />
              </Field>
              <Field label="Bing Webmaster Tools" optional>
                <Input value={v.bing} onChange={(e) => f.patch({ bing: e.target.value.trim() })} disabled={dis} className="font-mono" placeholder="0123ABCD…" />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Structured data" description="JSON-LD added to every page. Auto types are built from business details in Settings.">
            <StructuredDataEditor value={v.structuredData} onChange={(structuredData) => f.patch({ structuredData })} disabled={dis} />
          </FieldGroup>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <SearchPreview title={previewTitle} description={home?.seo?.description || v.description} url={previewUrl} siteName={v.siteTitle} favicon={def.settings?.branding?.favicon} />
          <p className="px-1 text-xs text-fg-muted">
            Preview of your homepage{home ? <> (<span className="text-fg">{home.title}</span>)</> : null}. Pages with their own meta title or description use those instead.
          </p>
        </div>
      </div>

      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis || f.hasErrors} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-1.5 h-3 w-64" />
            </div>
            <div className="space-y-4 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-36 w-full rounded-lg" />
    </div>
  );
}
