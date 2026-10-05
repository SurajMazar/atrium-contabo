'use client';

import { DEFAULT_ADMIN_BRANDING, mergeBranding, type AdminBranding } from '@atrium/schema';
import {
  Badge,
  Banner,
  Button,
  ColorInput,
  ConfirmDialog,
  ErrorState,
  Field,
  FieldGroup,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Switch,
  Textarea,
  toast,
  cn,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Globe, LayoutDashboard, Moon, RotateCcw, Search, Sun, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Page } from '@/components/common/page';
import { MediaField } from '@/components/media/media-field';
import { SaveBar, useBeforeUnload } from '@/components/settings/save-bar';
import { AtriumMark } from '@/components/shell/brand';
import { errorMessage } from '@/lib/api';
import { accents, compactBranding, contrastReport, DEFAULT_PRODUCT_NAME, previewVars } from '@/lib/branding-core';
import { useTheme } from '@/lib/theme';

export interface BrandingSource {
  /** Stored overrides for this scope. */
  value: AdminBranding;
  /** What applies when a field is left empty (platform for orgs, built-ins for the platform). */
  inherited: AdminBranding;
}

export interface BrandingEditorProps {
  scope: 'organization' | 'platform';
  queryKey: readonly unknown[];
  load: () => Promise<BrandingSource>;
  save: (b: AdminBranding) => Promise<unknown>;
  /** Organization whose media library hosts uploaded logos. */
  mediaOrgId?: string | null;
  canEdit: boolean;
}

const ACCENT_PRESETS = ['#2b4fd8', '#4f46e5', '#0f766e', '#15803d', '#b45309', '#be123c', '#7c3aed', '#1b1b19'];

type Key = keyof AdminBranding;

function same(a: AdminBranding, b: AdminBranding) {
  return JSON.stringify(compactBranding(a)) === JSON.stringify(compactBranding(b));
}

export function BrandingEditor({ scope, queryKey, load, save, mediaOrgId, canEdit }: BrandingEditorProps) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: load });
  const [draft, setDraft] = useState<AdminBranding | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (q.data && draft === null) setDraft(q.data.value);
  }, [q.data, draft]);

  const stored = q.data?.value ?? {};
  const dirty = !!draft && !same(draft, stored);
  useBeforeUnload(dirty);

  const mutation = useMutation({
    mutationFn: (b: AdminBranding) => save(compactBranding(b)),
    onSuccess: async (_r, b) => {
      qc.setQueryData(queryKey, (old: BrandingSource | undefined) => (old ? { ...old, value: compactBranding(b) } : old));
      setDraft(compactBranding(b));
      await qc.invalidateQueries({ queryKey: ['branding'] });
      toast.success('Branding saved');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save branding')),
  });

  if (q.isError) return <Page width="wide"><ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} /></Page>;

  const inherited = q.data?.inherited ?? mergeBranding();
  const effective = mergeBranding(inherited, draft ?? {});
  const set = (patch: Partial<AdminBranding>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));
  const clear = (k: Key) =>
    setDraft((d) => {
      const n = { ...(d ?? {}) };
      delete n[k];
      return n;
    });
  const overridden = (k: Key) => draft?.[k] !== undefined && draft?.[k] !== '';
  const inheritLabel = scope === 'organization' ? 'Platform default' : 'Built-in default';
  const dis = !canEdit || mutation.isPending;

  const hint = (k: Key) =>
    overridden(k) ? (
      <button type="button" disabled={dis} onClick={() => clear(k)} className="inline-flex items-center gap-1 rounded-sm text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring">
        <RotateCcw className="size-3" strokeWidth={1.75} />
        Reset
      </button>
    ) : (
      <span>{inheritLabel}</span>
    );

  return (
    <Page width="wide">
      <PageHeader
        title="Branding"
        description={
          scope === 'organization'
            ? 'White-label the admin and editor for everyone in this organization: name, logo, colours and the sign-in page.'
            : 'Platform defaults for every organization. Organizations can override any of these.'
        }
        actions={
          canEdit && (
            <Button size="sm" variant="ghost" leadingIcon={<RotateCcw />} disabled={!q.data || mutation.isPending || Object.keys(compactBranding(stored)).length === 0} onClick={() => setResetOpen(true)}>
              {scope === 'organization' ? 'Reset to platform defaults' : 'Reset to built-in defaults'}
            </Button>
          )
        }
      />
      {!canEdit && (
        <Banner tone="neutral" className="mb-4">
          View only — changing branding requires the <code className="font-mono text-xs">organization.update</code> permission.
        </Banner>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {!draft ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <FieldGroup title="Identity" description="How the product is named across the admin, the editor and emails to members.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name" hint={hint('productName')}>
                  <Input value={draft.productName ?? ''} placeholder={inherited.productName ?? DEFAULT_PRODUCT_NAME} maxLength={40} disabled={dis} onChange={(e) => set({ productName: e.target.value })} />
                </Field>
                <Field label="Support link" hint={hint('supportUrl')} help="Shown in the account menu and on the sign-in page.">
                  <Input type="url" value={draft.supportUrl ?? ''} placeholder={inherited.supportUrl || 'https://help.example.com'} disabled={dis} onChange={(e) => set({ supportUrl: e.target.value })} />
                </Field>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <Switch
                  label="Hide “Powered by Atrium”"
                  description="Removes the attribution from the sign-in page when a custom product name is set."
                  checked={effective.hidePoweredBy ?? false}
                  disabled={dis}
                  onCheckedChange={(v) => set({ hidePoweredBy: v })}
                />
              </div>
            </FieldGroup>

            <FieldGroup title="Logo and icon" description="SVG or PNG with a transparent background works best. Uploads go to the organization media library.">
              <div className="grid gap-5 sm:grid-cols-3">
                <ImageSetting label="Logo" help="Light theme, ~24px tall" value={draft.logoUrl} inherited={inherited.logoUrl} hint={hint('logoUrl')} orgId={mediaOrgId} disabled={dis} onChange={(v) => set({ logoUrl: v })} />
                <ImageSetting label="Logo (dark)" help="Falls back to the light logo" value={draft.logoDarkUrl} inherited={inherited.logoDarkUrl} hint={hint('logoDarkUrl')} orgId={mediaOrgId} disabled={dis} onChange={(v) => set({ logoDarkUrl: v })} />
                <ImageSetting label="App icon" help="Square, used as favicon" value={draft.iconUrl} inherited={inherited.iconUrl} hint={hint('iconUrl')} orgId={mediaOrgId} disabled={dis} square onChange={(v) => set({ iconUrl: v })} />
              </div>
            </FieldGroup>

            <FieldGroup title="Theme" description="Accent colour, corner radius and density for every screen.">
              <div className="grid gap-5 sm:grid-cols-2">
                <AccentSetting theme="light" branding={effective} value={draft.accent} inherited={inherited.accent ?? DEFAULT_ADMIN_BRANDING.accent} hint={hint('accent')} disabled={dis} onChange={(v) => set({ accent: v })} />
                <AccentSetting theme="dark" branding={effective} value={draft.accentDark} inherited={accents({ ...effective, accentDark: inherited.accentDark }).dark.accent} hint={hint('accentDark')} disabled={dis} onChange={(v) => set({ accentDark: v })} />
              </div>
              <div className="mt-5 grid gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-3">
                <Field label="Corner radius" hint={hint('radius')}>
                  <SegmentedControl
                    fullWidth
                    aria-label="Corner radius"
                    value={effective.radius ?? 'default'}
                    onValueChange={(v) => !dis && set({ radius: v })}
                    options={[
                      { value: 'sharp', label: 'Sharp' },
                      { value: 'default', label: 'Default' },
                      { value: 'round', label: 'Round' },
                    ]}
                  />
                </Field>
                <Field label="Density" hint={hint('density')}>
                  <SegmentedControl
                    fullWidth
                    aria-label="Density"
                    value={effective.density ?? 'compact'}
                    onValueChange={(v) => !dis && set({ density: v })}
                    options={[
                      { value: 'compact', label: 'Compact' },
                      { value: 'comfortable', label: 'Comfortable' },
                    ]}
                  />
                </Field>
                <Field label="Default theme" hint={hint('defaultTheme')} help="Used until a member picks their own.">
                  <SegmentedControl
                    fullWidth
                    aria-label="Default theme"
                    value={effective.defaultTheme ?? 'system'}
                    onValueChange={(v) => !dis && set({ defaultTheme: v })}
                    options={[
                      { value: 'system', label: 'System' },
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                  />
                </Field>
              </div>
            </FieldGroup>

            <FieldGroup title="Sign-in page" description="With an image the sign-in page uses a two-column layout.">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
                <div className="space-y-4">
                  <Field label="Headline" hint={hint('loginHeadline')}>
                    <Input value={draft.loginHeadline ?? ''} maxLength={120} placeholder={inherited.loginHeadline || `Sign in to ${effective.productName ?? DEFAULT_PRODUCT_NAME}`} disabled={dis} onChange={(e) => set({ loginHeadline: e.target.value })} />
                  </Field>
                  <Field label="Subheadline" hint={hint('loginSubheadline')}>
                    <Textarea rows={2} value={draft.loginSubheadline ?? ''} maxLength={240} placeholder={inherited.loginSubheadline || 'Optional supporting line under the headline'} disabled={dis} onChange={(e) => set({ loginSubheadline: e.target.value })} />
                  </Field>
                </div>
                <ImageSetting label="Image" help="Landscape or portrait, at least 1200px" value={draft.loginImageUrl} inherited={inherited.loginImageUrl} hint={hint('loginImageUrl')} orgId={mediaOrgId} disabled={dis} onChange={(v) => set({ loginImageUrl: v })} />
              </div>
            </FieldGroup>

            <SaveBar dirty={dirty} saving={mutation.isPending} disabled={!canEdit} onSave={() => draft && mutation.mutate(draft)} onDiscard={() => setDraft(stored)} saveLabel="Save branding" />
          </div>
        )}

        <div className="xl:sticky xl:top-6">
          <BrandPreview branding={effective} />
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={scope === 'organization' ? 'Reset to platform defaults?' : 'Reset to built-in defaults?'}
        description={scope === 'organization' ? 'Every override for this organization is removed and the platform branding applies again.' : 'Platform branding is cleared; organizations without their own overrides use the built-in Atrium look.'}
        confirmLabel="Reset branding"
        tone="danger"
        onConfirm={() => mutation.mutateAsync({})}
      />
    </Page>
  );
}

/* ------------------------------------------------------------- settings */

function ImageSetting({
  label,
  help,
  value,
  inherited,
  hint,
  orgId,
  disabled,
  square,
  onChange,
}: {
  label: string;
  help?: string;
  value: string | undefined;
  inherited: string | undefined;
  hint: ReactNode;
  orgId?: string | null;
  disabled?: boolean;
  square?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint} help={!value && inherited ? 'Using the inherited image' : help}>
      <div className="space-y-2">
        {orgId ? (
          <MediaField value={value || inherited} onChange={(url) => onChange(url ?? '')} organizationId={orgId} aspect={square ? 'square' : 'wide'} disabled={disabled} placeholder="Choose" />
        ) : (
          <Skeleton className="h-14 w-24" />
        )}
        <Input size="sm" value={value ?? ''} placeholder="or paste a URL" aria-label={`${label} URL`} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </Field>
  );
}

function AccentSetting({ theme, branding, value, inherited, hint, disabled, onChange }: { theme: 'light' | 'dark'; branding: AdminBranding; value: string | undefined; inherited: string; hint: ReactNode; disabled?: boolean; onChange: (v: string) => void }) {
  const report = contrastReport(branding)[theme];
  const issues: string[] = [];
  if (report.text < 4.5) issues.push(`links and selected text ${report.text.toFixed(1)}:1`);
  if (report.onAccent < 4.5) issues.push(`button labels ${report.onAccent.toFixed(1)}:1`);
  return (
    <Field
      label={
        <span className="inline-flex items-center gap-1.5">
          {theme === 'light' ? <Sun className="size-3.5 text-fg-subtle" strokeWidth={1.75} /> : <Moon className="size-3.5 text-fg-subtle" strokeWidth={1.75} />}
          Accent · {theme}
        </span>
      }
      hint={hint}
    >
      <div className="space-y-2">
        <ColorInput value={value || inherited} disabled={disabled} presets={theme === 'light' ? ACCENT_PRESETS : undefined} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && onChange(v.toLowerCase())} />
        {issues.length ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
            <span>Low contrast in {theme} mode: {issues.join(', ')}. Aim for 4.5:1.</span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Check className="size-3.5 text-success" strokeWidth={2} />
            Readable in {theme} mode · text {report.text.toFixed(1)}:1 · buttons {report.onAccent.toFixed(1)}:1
          </p>
        )}
        {theme === 'dark' && !value && <p className="text-xs text-fg-subtle">Derived from the light accent when not set.</p>}
      </div>
    </Field>
  );
}

/* -------------------------------------------------------------- preview */

function BrandPreview({ branding }: { branding: AdminBranding }) {
  const { resolved } = useTheme();
  const [theme, setTheme] = useState<'light' | 'dark'>(resolved);
  useEffect(() => setTheme(resolved), [resolved]);
  const vars = useMemo(() => previewVars(branding, theme) as CSSProperties, [branding, theme]);
  const logo = theme === 'dark' ? branding.logoDarkUrl || branding.logoUrl : branding.logoUrl;
  const name = branding.productName || DEFAULT_PRODUCT_NAME;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface" aria-label="Preview">
      <header className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
        <h3 className="text-sm font-semibold text-fg">Preview</h3>
        <SegmentedControl
          size="xs"
          aria-label="Preview theme"
          value={theme}
          onValueChange={setTheme}
          options={[
            { value: 'light', icon: <Sun />, ariaLabel: 'Light' },
            { value: 'dark', icon: <Moon />, ariaLabel: 'Dark' },
          ]}
        />
      </header>
      <div style={vars} className="bg-bg p-4 text-fg">
        <div className="flex overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {/* mini sidebar */}
          <div className="w-[132px] shrink-0 border-r border-border bg-surface-2/60 p-2">
            <div className="flex h-7 items-center gap-1.5 px-1">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-4 w-auto max-w-[110px] object-contain object-left" />
              ) : (
                <>
                  {branding.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.iconUrl} alt="" className="size-4 rounded-xs object-contain" />
                  ) : (
                    <AtriumMark className="size-4" />
                  )}
                  <span className="truncate text-xs font-semibold">{name}</span>
                </>
              )}
            </div>
            <div className="mt-2 space-y-px">
              {[
                { icon: LayoutDashboard, label: 'Dashboard', on: true },
                { icon: Globe, label: 'Websites' },
                { icon: Search, label: 'SEO' },
                { icon: Users, label: 'Team' },
              ].map((it) => (
                <div key={it.label} className={cn('flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-[11px]', it.on ? 'bg-surface font-medium text-fg ring-1 ring-border' : 'text-fg-muted')}>
                  <it.icon className="size-3 shrink-0" strokeWidth={1.5} />
                  {it.label}
                </div>
              ))}
            </div>
          </div>
          {/* mini content */}
          <div className="min-w-0 flex-1 space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold">Websites</span>
              <span className="inline-flex h-(--ui-ctl-xs) items-center rounded-md bg-accent px-2 text-[11px] font-medium text-accent-fg">New</span>
            </div>
            <div className="flex h-(--ui-ctl-sm) items-center rounded-md border border-accent px-2 text-[11px] text-fg ring-2 ring-ring">Aranya Lake</div>
            <div className="flex items-center justify-between rounded-md border border-border p-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium">Northwind</div>
                <div className="truncate text-[10px] text-fg-subtle">northwind.example</div>
              </div>
              <Badge size="xs" tone="accent">Live</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-accent">View all</span>
              <span className="relative inline-flex h-4 w-[26px] items-center rounded-full bg-accent p-0.5">
                <span className="block size-3 translate-x-[10px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.22)]" />
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex h-(--ui-ctl-sm) items-center rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg shadow-xs">Publish</span>
          <span className="inline-flex h-(--ui-ctl-sm) items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-fg shadow-xs">Preview</span>
          <span className="inline-flex h-(--ui-ctl-sm) items-center rounded-md px-2 text-xs font-medium text-fg-muted">Cancel</span>
        </div>
      </div>
      <footer className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">Changes apply to everyone after you save.</footer>
    </section>
  );
}
