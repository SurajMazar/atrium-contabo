import { HistoryEngine, applyOperation, type ApplyResult, type SiteOperation } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import type { WebsiteDefinition } from '@atrium/schema';
import { produce } from 'immer';
import { create } from 'zustand';

/**
 * Document store: the WebsiteDefinition draft (immutable, structurally shared
 * via immer) + patch-based history. Components subscribe with narrow
 * selectors (a page, a node) so one edit only re-renders what changed.
 */
export interface DocumentState {
  definition: WebsiteDefinition | null;
  /** Page being edited. */
  pageId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Monotonic counter bumped on every committed change (cheap change signal). */
  version: number;
  /** Bumped to force a canvas remount (after inline editing mutated DOM). */
  canvasEpoch: number;
}

export interface CommitOptions {
  /** Consecutive commits with the same key within the merge window coalesce into one undo step. */
  mergeKey?: string;
  source?: 'user' | 'ai' | 'system';
}

export interface OpsResult {
  ok: boolean;
  results: ApplyResult[];
  error?: string;
}

type ErrorReporter = (message: string) => void;
let reportError: ErrorReporter = (m) => console.warn('[builder]', m);
export function setErrorReporter(fn: ErrorReporter) {
  reportError = fn;
}

let history = new HistoryEngine<WebsiteDefinition>(250, 900);
let redoLabels: string[] = [];

const initial: DocumentState = {
  definition: null,
  pageId: null,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  version: 0,
  canvasEpoch: 0,
};

export const useDocumentStore = create<DocumentState>()(() => ({ ...initial }));

const set = useDocumentStore.setState;
const get = useDocumentStore.getState;

function historyFlags() {
  const entries = history.entries;
  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: entries[entries.length - 1]?.label ?? null,
    redoLabel: redoLabels[redoLabels.length - 1] ?? null,
  };
}

function commit(next: WebsiteDefinition) {
  set((s) => ({ definition: next, version: s.version + 1, ...historyFlags() }));
}

/** Replace the whole document (initial load / reload from server). Clears history. */
export function loadDocument(definition: WebsiteDefinition, pageId?: string | null) {
  history = new HistoryEngine<WebsiteDefinition>(250, 900);
  redoLabels = [];
  const fallback = definition.pages.find((p) => p.isHomepage)?.id ?? definition.pages[0]?.id ?? null;
  const keep = pageId && definition.pages.some((p) => p.id === pageId) ? pageId : fallback;
  set((s) => ({ ...initial, definition, pageId: keep, version: s.version + 1, canvasEpoch: s.canvasEpoch + 1 }));
}

export function resetDocumentStore() {
  history = new HistoryEngine<WebsiteDefinition>(250, 900);
  redoLabels = [];
  set({ ...initial });
}

export function setPageId(pageId: string) {
  if (get().pageId === pageId) return;
  set({ pageId });
}

/** Record an arbitrary immer recipe as one undoable step. Returns false if it threw or changed nothing. */
export function mutate(label: string, recipe: (draft: WebsiteDefinition) => void, opts: CommitOptions = {}): boolean {
  const def = get().definition;
  if (!def) return false;
  let next: WebsiteDefinition;
  try {
    next = history.record(def, label, recipe, opts);
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
    return false;
  }
  if (next === def) return false;
  redoLabels = [];
  commit(next);
  return true;
}

/** Apply SiteOperations as ONE history entry (AI proposals, multi-step drops, …). */
export function runOps(label: string, ops: SiteOperation[], opts: CommitOptions = {}): OpsResult {
  const results: ApplyResult[] = [];
  const def = get().definition;
  if (!def) return { ok: false, results, error: 'Document not loaded' };
  let next: WebsiteDefinition;
  try {
    next = history.record(
      def,
      label,
      (draft) => {
        results.length = 0;
        for (const op of ops) results.push(applyOperation(draft, op, registry));
      },
      opts,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(message);
    return { ok: false, results: [], error: message };
  }
  if (next !== def) {
    redoLabels = [];
    commit(next);
  }
  return { ok: true, results };
}

/**
 * Change state WITHOUT a history entry. Only for server-authoritative
 * structural changes that append data (new page from the API), so existing
 * patches stay valid.
 */
export function applySilently(recipe: (draft: WebsiteDefinition) => void) {
  const def = get().definition;
  if (!def) return;
  const next = produce(def, recipe);
  if (next !== def) set((s) => ({ definition: next, version: s.version + 1 }));
}

export function undo(): string | null {
  const def = get().definition;
  if (!def || !history.canUndo) return null;
  const { state, entry } = history.undo(def);
  if (entry) redoLabels.push(entry.label);
  commit(state);
  return entry?.label ?? null;
}

export function redo(): string | null {
  const def = get().definition;
  if (!def || !history.canRedo) return null;
  const { state, entry } = history.redo(def);
  if (entry) redoLabels.pop();
  commit(state);
  return entry?.label ?? null;
}

export function bumpCanvasEpoch() {
  set((s) => ({ canvasEpoch: s.canvasEpoch + 1 }));
}

/** Test/diagnostic access. */
export function historyEntries() {
  return history.entries;
}

export function simulateOps(def: WebsiteDefinition, ops: SiteOperation[]): { definition: WebsiteDefinition; error?: string; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const next = produce(def, (draft) => {
      for (const op of ops) warnings.push(...applyOperation(draft, op, registry).warnings);
    });
    return { definition: next, warnings };
  } catch (err) {
    return { definition: def, error: err instanceof Error ? err.message : String(err), warnings };
  }
}
