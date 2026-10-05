'use client';

import { createId, type ScriptDefinition, type WebsiteDefinition } from '@atrium/schema';
import { Badge, Banner, Button, Checkbox, cn, CodeEditor, EmptyState, Field, IconButton, Input, SegmentedControl, Select, Switch } from '@atrium/ui';
import { ChevronRight, Code2, Gauge, Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { SaveBar, useReportDirty } from './save-bar';
import { SectionHeading, SectionState } from './section-kit';
import { isUrl, useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

type Placement = ScriptDefinition['placement'];
type Consent = ScriptDefinition['consentCategory'];

interface ScriptRow {
  id: string;
  name: string;
  placement: Placement;
  mode: 'src' | 'code';
  src: string;
  code: string;
  consentCategory: Consent;
  enabled: boolean;
  async: boolean;
  defer: boolean;
}
interface ScriptsForm {
  scripts: ScriptRow[];
}

const PLACEMENTS: Array<{ value: Placement; label: string; description: string }> = [
  { value: 'head', label: 'Head', description: 'Inside <head>, before content loads' },
  { value: 'body-start', label: 'Body start', description: 'Right after <body> opens' },
  { value: 'body-end', label: 'Body end', description: 'Before </body>, after content' },
];
const CONSENT: Array<{ value: Consent; label: string; description: string }> = [
  { value: 'necessary', label: 'Necessary', description: 'Always runs' },
  { value: 'analytics', label: 'Analytics', description: 'Runs after analytics consent' },
  { value: 'marketing', label: 'Marketing', description: 'Runs after marketing consent' },
  { value: 'preferences', label: 'Preferences', description: 'Runs after preferences consent' },
];

function read(def: WebsiteDefinition): ScriptsForm {
  return {
    scripts: (def.settings?.scripts ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      placement: s.placement,
      mode: s.src ? 'src' : 'code',
      src: s.src ?? '',
      code: s.code ?? '',
      consentCategory: s.consentCategory ?? 'necessary',
      enabled: s.enabled ?? true,
      async: !!s.async,
      defer: !!s.defer,
    })),
  };
}
function write(def: WebsiteDefinition, f: ScriptsForm) {
  const scripts: ScriptDefinition[] = f.scripts.map((s) => ({
    id: s.id,
    name: s.name.trim(),
    placement: s.placement,
    consentCategory: s.consentCategory,
    enabled: s.enabled,
    // src and inline code are mutually exclusive
    ...(s.mode === 'src' ? { src: s.src.trim(), ...(s.async ? { async: true } : {}), ...(s.defer ? { defer: true } : {}) } : { code: s.code }),
  }));
  return { settings: { ...def.settings, scripts } };
}
function validate(f: ScriptsForm): FormErrors {
  const e: FormErrors = {};
  for (const s of f.scripts) {
    if (!s.name.trim()) e[`${s.id}.name`] = 'Name is required';
    if (s.mode === 'src') {
      if (!s.src.trim()) e[`${s.id}.src`] = 'Script URL is required';
      else if (!isUrl(s.src) && !s.src.trim().startsWith('//')) e[`${s.id}.src`] = 'Enter a full https:// URL';
    } else {
      if (!s.code.trim()) e[`${s.id}.code`] = 'Add some code';
      else if (s.code.length > 50_000) e[`${s.id}.code`] = 'Inline scripts are limited to 50,000 characters';
    }
  }
  return e;
}

export function ScriptsSection({ websiteId }: { websiteId: string }) {
  const { can } = useSession();
  if (!can('code.manage', websiteId)) {
    return (
      <div>
        <SectionHeading title="Scripts" description="Third-party tags and custom code injected into every page." />
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={<Lock />} title="Scripts are restricted" description={<>Custom code can affect security and performance, so it requires the <code className="font-mono text-xs">code.manage</code> permission. Ask an organization admin for access.</>} />
        </div>
      </div>
    );
  }
  return <ScriptsLoader websiteId={websiteId} />;
}

function ScriptsLoader({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'Scripts saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch} groups={1}>
      {() => <ScriptsFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function ScriptsFields({ websiteId, f }: { websiteId: string; f: SettingsForm<ScriptsForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const scripts = f.form!.scripts;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const set = (next: ScriptRow[]) => f.patch({ scripts: next });
  const update = (id: string, p: Partial<ScriptRow>) => set(scripts.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const add = () => {
    const id = createId('scr');
    set([...scripts, { id, name: '', placement: 'head', mode: 'src', src: '', code: '', consentCategory: 'analytics', enabled: true, async: true, defer: false }]);
    setOpen((o) => new Set(o).add(id));
  };
  const dis = !canEdit;

  return (
    <div>
      <SectionHeading
        title="Scripts"
        description="Third-party tags and custom code injected into every page."
        actions={
          scripts.length > 0 && (
            <Button size="sm" leadingIcon={<Plus />} onClick={add} disabled={dis}>
              Add script
            </Button>
          )
        }
      />
      <Banner tone="warning" icon={<Gauge />} className="mb-4">
        Every script adds weight and can slow your site. Load external scripts with <span className="font-medium">async</span> or <span className="font-medium">defer</span>, and give tracking tags a consent category so they only run after visitors opt in.
      </Banner>
      {scripts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState icon={<Code2 />} title="No custom scripts" description="Add chat widgets, booking engines or tags that aren’t covered by the built-in integrations." action={<Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={add} disabled={dis}>Add script</Button>} />
        </div>
      ) : (
        <ul className="space-y-2">
          {scripts.map((s) => {
            const isOpen = open.has(s.id);
            const invalid = Object.keys(f.errors).some((k) => k.startsWith(`${s.id}.`));
            const e = (k: string) => f.errors[`${s.id}.${k}`];
            return (
              <li key={s.id} className={cn('rounded-lg border border-border bg-surface', !s.enabled && 'opacity-70')}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => toggle(s.id)} aria-expanded={isOpen} aria-label={isOpen ? 'Collapse' : 'Expand'} className="inline-flex size-6 items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring">
                    <ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} strokeWidth={1.5} />
                  </button>
                  <button type="button" onClick={() => toggle(s.id)} className="min-w-0 flex-1 text-left outline-none">
                    <div className="truncate text-sm font-medium text-fg">{s.name || <span className="text-fg-subtle">Untitled script</span>}</div>
                    <div className="truncate font-mono text-xs text-fg-subtle">{s.mode === 'src' ? s.src || 'No URL' : `${s.code.split('\n').length} lines inline`}</div>
                  </button>
                  {invalid && <Badge tone="danger">Incomplete</Badge>}
                  <Badge tone="outline" className="hidden sm:inline-flex">{PLACEMENTS.find((p) => p.value === s.placement)?.label}</Badge>
                  <Badge tone={s.consentCategory === 'necessary' ? 'neutral' : 'accent'} className="hidden sm:inline-flex">{CONSENT.find((c) => c.value === s.consentCategory)?.label}</Badge>
                  <Switch size="sm" checked={s.enabled} onCheckedChange={(enabled) => update(s.id, { enabled })} disabled={dis} aria-label={s.enabled ? 'Disable script' : 'Enable script'} />
                  <IconButton label="Remove script" size="sm" variant="ghost" onClick={() => set(scripts.filter((x) => x.id !== s.id))} disabled={dis}>
                    <Trash2 />
                  </IconButton>
                </div>
                {isOpen && (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Name" required error={e('name')}>
                        <Input value={s.name} onChange={(ev) => update(s.id, { name: ev.target.value })} disabled={dis} placeholder="Booking widget" autoFocus={!s.name} />
                      </Field>
                      <Field label="Placement">
                        <Select value={s.placement} onValueChange={(p) => update(s.id, { placement: p as Placement })} options={PLACEMENTS} disabled={dis} />
                      </Field>
                      <Field label="Consent category">
                        <Select value={s.consentCategory} onValueChange={(c) => update(s.id, { consentCategory: c as Consent })} options={CONSENT} disabled={dis} />
                      </Field>
                    </div>
                    <div className="space-y-3">
                      <SegmentedControl
                        size="sm"
                        aria-label="Script source"
                        value={s.mode}
                        onValueChange={(mode) => !dis && update(s.id, { mode })}
                        options={[
                          { value: 'src', label: 'External URL' },
                          { value: 'code', label: 'Inline code' },
                        ]}
                      />
                      {s.mode === 'src' ? (
                        <div className="space-y-3">
                          <Field label="Script URL" error={e('src')} help="The script is loaded with a <script src> tag.">
                            <Input value={s.src} onChange={(ev) => update(s.id, { src: ev.target.value })} disabled={dis} className="font-mono text-xs" placeholder="https://widget.example.com/loader.js" />
                          </Field>
                          <div className="flex flex-wrap gap-5">
                            <Checkbox checked={s.async} onCheckedChange={(v) => update(s.id, { async: v === true })} disabled={dis} label="async" description="Download in parallel, run when ready" />
                            <Checkbox checked={s.defer} onCheckedChange={(v) => update(s.id, { defer: v === true })} disabled={dis} label="defer" description="Run after the page is parsed" />
                          </div>
                        </div>
                      ) : (
                        <Field label="Code" error={e('code')} hint={<span className="tabular-nums">{s.code.length.toLocaleString()} / 50,000</span>} help="JavaScript only, without surrounding <script> tags.">
                          <CodeEditor value={s.code} onChange={(code) => update(s.id, { code })} language="js" minRows={8} readOnly={dis} invalid={!!e('code') && !!s.code} aria-label="Inline script code" />
                        </Field>
                      )}
                      {s.mode === 'src' && s.code.trim() && <p className="text-xs text-fg-muted">Saving with an external URL discards the inline code for this script.</p>}
                      {s.mode === 'code' && s.src.trim() && <p className="text-xs text-fg-muted">Saving with inline code discards the external URL for this script.</p>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}
