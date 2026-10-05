'use client';

import type { WebsiteDefinition } from '@atrium/schema';
import { Banner, Button, Field, FieldGroup, Input, Switch } from '@atrium/ui';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import { SaveBar, useReportDirty } from './save-bar';
import { ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { opt, useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

interface AnalyticsForm {
  builtIn: boolean;
  ga: string;
  gtm: string;
  pixel: string;
}

function read(def: WebsiteDefinition): AnalyticsForm {
  const a = def.settings?.analytics;
  return { builtIn: a?.builtIn ?? true, ga: a?.googleAnalyticsId ?? '', gtm: a?.googleTagManagerId ?? '', pixel: a?.metaPixelId ?? '' };
}
function write(def: WebsiteDefinition, f: AnalyticsForm) {
  return { settings: { ...def.settings, analytics: { builtIn: f.builtIn, googleAnalyticsId: opt(f.ga), googleTagManagerId: opt(f.gtm), metaPixelId: opt(f.pixel) } } };
}
function validate(f: AnalyticsForm): FormErrors {
  const e: FormErrors = {};
  if (f.ga.trim() && !/^G-[A-Z0-9]{4,16}$/.test(f.ga.trim())) e.ga = 'Measurement IDs look like G-XXXXXXXXXX';
  if (f.gtm.trim() && !/^GTM-[A-Z0-9]{4,12}$/.test(f.gtm.trim())) e.gtm = 'Container IDs look like GTM-XXXXXXX';
  if (f.pixel.trim() && !/^\d{10,20}$/.test(f.pixel.trim())) e.pixel = 'Pixel IDs are 10–20 digits';
  return e;
}

export function AnalyticsSettingsSection({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'Analytics settings saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch}>
      {() => <AnalyticsFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function AnalyticsFields({ websiteId, f }: { websiteId: string; f: SettingsForm<AnalyticsForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const v = f.form!;
  const dis = !canEdit;
  const consentOn = !!f.draft?.definition.settings?.cookieConsent?.enabled;
  const anyExternal = !!(v.ga.trim() || v.gtm.trim() || v.pixel.trim());

  return (
    <div>
      <SectionHeading
        title="Analytics"
        description="Built-in measurement and external tracking tags."
        actions={
          can('analytics.read', websiteId) && (
            <Button size="sm" variant="ghost" trailingIcon={<ArrowUpRight />} asChild>
              <Link href={`/w/${websiteId}/analytics`}>View analytics</Link>
            </Button>
          )
        }
      />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <div className="space-y-4">
        <FieldGroup>
          <Switch checked={v.builtIn} onCheckedChange={(builtIn) => f.patch({ builtIn })} disabled={dis} label="Built-in analytics" description="Cookieless pageview, referrer and conversion tracking that powers the Analytics dashboard." />
        </FieldGroup>
        <FieldGroup title="External tags" description="Loaded on every page of the published site.">
          <div className="space-y-4">
            <Field label="Google Analytics 4 measurement ID" optional error={f.errors.ga}>
              <Input value={v.ga} onChange={(e) => f.patch({ ga: e.target.value.toUpperCase().trim() })} disabled={dis} placeholder="G-XXXXXXXXXX" className="max-w-xs font-mono" />
            </Field>
            <Field label="Google Tag Manager container ID" optional error={f.errors.gtm} help="If you use GTM to load GA4, leave the measurement ID empty to avoid double counting.">
              <Input value={v.gtm} onChange={(e) => f.patch({ gtm: e.target.value.toUpperCase().trim() })} disabled={dis} placeholder="GTM-XXXXXXX" className="max-w-xs font-mono" />
            </Field>
            <Field label="Meta Pixel ID" optional error={f.errors.pixel}>
              <Input value={v.pixel} onChange={(e) => f.patch({ pixel: e.target.value.replace(/\D/g, '') })} disabled={dis} placeholder="123456789012345" className="max-w-xs font-mono" inputMode="numeric" />
            </Field>
          </div>
        </FieldGroup>
        {anyExternal && (
          <Banner tone={consentOn ? 'neutral' : 'warning'} icon={<ShieldCheck />}>
            {consentOn ? (
              'Google tags run after analytics consent and Meta Pixel after marketing consent.'
            ) : (
              <>
                Cookie consent is off, so these tags load for every visitor. Many regions require consent first.{' '}
                <Link href={`/w/${websiteId}/settings?section=cookies`} className="font-medium text-accent hover:underline">
                  Set up cookie consent
                </Link>
              </>
            )}
          </Banner>
        )}
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}
