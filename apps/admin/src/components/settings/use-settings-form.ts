'use client';

import type { DraftResponse } from '@atrium/sdk';
import type { WebsiteDefinition } from '@atrium/schema';
import { toast } from '@atrium/ui';
import { useCallback, useMemo, useState } from 'react';
import { useDraft, useSaveSite, type SitePatch } from '@/lib/use-draft';

export type FormErrors = Record<string, string>;

export interface SettingsFormOptions<F> {
  websiteId: string;
  /** Derive local form state from the draft definition. Must be pure. */
  read: (def: WebsiteDefinition) => F;
  /** Build the save payload from the latest draft + local form state. */
  write: (def: WebsiteDefinition, form: F) => SitePatch;
  /** Field-level validation; keys are free-form field paths. */
  validate?: (form: F) => FormErrors;
  successMessage?: string;
  /** Called after a successful save (e.g. to invalidate dependent queries). */
  onSaved?: () => void;
}

export interface SettingsForm<F> {
  draft: DraftResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  form: F | undefined;
  set: (next: F | ((prev: F) => F)) => void;
  patch: (partial: Partial<F>) => void;
  dirty: boolean;
  errors: FormErrors;
  hasErrors: boolean;
  discard: () => void;
  save: () => Promise<boolean>;
  saving: boolean;
}

/**
 * Local, draft-backed form state for one settings section.
 *
 * - Initialises from `useDraft` (which also provides the revision for saving).
 * - Re-initialises whenever the server-side value changes — after our own save
 *   (optimistic cache update) or after a 409 refetch triggered by `useSaveSite`.
 * - Dirty tracking compares a JSON snapshot of the form with the draft-derived value.
 */
export function useSettingsForm<F>({ websiteId, read, write, validate, successMessage = 'Settings saved', onSaved }: SettingsFormOptions<F>): SettingsForm<F> {
  const q = useDraft(websiteId);
  const save = useSaveSite(websiteId);
  // `read` is expected to be a stable, module-level function.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const derived = useMemo(() => (q.data ? read(q.data.definition) : undefined), [q.data]);
  const baseline = useMemo(() => (derived === undefined ? null : JSON.stringify(derived)), [derived]);

  const [form, setForm] = useState<F | undefined>(derived);
  const [loadedBaseline, setLoadedBaseline] = useState<string | null>(baseline);
  // Render-time sync: reset local state when the server value changes.
  if (baseline !== loadedBaseline) {
    setLoadedBaseline(baseline);
    setForm(derived);
  }

  const dirty = form !== undefined && baseline !== null && JSON.stringify(form) !== baseline;
  const errors = useMemo(() => (form !== undefined && validate ? validate(form) : {}), [form, validate]);
  const hasErrors = Object.keys(errors).length > 0;

  const set = useCallback((next: F | ((prev: F) => F)) => {
    setForm((prev) => (prev === undefined ? prev : typeof next === 'function' ? (next as (p: F) => F)(prev) : next));
  }, []);
  const patch = useCallback((partial: Partial<F>) => setForm((prev) => (prev === undefined ? prev : { ...prev, ...partial })), []);
  const discard = useCallback(() => setForm(derived), [derived]);

  const doSave = useCallback(async () => {
    if (!q.data || form === undefined) return false;
    if (hasErrors) {
      toast.error('Fix the highlighted fields before saving');
      return false;
    }
    try {
      await save.mutateAsync(write(q.data.definition, form));
      toast.success(successMessage);
      onSaved?.();
      return true;
    } catch {
      // useSaveSite surfaces the error (and refetches on 409, which resets the form).
      return false;
    }
  }, [q.data, form, hasErrors, save, write, successMessage, onSaved]);

  return {
    draft: q.data,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: () => void q.refetch(),
    form,
    set,
    patch,
    dirty,
    errors,
    hasErrors,
    discard,
    save: doSave,
    saving: save.isPending,
  };
}

/** Trim and turn empty strings into `undefined` (optional schema strings). */
export function opt(v: string | undefined | null): string | undefined {
  const t = (v ?? '').trim();
  return t ? t : undefined;
}

export const isUrl = (v: string) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v.trim());
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
