'use client';

import type { WebsiteDefinition } from '@atrium/schema';
import { FieldGroup, Switch } from '@atrium/ui';
import { useSession } from '@/lib/session';
import { SaveBar, useReportDirty } from './save-bar';
import { ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { useSettingsForm, type SettingsForm } from './use-settings-form';

interface PerformanceForm {
  cachePages: boolean;
  progressBar: boolean;
}

function read(def: WebsiteDefinition): PerformanceForm {
  const p = def.settings?.performance;
  return { cachePages: p?.cachePages ?? true, progressBar: p?.progressBar ?? true };
}
function write(def: WebsiteDefinition, f: PerformanceForm) {
  return { settings: { ...def.settings, performance: { cachePages: f.cachePages, progressBar: f.progressBar } } };
}

export function PerformanceSection({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, successMessage: 'Page loading settings saved — publish to apply them to the live site' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch}>
      {() => <PerformanceFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function PerformanceFields({ websiteId, f }: { websiteId: string; f: SettingsForm<PerformanceForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const v = f.form!;
  const dis = !canEdit;
  return (
    <div>
      <SectionHeading title="Page loading" description="How the published site moves between pages. Changes apply after you publish." />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <div className="space-y-4">
        <FieldGroup>
          <div className="space-y-4">
            <Switch
              checked={v.cachePages}
              onCheckedChange={(cachePages) => f.patch({ cachePages })}
              disabled={dis}
              label="Keep visited pages in the browser"
              description="Pages a visitor opened or that were preloaded stay in their browser until they reload the site, so going back or revisiting is instant. Turn off to always fetch the latest page on every click (slower, but changes you publish show up without a reload)."
            />
            <Switch
              checked={v.progressBar}
              onCheckedChange={(progressBar) => f.patch({ progressBar })}
              disabled={dis}
              label="Loading bar"
              description="A slim bar in your primary colour along the top of the page while the next page loads. It only appears when loading takes more than a moment."
            />
          </div>
        </FieldGroup>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}
