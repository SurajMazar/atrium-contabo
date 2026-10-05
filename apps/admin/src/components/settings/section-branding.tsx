'use client';

import type { WebsiteDefinition } from '@atrium/schema';
import { Field, FieldGroup, Input, Skeleton, Slider } from '@atrium/ui';
import { MediaField } from '@/components/media/media-field';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { SaveBar, useReportDirty } from './save-bar';
import { BindingHint, ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { opt, useSettingsForm, type SettingsForm } from './use-settings-form';

interface BrandingForm {
  logo: string;
  logoInverse: string;
  favicon: string;
  logoWidth: number | null;
  wordmark: string;
}

function read(def: WebsiteDefinition): BrandingForm {
  const b = def.settings?.branding ?? {};
  return { logo: b.logo ?? '', logoInverse: b.logoInverse ?? '', favicon: b.favicon ?? '', logoWidth: typeof b.logoWidth === 'number' ? b.logoWidth : null, wordmark: b.wordmark ?? '' };
}
function write(def: WebsiteDefinition, f: BrandingForm) {
  return {
    settings: {
      ...def.settings,
      branding: { ...(def.settings.branding ?? {}), logo: opt(f.logo), logoInverse: opt(f.logoInverse), favicon: opt(f.favicon), logoWidth: f.logoWidth ?? undefined, wordmark: opt(f.wordmark) },
    },
  };
}

export function BrandingSection({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, successMessage: 'Branding saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch}>
      {() => <BrandingFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function BrandingFields({ websiteId, f }: { websiteId: string; f: SettingsForm<BrandingForm> }) {
  const { can } = useSession();
  const { organizationId } = useWebsite();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const v = f.form!;
  const dis = !canEdit;
  const width = v.logoWidth ?? 140;
  const siteName = f.draft?.definition.settings?.name ?? 'Your site';
  const media = (key: 'logo' | 'logoInverse' | 'favicon', aspect: 'wide' | 'square' = 'wide') =>
    organizationId ? <MediaField value={v[key]} onChange={(url) => f.patch({ [key]: url ?? '' } as Partial<BrandingForm>)} organizationId={organizationId} websiteId={websiteId} aspect={aspect} disabled={dis} /> : <Skeleton className="h-14 w-24" />;

  return (
    <div>
      <SectionHeading title="Branding" description="Logos and icons used by the header, footer and browser tab." />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <div className="space-y-4">
        <FieldGroup title="Logos">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Logo" hint={<BindingHint path="branding.logo" />} help="SVG or transparent PNG.">
              {media('logo')}
            </Field>
            <Field label="Inverse logo" optional help="Used on dark or transparent headers.">
              {media('logoInverse')}
            </Field>
            <Field label="Logo width" help="Display width in the header. Height scales automatically.">
              <div className="flex items-center gap-3">
                <Slider value={width} min={40} max={400} step={4} onValueChange={(n) => f.patch({ logoWidth: n })} disabled={dis} className="flex-1" aria-label="Logo width" />
                <Input type="number" size="sm" value={v.logoWidth ?? ''} placeholder="140" min={20} max={600} onChange={(e) => f.patch({ logoWidth: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null })} disabled={dis} suffix={<span className="text-xs">px</span>} className="w-24" aria-label="Logo width in pixels" />
              </div>
            </Field>
            <Field label="Wordmark" optional hint={<BindingHint path="branding.wordmark" />} help="Text shown when no logo is set.">
              <Input value={v.wordmark} onChange={(e) => f.patch({ wordmark: e.target.value })} disabled={dis} placeholder={siteName} />
            </Field>
          </div>
        </FieldGroup>

        <FieldGroup title="Favicon">
          <Field label="Favicon" help="Square PNG or SVG, at least 512 × 512 px. Also used as the app icon on phones.">
            {media('favicon', 'square')}
          </Field>
        </FieldGroup>

        <div className="grid gap-3 sm:grid-cols-2" aria-label="Logo preview">
          <LogoPreview label="On light" src={v.logo} fallback={v.wordmark || siteName} width={width} tone="light" />
          <LogoPreview label="On dark" src={v.logoInverse || v.logo} fallback={v.wordmark || siteName} width={width} tone="dark" />
        </div>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}

function LogoPreview({ label, src, fallback, width, tone }: { label: string; src: string; fallback: string; width: number; tone: 'light' | 'dark' }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-surface px-3 py-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={tone === 'dark' ? 'flex h-20 items-center bg-fg px-5' : 'flex h-20 items-center bg-bg px-5'}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: Math.min(width, 280) }} className="max-h-14 object-contain object-left" />
        ) : (
          <span className={tone === 'dark' ? 'truncate text-sm font-semibold text-bg' : 'truncate text-sm font-semibold text-fg'}>{fallback}</span>
        )}
      </div>
    </div>
  );
}
