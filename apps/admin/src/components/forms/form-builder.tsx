'use client';

import { AtriumApiError, type FormDto } from '@atrium/sdk';
import type { FormDefinition, FormField } from '@atrium/schema';
import {
  Badge,
  Banner,
  Button,
  cn,
  EmptyState,
  IconButton,

  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  Tooltip,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, FileQuestion, Inbox, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PermissionPage } from '@/components/common/permission';
import { SetCrumbs } from '@/components/shell/crumbs';
import { errorMessage, useApi } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { BuildTab } from './builder/build-tab';
import { FormEditorProvider, type FormEditorValue } from './builder/editor-context';
import { collectIssues, describeValidationDetails, normalizeForm, type FormIssue } from './form-model';
import { SettingsTab } from './settings-tab';
import { WorkflowsTab } from './workflows/workflows-tab';

type TabKey = 'build' | 'settings' | 'workflows';

export function FormBuilderScreen({ websiteId, formId }: { websiteId: string; formId: string }) {
  return (
    <PermissionPage permission="form.read" websiteId={websiteId}>
      <FormBuilder websiteId={websiteId} formId={formId} />
    </PermissionPage>
  );
}

function FormBuilder({ websiteId, formId }: { websiteId: string; formId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { organizationId } = useWebsite();
  const { can } = useSession();
  const readOnly = !can('form.update', websiteId);

  const q = useQuery({ queryKey: qk.form(formId), queryFn: () => api.forms.get(formId) });

  const [draft, setDraftState] = useState<FormDefinition | null>(null);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>('build');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);

  const load = useCallback((dto: FormDto) => {
    const def = normalizeForm(dto);
    setDraftState(def);
    setBaseline(JSON.stringify(def));
    setRevision(dto.revision);
    setServerErrors([]);
  }, []);

  useEffect(() => {
    if (q.data && draft === null) load(q.data);
  }, [q.data, draft, load]);

  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const issues = useMemo(() => (draft ? collectIssues(draft) : []), [draft]);

  const setDraft = useCallback((fn: (d: FormDefinition) => FormDefinition) => setDraftState((d) => (d ? fn(d) : d)), []);
  const updateField = useCallback((id: string, patch: Partial<FormField>) => setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? ({ ...f, ...patch } as FormField) : f)) })), [setDraft]);

  const reload = useCallback(async () => {
    const res = await q.refetch();
    if (res.data) {
      load(res.data);
      toast.success('Loaded the latest version');
    } else if (res.error) toast.error(errorMessage(res.error));
  }, [q, load]);

  const save = useMutation({
    mutationFn: (def: FormDefinition) => api.forms.save(formId, { ...def, revision }),
    onSuccess: (res, def) => {
      setBaseline(JSON.stringify(def));
      setRevision(res.revision);
      setServerErrors([]);
      qc.setQueryData(qk.form(formId), res);
      void qc.invalidateQueries({ queryKey: qk.forms(websiteId) });
      toast.success('Form saved');
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.isConflict) {
        toast.error('Someone else changed this form', {
          description: 'Reload to get the latest version. Your unsaved changes will be lost.',
          duration: 15_000,
          action: { label: 'Reload', onClick: () => void reload() },
        });
      } else if (err instanceof AtriumApiError && err.isValidation) {
        const lines = describeValidationDetails(err.details);
        setServerErrors(lines.length ? lines : [err.message]);
        toast.error('The form could not be saved', { description: lines[0] ?? err.message });
      } else {
        toast.error(errorMessage(err, 'Could not save the form'));
      }
    },
  });

  const handleSave = useCallback(() => {
    if (!draft || readOnly || save.isPending) return;
    if (!dirty) {
      toast('No changes to save');
      return;
    }
    if (issues.length) {
      setIssuesOpen(true);
      toast.error(`Fix ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} before saving`);
      return;
    }
    save.mutate(draft);
  }, [draft, readOnly, save, dirty, issues.length]);

  // Cmd/Ctrl+S
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const goToIssue = (i: FormIssue) => {
    setIssuesOpen(false);
    setTab(i.target.tab);
    if (i.target.tab === 'build') setSelectedId(i.target.fieldId || null);
    if (i.target.tab === 'workflows') setFocusRuleId(i.target.ruleId ?? null);
  };

  if (q.isPending || (q.isSuccess && !draft)) return <BuilderSkeleton />;
  if (q.isError) {
    const notFound = q.error instanceof AtriumApiError && q.error.status === 404;
    return (
      <div className="p-6">
        {notFound ? (
          <EmptyState
            icon={<FileQuestion />}
            title="Form not found"
            description="It may have been deleted, or you followed an outdated link."
            action={
              <Button size="sm" asChild>
                <Link href={`/w/${websiteId}/forms`}>Back to forms</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState title="Could not load this form" description={q.error.message} action={<Button size="sm" onClick={() => void q.refetch()}>Try again</Button>} />
        )}
      </div>
    );
  }
  if (!draft) return null;

  const ctx: FormEditorValue = { draft, setDraft, updateField, selectedId, setSelectedId, readOnly, issues, websiteId, organizationId };
  const fieldIssues = issues.filter((i) => i.target.tab === 'build').length;
  const ruleIssues = issues.filter((i) => i.target.tab === 'workflows').length;
  const settingsIssues = issues.filter((i) => i.target.tab === 'settings').length;

  return (
    <FormEditorProvider value={ctx}>
      <SetCrumbs items={[{ label: draft.name || 'Untitled form' }]} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-full flex-col md:h-full md:min-h-0">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none">
            <Tooltip content="All forms">
              <IconButton label="Back to forms" size="sm" asChild>
                <Link href={`/w/${websiteId}/forms`}>
                  <ArrowLeft />
                </Link>
              </IconButton>
            </Tooltip>
            <InlineName value={draft.name} disabled={readOnly} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
            {readOnly ? (
              <Badge tone="outline">View only</Badge>
            ) : dirty ? (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted" role="status">
                <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                <span className="hidden sm:inline">Unsaved changes</span>
                <span className="sr-only sm:hidden">Unsaved changes</span>
              </span>
            ) : (
              <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline">Saved</span>
            )}
          </div>

          <TabsList variant="pill" className="order-last w-full md:order-none md:mx-auto md:w-auto">
            <TabsTrigger value="build" className="flex-1 md:flex-none">
              Build
              {fieldIssues > 0 && <span className="size-1.5 rounded-full bg-danger" aria-label={`${fieldIssues} issues`} />}
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-1 md:flex-none">
              Settings
              {settingsIssues > 0 && <span className="size-1.5 rounded-full bg-danger" aria-label={`${settingsIssues} issues`} />}
            </TabsTrigger>
            <TabsTrigger value="workflows" className="flex-1 md:flex-none" count={draft.rules.length || undefined}>
              Workflows
              {ruleIssues > 0 && <span className="size-1.5 rounded-full bg-danger" aria-label={`${ruleIssues} issues`} />}
            </TabsTrigger>
          </TabsList>

          <div className="flex shrink-0 items-center gap-1.5">
            {issues.length > 0 && !readOnly && (
              <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" leadingIcon={<CircleAlert />}>
                    {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-1">
                  <div className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">Fix before saving</div>
                  <ul className="max-h-72 overflow-y-auto">
                    {issues.map((i) => (
                      <li key={i.key}>
                        <button type="button" onClick={() => goToIssue(i)} className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-fg outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                          {i.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
            <Button size="sm" variant="ghost" leadingIcon={<Inbox />} asChild className="hidden lg:inline-flex">
              <Link href={`/w/${websiteId}/submissions?formId=${encodeURIComponent(formId)}`}>
                Submissions
                {typeof q.data?.submissionCount === 'number' && <span className="tabular-nums text-fg-subtle">{formatNumber(q.data.submissionCount)}</span>}
              </Link>
            </Button>
            {!readOnly && (
              <Tooltip content="Save" shortcut="⌘S">
                <Button size="sm" variant="primary" loading={save.isPending} disabled={!dirty} onClick={handleSave}>
                  Save
                </Button>
              </Tooltip>
            )}
          </div>
        </header>

        {serverErrors.length > 0 && (
          <div className="border-b border-border bg-surface px-4 py-2">
            <Banner
              tone="danger"
              icon={<CircleAlert />}
              action={
                <IconButton label="Dismiss" size="xs" onClick={() => setServerErrors([])}>
                  <X />
                </IconButton>
              }
            >
              <p className="font-medium">The server rejected this form</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-fg-muted">
                {serverErrors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {serverErrors.length > 8 && <li>and {serverErrors.length - 8} more</li>}
              </ul>
            </Banner>
          </div>
        )}

        <TabsContent value="build" className="min-h-0 flex-1 outline-none md:overflow-hidden">
          <BuildTab />
        </TabsContent>
        <TabsContent value="settings" className="min-h-0 flex-1 overflow-y-auto outline-none">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="workflows" className="min-h-0 flex-1 overflow-y-auto outline-none">
          <WorkflowsTab focusRuleId={focusRuleId} />
        </TabsContent>
      </Tabs>
    </FormEditorProvider>
  );
}

function InlineName({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const commit = () => {
    const t = text.trim();
    if (t && t !== value) onChange(t.slice(0, 120));
    setEditing(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Form name"
        value={text}
        maxLength={120}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.currentTarget.select()}
        className="h-7 w-56 min-w-0 rounded-sm border border-accent bg-surface px-1.5 text-sm font-semibold text-fg outline-none ring-2 ring-ring"
      />
    );
  }
  return (
    <Tooltip content={disabled ? undefined : 'Rename'}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        className={cn('h-7 min-w-0 max-w-[280px] truncate rounded-sm px-1.5 text-left text-sm font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring', !disabled && 'hover:bg-surface-2')}
      >
        {value || 'Untitled form'}
      </button>
    </Tooltip>
  );
}

function BuilderSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy>
      <div className="flex h-12 items-center gap-3 border-b border-border bg-surface px-4">
        <Skeleton className="size-6" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mx-auto h-6 w-56" />
        <Skeleton className="h-7 w-16" />
      </div>
      <div className="grid flex-1 md:grid-cols-[200px_minmax(0,1fr)_280px] xl:grid-cols-[232px_minmax(0,1fr)_320px]">
        <div className="hidden space-y-2 border-r border-border bg-surface p-3 md:block">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        <div className="p-8">
          <div className="mx-auto max-w-2xl space-y-5 rounded-lg border border-border bg-surface p-8">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="hidden space-y-3 border-l border-border bg-surface p-4 md:block">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
