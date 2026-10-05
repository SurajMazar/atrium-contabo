'use client';

import type { FormDefinition } from '@atrium/schema';
import { Banner, Field, FieldGroup, Input, RadioGroup, Select, Skeleton, Slider, Switch, Textarea } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Page } from '@/components/common/page';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useFormEditor } from './builder/editor-context';

type Settings = FormDefinition['settings'];
type CaptchaProvider = Settings['captcha']['provider'];

const CAPTCHA_PROVIDERS: Array<{ value: CaptchaProvider; label: string; description: string; driverHint: string }> = [
  { value: 'none', label: 'None', description: 'Rely on the honeypot and rate limiting', driverHint: '' },
  { value: 'recaptcha-v2', label: 'reCAPTCHA v2', description: 'Checkbox challenge', driverHint: 'recaptcha' },
  { value: 'recaptcha-v3', label: 'reCAPTCHA v3', description: 'Invisible, score based', driverHint: 'recaptcha' },
  { value: 'turnstile', label: 'Turnstile', description: 'Cloudflare, privacy friendly', driverHint: 'turnstile' },
  { value: 'hcaptcha', label: 'hCaptcha', description: 'Challenge based', driverHint: 'hcaptcha' },
];

const isUrlish = (v: string) => !v || /^(https?:\/\/|\/)/.test(v);

export function SettingsTab() {
  const { draft, setDraft, readOnly, organizationId } = useFormEditor();
  const s = draft.settings;
  const set = (p: Partial<Settings>) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const setCaptcha = (p: Partial<Settings['captcha']>) => setDraft((d) => ({ ...d, settings: { ...d.settings, captcha: { ...d.settings.captcha, ...p } } }));

  return (
    <Page width="narrow">
      <fieldset disabled={readOnly} className="min-w-0 space-y-5">
        <FieldGroup title="General" description="How the form identifies itself and what visitors see after submitting.">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Form name" required error={!draft.name.trim() ? 'Required' : undefined}>
                <Input value={draft.name} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </Field>
              <Field label="Slug" help="Used by the form embed and API" error={draft.slug && !/^[a-z0-9-]+$/.test(draft.slug) ? 'Lowercase letters, numbers and dashes only' : !draft.slug ? 'Required' : undefined}>
                <Input className="font-mono text-xs" value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
              </Field>
            </div>
            <Field label="Submit button label">
              <Input value={s.submitLabel} placeholder="Send" onChange={(e) => set({ submitLabel: e.target.value })} />
            </Field>
            <Field label="Success message" help="Shown in place of the form after a successful submission">
              <Textarea rows={2} value={s.successMessage} onChange={(e) => set({ successMessage: e.target.value })} />
            </Field>
            <Field label="Redirect URL" optional help="Send visitors to a thank-you page instead of showing the message" error={isUrlish(s.redirectUrl ?? '') ? undefined : 'Use an absolute URL or a path starting with /'}>
              <Input placeholder="/thank-you" value={s.redirectUrl ?? ''} onChange={(e) => set({ redirectUrl: e.target.value || undefined })} />
            </Field>
          </div>
        </FieldGroup>

        <FieldGroup title="Layout">
          <div className="space-y-4">
            <RadioGroup
              variant="cards"
              className="sm:grid-cols-2"
              value={s.layout}
              onValueChange={(layout) => set({ layout: layout as Settings['layout'] })}
              options={[
                { value: 'grid', label: 'Grid', description: 'Respect each field’s width (full, half, third)' },
                { value: 'stacked', label: 'Stacked', description: 'One field per row on every screen size' },
              ]}
            />
            <Field label="Consent text" optional help="Shown near the submit button, e.g. a privacy notice. Use a Consent field when agreement must be explicit.">
              <Textarea rows={2} value={s.consentText ?? ''} placeholder="By submitting, you agree to our privacy policy." onChange={(e) => set({ consentText: e.target.value || undefined })} />
            </Field>
          </div>
        </FieldGroup>

        <FieldGroup title="Submissions and spam">
          <div className="divide-y divide-border">
            <div className="pb-3">
              <Switch label="Store submissions" description="Keep responses in the inbox. When off, only workflows run." checked={s.storeSubmissions} onCheckedChange={(storeSubmissions) => set({ storeSubmissions })} />
            </div>
            <div className="py-3">
              <Switch label="Honeypot" description="Add a hidden field that silently rejects bots" checked={s.honeypot} onCheckedChange={(honeypot) => set({ honeypot })} />
            </div>
            <Field inline label="Rate limit" help="Maximum submissions per minute from one visitor (1–120)" className="pb-0" error={s.rateLimitPerMinute < 1 || s.rateLimitPerMinute > 120 ? 'Between 1 and 120' : undefined}>
              <Input
                type="number"
                min={1}
                max={120}
                className="w-28"
                suffix={<span className="text-xs">/min</span>}
                value={String(s.rateLimitPerMinute)}
                onChange={(e) => set({ rateLimitPerMinute: Math.round(Number(e.target.value) || 0) })}
                onBlur={() => set({ rateLimitPerMinute: Math.min(120, Math.max(1, s.rateLimitPerMinute || 1)) })}
              />
            </Field>
          </div>
        </FieldGroup>

        <CaptchaSection organizationId={organizationId} captcha={s.captcha} onChange={setCaptcha} />
      </fieldset>
    </Page>
  );
}

function CaptchaSection({ organizationId, captcha, onChange }: { organizationId: string | undefined; captcha: Settings['captcha']; onChange: (p: Partial<Settings['captcha']>) => void }) {
  const api = useApi();
  const enabled = captcha.provider !== 'none';
  const q = useQuery({
    queryKey: qk.providers(organizationId ?? '', 'CAPTCHA'),
    queryFn: () => api.providers.integrations.list(organizationId!, { kind: 'CAPTCHA' }),
    enabled: !!organizationId && enabled,
  });
  const hint = CAPTCHA_PROVIDERS.find((p) => p.value === captcha.provider)?.driverHint ?? '';
  const integrations = [...(q.data ?? [])].sort((a, b) => Number(b.driver.toLowerCase().includes(hint)) - Number(a.driver.toLowerCase().includes(hint)));

  return (
    <FieldGroup title="Captcha" description="Challenge suspicious visitors before accepting a submission.">
      <div className="space-y-4">
        <Field label="Provider">
          <Select
            value={captcha.provider}
            onValueChange={(provider) => onChange({ provider: provider as CaptchaProvider })}
            options={CAPTCHA_PROVIDERS.map((p) => ({ value: p.value, label: p.label, description: p.description }))}
          />
        </Field>

        {enabled && (
          <Field label="Integration" help="Holds the site key and secret. Falls back to the website’s default captcha integration.">
            {q.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : q.isError ? (
              <Banner tone="danger" action={<button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => void q.refetch()}>Retry</button>}>
                Could not load integrations.
              </Banner>
            ) : integrations.length === 0 ? (
              <Banner
                tone="warning"
                icon={<ShieldAlert />}
                action={
                  organizationId && (
                    <Link href={`/org/${organizationId}/integrations`} className="text-sm font-medium text-accent hover:underline">
                      Add integration
                    </Link>
                  )
                }
              >
                No captcha integration is configured for this organization.
              </Banner>
            ) : (
              <Select
                value={captcha.integrationId && integrations.some((i) => i.id === captcha.integrationId) ? captcha.integrationId : '__default'}
                onValueChange={(v) => onChange({ integrationId: v === '__default' ? undefined : v })}
                options={[
                  { value: '__default', label: 'Website default' },
                  ...integrations.map((i) => ({
                    value: i.id,
                    label: i.name,
                    description: `${i.driver}${hint && !i.driver.toLowerCase().includes(hint) ? ' · may not match the selected provider' : ''}${i.isDefault ? ' · default' : ''}`,
                  })),
                ]}
              />
            )}
          </Field>
        )}

        {captcha.provider === 'recaptcha-v3' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum score" help="Submissions scoring below this are rejected (0 = bot, 1 = human)">
              <Slider min={0} max={1} step={0.1} value={captcha.minScore} onValueChange={(minScore) => onChange({ minScore: Math.round(minScore * 10) / 10 })} showValue format={(v) => v.toFixed(1)} aria-label="Minimum score" />
            </Field>
            <Field label="Action name" help="Reported to reCAPTCHA for analytics">
              <Input className="font-mono text-xs" value={captcha.action} onChange={(e) => onChange({ action: e.target.value.replace(/[^A-Za-z0-9_/]/g, '') })} />
            </Field>
          </div>
        )}
      </div>
    </FieldGroup>
  );
}
