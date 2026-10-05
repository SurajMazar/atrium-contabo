'use client';

import type { WebsiteDefinition } from '@atrium/schema';
import { ChoiceChips, cn, Field, FieldGroup, Input, RadioGroup, Switch, Textarea } from '@atrium/ui';
import { useSession } from '@/lib/session';
import { SaveBar, useReportDirty } from './save-bar';
import { ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { isUrl, opt, useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

type Category = 'necessary' | 'analytics' | 'marketing' | 'preferences';
type Position = 'bottom' | 'bottom-left' | 'bottom-right';

interface CookieForm {
  enabled: boolean;
  title: string;
  message: string;
  policyUrl: string;
  categories: Category[];
  position: Position;
}

const CATEGORIES: Array<{ value: Category; label: string; description: string }> = [
  { value: 'necessary', label: 'Necessary', description: 'Required for the site to work. Always on.' },
  { value: 'analytics', label: 'Analytics', description: 'Traffic measurement such as GA4.' },
  { value: 'marketing', label: 'Marketing', description: 'Ads and remarketing such as Meta Pixel.' },
  { value: 'preferences', label: 'Preferences', description: 'Remembered choices like language.' },
];
const ORDER: Category[] = ['necessary', 'analytics', 'marketing', 'preferences'];

function read(def: WebsiteDefinition): CookieForm {
  const c = def.settings?.cookieConsent;
  return {
    enabled: c?.enabled ?? false,
    title: c?.title ?? 'We value your privacy',
    message: c?.message ?? 'We use cookies to improve your experience and measure site performance.',
    policyUrl: c?.policyUrl ?? '',
    categories: (c?.categories ?? ['necessary', 'analytics', 'marketing']) as Category[],
    position: (c?.position ?? 'bottom-left') as Position,
  };
}
function write(def: WebsiteDefinition, f: CookieForm) {
  return {
    settings: {
      ...def.settings,
      cookieConsent: { enabled: f.enabled, title: f.title.trim(), message: f.message.trim(), policyUrl: opt(f.policyUrl), categories: ORDER.filter((c) => c === 'necessary' || f.categories.includes(c)), position: f.position },
    },
  };
}
function validate(f: CookieForm): FormErrors {
  const e: FormErrors = {};
  if (f.enabled && !f.title.trim()) e.title = 'Title is required';
  if (f.enabled && !f.message.trim()) e.message = 'Message is required';
  if (f.policyUrl.trim() && !isUrl(f.policyUrl) && !f.policyUrl.trim().startsWith('/')) e.policyUrl = 'Use a path like /privacy or a full URL';
  return e;
}

export function CookiesSection({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'Cookie consent saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch}>
      {() => <CookieFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function CookieFields({ websiteId, f }: { websiteId: string; f: SettingsForm<CookieForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const v = f.form!;
  const dis = !canEdit;

  return (
    <div>
      <SectionHeading title="Cookie consent" description="A consent banner that controls which scripts and trackers may run." />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <div className="space-y-4">
        <FieldGroup>
          <Switch checked={v.enabled} onCheckedChange={(enabled) => f.patch({ enabled })} disabled={dis} label="Show a cookie consent banner" description="Scripts in the analytics, marketing and preferences categories wait for consent." />
        </FieldGroup>

        <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]', !v.enabled && 'opacity-60')}>
          <FieldGroup title="Banner">
            <div className="space-y-4">
              <Field label="Title" error={f.errors.title}>
                <Input value={v.title} onChange={(e) => f.patch({ title: e.target.value })} disabled={dis} />
              </Field>
              <Field label="Message" error={f.errors.message}>
                <Textarea value={v.message} onChange={(e) => f.patch({ message: e.target.value })} disabled={dis} rows={3} />
              </Field>
              <Field label="Privacy policy URL" optional error={f.errors.policyUrl}>
                <Input value={v.policyUrl} onChange={(e) => f.patch({ policyUrl: e.target.value })} disabled={dis} placeholder="/privacy" className="font-mono" />
              </Field>
              <Field label="Categories" help={CATEGORIES.filter((c) => v.categories.includes(c.value)).map((c) => `${c.label}: ${c.description}`).join(' ')}>
                <ChoiceChips<Category>
                  multiple
                  options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, description: c.description }))}
                  value={v.categories}
                  onChange={(cats) => !dis && f.patch({ categories: Array.from(new Set<Category>(['necessary', ...(cats as Category[])])) })}
                />
              </Field>
              <Field label="Position">
                <RadioGroup
                  variant="cards"
                  className="sm:grid-cols-3"
                  value={v.position}
                  onValueChange={(p) => f.patch({ position: p as Position })}
                  disabled={dis}
                  options={[
                    { value: 'bottom', label: 'Bottom bar' },
                    { value: 'bottom-left', label: 'Bottom left' },
                    { value: 'bottom-right', label: 'Bottom right' },
                  ]}
                />
              </Field>
            </div>
          </FieldGroup>
          <ConsentPreview form={v} />
        </div>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}

function ConsentPreview({ form }: { form: CookieForm }) {
  const pos = form.position === 'bottom' ? 'inset-x-2 bottom-2' : form.position === 'bottom-left' ? 'bottom-2 left-2 w-[68%]' : 'bottom-2 right-2 w-[68%]';
  return (
    <div className="lg:sticky lg:top-4 lg:self-start" aria-label="Banner preview">
      <div className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Preview</div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-bg">
        <div className="space-y-2 p-3" aria-hidden>
          <div className="h-2 w-1/3 rounded-full bg-surface-3" />
          <div className="h-16 rounded-md bg-surface-2" />
          <div className="h-2 w-3/4 rounded-full bg-surface-3" />
          <div className="h-2 w-2/3 rounded-full bg-surface-3" />
        </div>
        <div className={cn('absolute rounded-md border border-border bg-surface p-2.5 shadow-popover', pos)}>
          <div className="truncate text-xs font-semibold text-fg">{form.title || 'Title'}</div>
          <p className="mt-0.5 line-clamp-3 text-2xs leading-4 text-fg-muted">{form.message || 'Message'}</p>
          <div className="mt-2 flex gap-1">
            <span className="rounded-sm bg-fg px-1.5 py-0.5 text-2xs font-medium text-bg">Accept all</span>
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-2xs text-fg-muted">Customize</span>
          </div>
        </div>
      </div>
    </div>
  );
}
