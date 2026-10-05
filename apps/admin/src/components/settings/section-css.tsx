'use client';

import { themeToVariables } from '@atrium/design-tokens';
import type { WebsiteDefinition } from '@atrium/schema';
import { Banner, Card, CardHeader, CodeEditor, EmptyState, Input, ScrollArea, toast, copyToClipboard } from '@atrium/ui';
import { Lock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { SaveBar, useReportDirty } from './save-bar';
import { SectionHeading, SectionState } from './section-kit';
import { useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

const MAX = 100_000;

interface CssForm {
  css: string;
}
const read = (def: WebsiteDefinition): CssForm => ({ css: def.customCss ?? '' });
const write = (_def: WebsiteDefinition, f: CssForm) => ({ customCss: f.css });
const validate = (f: CssForm): FormErrors => (f.css.length > MAX ? { css: `Custom CSS is limited to ${MAX.toLocaleString()} characters` } : {});

/** Fallback list when the theme can't be compiled (e.g. partial tokens). */
const STATIC_VARS: Array<[string, string]> = [
  ['--a-color-primary', ''],
  ['--a-color-secondary', ''],
  ['--a-color-accent', ''],
  ['--a-color-background', ''],
  ['--a-color-surface', ''],
  ['--a-color-text', ''],
  ['--a-color-muted', ''],
  ['--a-color-border', ''],
  ['--a-font-heading', ''],
  ['--a-font-body', ''],
  ['--a-text-base', ''],
  ['--a-space-4', ''],
  ['--a-space-section', ''],
  ['--a-radius-md', ''],
  ['--a-shadow-md', ''],
  ['--a-container-default', ''],
];

export function CssSection({ websiteId }: { websiteId: string }) {
  const { can } = useSession();
  if (!can('code.manage', websiteId)) {
    return (
      <div>
        <SectionHeading title="Custom CSS" description="Site-wide styles added after the theme." />
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<Lock />} title="Custom CSS is restricted" description={<>Editing custom code requires the <code className="font-mono text-xs">code.manage</code> permission.</>} />
        </div>
      </div>
    );
  }
  return <CssLoader websiteId={websiteId} />;
}

function CssLoader({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'Custom CSS saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch} groups={1}>
      {() => <CssFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function CssFields({ websiteId, f }: { websiteId: string; f: SettingsForm<CssForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const [filter, setFilter] = useState('');
  const theme = f.draft?.definition.theme;
  const vars = useMemo<Array<[string, string]>>(() => {
    if (!theme) return STATIC_VARS;
    try {
      const out = Object.entries(themeToVariables(theme));
      return out.length ? out : STATIC_VARS;
    } catch {
      return STATIC_VARS;
    }
  }, [theme]);
  const shown = vars.filter(([k]) => !filter.trim() || k.includes(filter.trim().toLowerCase()));
  const css = f.form!.css;

  const copy = async (name: string) => {
    if (await copyToClipboard(`var(${name})`)) toast.success(`Copied var(${name})`);
  };

  return (
    <div>
      <SectionHeading title="Custom CSS" description="Site-wide styles loaded after the theme. Prefer theme tokens so your CSS follows design changes." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-2">
          <CodeEditor value={css} onChange={(v) => f.patch({ css: v })} language="css" minRows={22} maxHeight={640} readOnly={!canEdit} invalid={!!f.errors.css} aria-label="Custom CSS" placeholder={'.site-header {\n  border-bottom: 1px solid var(--a-color-border);\n}'} />
          <div className="flex justify-between text-xs">
            <span className={f.errors.css ? 'text-danger' : 'text-fg-muted'}>{f.errors.css ?? 'Applied to the published site and the editor canvas.'}</span>
            <span className="tabular-nums text-fg-subtle">
              {css.length.toLocaleString()} / {MAX.toLocaleString()}
            </span>
          </div>
          {!canEdit && <Banner tone="neutral">Saving custom CSS also requires the website.update permission.</Banner>}
        </div>
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader title="Theme variables" description="Click to copy as var(…)" />
          <div className="border-b border-border p-2">
            <Input size="sm" prefix={<Search />} placeholder="Filter variables" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter variables" />
          </div>
          <ScrollArea className="h-[420px]">
            <ul className="p-1">
              {shown.map(([name, value]) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => void copy(name)}
                    title={value || name}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {name.startsWith('--a-color-') && value ? <span className="size-3 shrink-0 rounded-xs border border-border" style={{ background: value }} aria-hidden /> : <span className="size-3 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{name}</span>
                    {value && <span className="max-w-[90px] shrink-0 truncate font-mono text-2xs text-fg-subtle">{value}</span>}
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-2 py-6 text-center text-xs text-fg-muted">No variables match</li>}
            </ul>
          </ScrollArea>
        </Card>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={!canEdit || f.hasErrors} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}
