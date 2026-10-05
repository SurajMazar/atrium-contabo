import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';

enablePatches();

export interface HistoryEntry {
  id: number;
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  /** Source of the change; AI edits are grouped into a single entry. */
  source: 'user' | 'ai' | 'system';
  at: number;
  /** Merge key: consecutive entries with the same key (e.g. typing in one field) coalesce. */
  mergeKey?: string;
}

/**
 * Patch-based undo/redo. Every edit is recorded as immer patches so undo is
 * O(change), not O(document) — large pages stay fast.
 */
export class HistoryEngine<T> {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private seq = 0;
  constructor(private readonly limit = 200, private readonly mergeWindowMs = 800) {}

  /** Run a mutation and record it. Returns the new state. */
  record(state: T, label: string, recipe: (draft: T) => void, opts: { source?: HistoryEntry['source']; mergeKey?: string } = {}): T {
    const [next, patches, inversePatches] = produceWithPatches(state, recipe as never) as unknown as [T, Patch[], Patch[]];
    if (!patches.length) return state;
    const last = this.past[this.past.length - 1];
    const now = Date.now();
    if (opts.mergeKey && last?.mergeKey === opts.mergeKey && now - last.at < this.mergeWindowMs) {
      last.patches.push(...patches);
      last.inversePatches.unshift(...inversePatches);
      last.at = now;
    } else {
      this.past.push({ id: ++this.seq, label, patches, inversePatches, source: opts.source ?? 'user', at: now, mergeKey: opts.mergeKey });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    return next;
  }

  undo(state: T): { state: T; entry?: HistoryEntry } {
    const entry = this.past.pop();
    if (!entry) return { state };
    this.future.push(entry);
    return { state: applyPatches(state as never, entry.inversePatches) as T, entry };
  }

  redo(state: T): { state: T; entry?: HistoryEntry } {
    const entry = this.future.pop();
    if (!entry) return { state };
    this.past.push(entry);
    return { state: applyPatches(state as never, entry.patches) as T, entry };
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get entries(): readonly HistoryEntry[] {
    return this.past;
  }
  clear() {
    this.past = [];
    this.future = [];
  }
}
