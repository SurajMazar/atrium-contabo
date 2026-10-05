'use client';

import { AtriumApiError, type Website } from '@atrium/sdk';
import type { WebsiteDefinition } from '@atrium/schema';
import { Button, Combobox, CopyField, Field, FieldGroup, Input, RadioGroup, Select, toast } from '@atrium/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { SaveBar, useReportDirty } from './save-bar';
import { ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

export const COMMON_LOCALES: Array<{ value: string; label: string }> = [
  ['en', 'English'], ['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['pt-BR', 'Portuguese (Brazil)'], ['nl', 'Dutch'], ['sv', 'Swedish'], ['da', 'Danish'], ['nb', 'Norwegian'],
  ['fi', 'Finnish'], ['pl', 'Polish'], ['cs', 'Czech'], ['el', 'Greek'], ['tr', 'Turkish'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['ar', 'Arabic'],
  ['he', 'Hebrew'], ['hi', 'Hindi'], ['ne', 'Nepali'], ['bn', 'Bengali'], ['th', 'Thai'], ['vi', 'Vietnamese'], ['id', 'Indonesian'], ['ms', 'Malay'],
  ['zh', 'Chinese'], ['zh-TW', 'Chinese (Traditional)'], ['ja', 'Japanese'], ['ko', 'Korean'],
].map(([value, label]) => ({ value: value!, label: `${label} (${value})` }));

type Strategy = 'prefix-except-default' | 'prefix-all';
interface LocaleForm {
  defaultLocale: string;
  locales: string[];
  strategy: Strategy;
}

function read(def: WebsiteDefinition): LocaleForm {
  const l = def.settings?.localization;
  const defaultLocale = l?.defaultLocale || 'en';
  const locales = Array.isArray(l?.locales) && l.locales.length ? l.locales : [defaultLocale];
  return { defaultLocale, locales, strategy: l?.strategy === 'prefix-all' ? 'prefix-all' : 'prefix-except-default' };
}
function write(def: WebsiteDefinition, f: LocaleForm) {
  const locales = Array.from(new Set([f.defaultLocale, ...f.locales]));
  return { settings: { ...def.settings, localization: { defaultLocale: f.defaultLocale, locales, strategy: f.strategy } } };
}
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

function validateIdentity(name: string, slug: string): FormErrors {
  const e: FormErrors = {};
  if (!name.trim()) e.name = 'Name is required';
  if (!slug.trim()) e.slug = 'Slug is required';
  else if (!SLUG_RE.test(slug) || slug.includes('--')) e.slug = 'Use 3–63 lowercase letters, numbers and single hyphens';
  return e;
}

export function GeneralSection({ websiteId }: { websiteId: string }) {
  const { website } = useWebsite();
  const f = useSettingsForm({ websiteId, read, write });
  return (
    <SectionState isPending={f.isPending || !website} isError={f.isError} error={f.error} onRetry={f.refetch}>
      {() => <GeneralForm websiteId={websiteId} website={website!} f={f} />}
    </SectionState>
  );
}

function GeneralForm({ websiteId, website, f }: { websiteId: string; website: Website; f: SettingsForm<LocaleForm> }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const { organizationId } = useWebsite();
  const canEdit = can('website.update', websiteId);

  // Identity (website record) — separate from the settings document.
  const base = `${website.name}\u0000${website.slug}`;
  const [loaded, setLoaded] = useState(base);
  const [name, setName] = useState(website.name);
  const [slug, setSlug] = useState(website.slug);
  if (base !== loaded) {
    setLoaded(base);
    setName(website.name);
    setSlug(website.slug);
  }
  const [slugServerError, setSlugServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const identityDirty = name !== website.name || slug !== website.slug;
  const idErrors = validateIdentity(name, slug);
  const dirty = identityDirty || f.dirty;
  useReportDirty(dirty);

  const localeOptions = useMemo(() => {
    const known = new Set(COMMON_LOCALES.map((l) => l.value));
    const extra = [...(f.form?.locales ?? []), f.form?.defaultLocale ?? ''].filter((l) => l && !known.has(l)).map((l) => ({ value: l, label: l }));
    return [...COMMON_LOCALES, ...extra];
  }, [f.form?.locales, f.form?.defaultLocale]);

  const v = f.form!;
  const platformHost = (() => {
    try {
      return new URL(website.platformUrl).host;
    } catch {
      return website.platformUrl;
    }
  })();
  const slugPreview = slug && slug !== website.slug ? platformHost.replace(website.slug, slug) : null;

  const save = async () => {
    if (identityDirty && Object.keys(idErrors).length) {
      toast.error('Fix the highlighted fields before saving');
      return;
    }
    setSaving(true);
    try {
      // Settings first: renaming the website also updates the draft (bumping its revision).
      if (f.dirty) {
        const ok = await f.save();
        if (!ok) return;
      }
      if (identityDirty) {
        try {
          const updated = await api.websites.update(websiteId, { name: name.trim(), slug: slug.trim() });
          setSlugServerError(null);
          qc.setQueryData(qk.website(websiteId), (w: Website | undefined) => (w ? { ...w, ...updated } : updated));
          void qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true });
          // The server mirrors the name into the draft settings (new site revision).
          void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
          if (organizationId) void qc.invalidateQueries({ queryKey: qk.websites(organizationId) });
          if (!f.dirty) toast.success('Website updated');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not update website';
          if (err instanceof AtriumApiError && (err.isConflict || /slug/i.test(err.message))) setSlugServerError(err.isConflict ? 'This slug is already taken' : msg);
          toast.error('Could not update website', { description: msg });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setName(website.name);
    setSlug(website.slug);
    setSlugServerError(null);
    f.discard();
  };

  const dis = !canEdit;
  return (
    <div>
      <SectionHeading title="General" description="Name, address and languages for this website." />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <div className="space-y-4">
        <FieldGroup title="Website">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website name" required error={idErrors.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={dis} />
              </Field>
              <Field label="Slug" required error={slugServerError ?? (slug !== website.slug ? idErrors.slug : undefined)} help={slugPreview ? <>New address: <span className="font-mono text-fg">{slugPreview}</span></> : 'Used for the platform subdomain.'}>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                    setSlugServerError(null);
                  }}
                  disabled={dis}
                  className="font-mono"
                  spellCheck={false}
                />
              </Field>
            </div>
            {slug !== website.slug && <p className="text-xs text-warning">Changing the slug changes the platform URL. Links to the old address stop working.</p>}
            <Field label="Platform URL" help="Always available, even after you connect a custom domain.">
              <div className="flex items-center gap-2">
                <CopyField value={website.platformUrl} className="flex-1" label="Platform URL" />
                <Button size="sm" variant="ghost" trailingIcon={<ArrowUpRight />} asChild>
                  <a href={website.platformUrl} target="_blank" rel="noreferrer">
                    Visit
                  </a>
                </Button>
              </div>
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="text-fg">Primary domain</div>
                <div className="truncate font-mono text-xs text-fg-muted">{website.primaryDomain ?? 'No custom domain connected'}</div>
              </div>
              <Button size="xs" variant="ghost" asChild>
                <Link href={`/w/${websiteId}/domains`}>Manage domains</Link>
              </Button>
            </div>
          </div>
        </FieldGroup>

        <FieldGroup title="Localization" description="Languages your content is available in.">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default locale">
                <Select
                  value={v.defaultLocale}
                  onValueChange={(defaultLocale) => f.patch({ defaultLocale, locales: v.locales.includes(defaultLocale) ? v.locales : [defaultLocale, ...v.locales] })}
                  options={localeOptions}
                  disabled={dis}
                />
              </Field>
              <Field label="Supported locales" help="The default locale is always included.">
                <Combobox
                  multiple
                  creatable
                  value={v.locales}
                  onChange={(locales) => f.patch({ locales: locales.includes(v.defaultLocale) ? locales : [v.defaultLocale, ...locales] })}
                  options={localeOptions}
                  placeholder="Add locales"
                  searchPlaceholder="Search or type a code, e.g. fr-CA"
                  disabled={dis}
                />
              </Field>
            </div>
            <Field label="URL strategy">
              <RadioGroup
                variant="cards"
                className="sm:grid-cols-2"
                value={v.strategy}
                onValueChange={(s) => f.patch({ strategy: s as Strategy })}
                disabled={dis}
                options={[
                  { value: 'prefix-except-default', label: 'Prefix other locales', description: <span className="font-mono">/about · /{v.locales.find((l) => l !== v.defaultLocale) ?? 'fr'}/about</span> },
                  { value: 'prefix-all', label: 'Prefix every locale', description: <span className="font-mono">/{v.defaultLocale}/about · /{v.locales.find((l) => l !== v.defaultLocale) ?? 'fr'}/about</span> },
                ]}
              />
            </Field>
          </div>
        </FieldGroup>
      </div>
      <SaveBar dirty={dirty} saving={saving || f.saving} disabled={dis} onSave={() => void save()} onDiscard={discard} />
    </div>
  );
}
