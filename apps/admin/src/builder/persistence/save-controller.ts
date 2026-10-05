import { AtriumApiError, type DraftRevisions } from '@atrium/sdk';
import type { Node, PageDocument, ThemeTokens, WebsiteDefinition } from '@atrium/schema';

/**
 * Autosave engine. Dirtiness is tracked per unit (each page, site-level data,
 * theme) by REFERENCE comparison against the last-saved snapshot — immer's
 * structural sharing makes this O(pages) with no deep compares.
 *
 * Saves are optimistic (the UI never waits), debounced, serialized (one flush
 * in flight), conflict-aware (409 pauses only the affected unit) and
 * offline-tolerant (network failures keep units dirty and retry when back online).
 */

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';

export type SaveUnit = { kind: 'page'; pageId: string } | { kind: 'site' } | { kind: 'theme' } | { kind: 'global'; globalId: string };

export interface ConflictInfo {
  unit: SaveUnit;
  label: string;
  serverRevision: number | null;
  message: string;
}

export interface SaveState {
  status: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
  conflict: ConflictInfo | null;
  dirtyCount: number;
}

export interface SaveApi {
  savePage(pageId: string, body: { document: PageDocument; revision: number; title?: string; slug?: string; status?: string }): Promise<{ revision: number }>;
  saveSite(body: { settings: WebsiteDefinition['settings']; navigation: WebsiteDefinition['navigation']; header: Node; footer: Node; customCss?: string; revision: number }): Promise<{ revision: number }>;
  saveTheme(body: { tokens: ThemeTokens; revision: number }): Promise<{ revision: number }>;
  /** Reusable global sections are stored separately (no revision). */
  saveGlobalSection?(id: string, body: { name: string; node: Node }): Promise<unknown>;
}

export interface Snapshot {
  pages: Map<string, PageDocument>;
  settings: WebsiteDefinition['settings'];
  navigation: WebsiteDefinition['navigation'];
  header: Node;
  footer: Node;
  customCss: string | undefined;
  theme: ThemeTokens;
  globals: Map<string, WebsiteDefinition['globalSections'][number]>;
}

export interface DirtyUnits {
  pages: string[];
  site: boolean;
  theme: boolean;
  globals?: string[];
}

export function snapshotOf(def: WebsiteDefinition): Snapshot {
  return {
    pages: new Map(def.pages.map((p) => [p.id, p])),
    settings: def.settings,
    navigation: def.navigation,
    header: def.header,
    footer: def.footer,
    customCss: def.customCss,
    theme: def.theme,
    globals: new Map((def.globalSections ?? []).map((g) => [g.id, g])),
  };
}

export function isSiteDirty(def: WebsiteDefinition, snap: Snapshot): boolean {
  return def.settings !== snap.settings || def.navigation !== snap.navigation || def.header !== snap.header || def.footer !== snap.footer || def.customCss !== snap.customCss;
}

/** Units whose current object differs (by reference) from the last-saved snapshot. */
export function computeDirty(def: WebsiteDefinition, snap: Snapshot): DirtyUnits {
  const pages: string[] = [];
  for (const p of def.pages) {
    const saved = snap.pages.get(p.id);
    // Pages unknown to the snapshot were created through the pages API and are saved there.
    if (saved && saved !== p) pages.push(p.id);
  }
  const globals: string[] = [];
  for (const g of def.globalSections ?? []) {
    const saved = snap.globals.get(g.id);
    if (saved && saved !== g) globals.push(g.id);
  }
  return { pages, site: isSiteDirty(def, snap), theme: def.theme !== snap.theme, globals };
}

export function dirtyCount(d: DirtyUnits): number {
  return d.pages.length + (d.site ? 1 : 0) + (d.theme ? 1 : 0) + (d.globals?.length ?? 0);
}

const unitKey = (u: SaveUnit) => (u.kind === 'page' ? `page:${u.pageId}` : u.kind === 'global' ? `global:${u.globalId}` : u.kind);

function isNetworkError(err: unknown): boolean {
  if (err instanceof AtriumApiError) return err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504;
  return err instanceof TypeError || (err instanceof Error && /network|fetch|offline/i.test(err.message));
}

function conflictRevision(err: AtriumApiError): number | null {
  const d = err.details as { current?: unknown; revision?: unknown } | undefined;
  const v = d?.current ?? d?.revision;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof (v as { revision?: unknown }).revision === 'number') return (v as { revision: number }).revision;
  return null;
}

export interface SaveControllerOptions {
  api: SaveApi;
  getDefinition: () => WebsiteDefinition | null;
  onState?: (state: SaveState) => void;
  debounceMs?: number;
  isOnline?: () => boolean;
}

export class SaveController {
  revisions: DraftRevisions = { site: 0, theme: 0, pages: {} };
  state: SaveState = { status: 'idle', lastSavedAt: null, error: null, conflict: null, dirtyCount: 0 };
  private saved: Snapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<boolean> | null = null;
  private paused = new Map<string, ConflictInfo>();
  private readonly debounceMs: number;

  constructor(private readonly opts: SaveControllerOptions) {
    this.debounceMs = opts.debounceMs ?? 800;
  }

  private online() {
    return this.opts.isOnline ? this.opts.isOnline() : typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  private setState(patch: Partial<SaveState>) {
    this.state = { ...this.state, ...patch };
    this.opts.onState?.(this.state);
  }

  /** Start tracking from a freshly loaded draft. */
  init(def: WebsiteDefinition, revisions: DraftRevisions) {
    this.cancelTimers();
    this.saved = snapshotOf(def);
    this.revisions = { site: revisions.site, theme: revisions.theme, pages: { ...revisions.pages } };
    this.paused.clear();
    this.setState({ status: 'idle', error: null, conflict: null, dirtyCount: 0 });
  }

  /** Treat (parts of) the current definition as persisted — after server-side applies (AI, restore, page create). */
  markSaved(def: WebsiteDefinition, revisions?: Partial<DraftRevisions>, scope: 'all' | { pageIds: string[] } = 'all') {
    if (!this.saved || scope === 'all') this.saved = snapshotOf(def);
    else for (const id of scope.pageIds) {
      const p = def.pages.find((x) => x.id === id);
      if (p) this.saved.pages.set(id, p);
    }
    if (revisions) {
      if (revisions.site !== undefined) this.revisions.site = revisions.site;
      if (revisions.theme !== undefined) this.revisions.theme = revisions.theme;
      if (revisions.pages) this.revisions.pages = { ...this.revisions.pages, ...revisions.pages };
    }
    this.refreshDirty();
  }

  /** Register a page that now exists on the server. */
  trackPage(page: PageDocument, revision: number) {
    this.saved?.pages.set(page.id, page);
    this.revisions.pages[page.id] = revision;
  }

  /** Register a global section that now exists on the server. */
  trackGlobal(def: WebsiteDefinition, globalId: string) {
    const g = def.globalSections.find((x) => x.id === globalId);
    if (g) this.saved?.globals.set(g.id, g);
  }

  untrackPage(pageId: string) {
    this.saved?.pages.delete(pageId);
    delete this.revisions.pages[pageId];
    this.paused.delete(`page:${pageId}`);
  }

  dirty(): DirtyUnits {
    const def = this.opts.getDefinition();
    if (!def || !this.saved) return { pages: [], site: false, theme: false };
    return computeDirty(def, this.saved);
  }

  hasUnsaved(): boolean {
    return dirtyCount(this.dirty()) > 0 || this.state.status === 'saving';
  }

  private refreshDirty() {
    const n = dirtyCount(this.dirty());
    const patch: Partial<SaveState> = { dirtyCount: n };
    if (n === 0 && (this.state.status === 'pending' || this.state.status === 'idle')) patch.status = this.state.lastSavedAt ? 'saved' : 'idle';
    this.setState(patch);
  }

  /** Call after every document change. */
  notifyChange() {
    const n = dirtyCount(this.dirty());
    if (n === 0) {
      this.refreshDirty();
      return;
    }
    if (this.state.status !== 'saving' && this.state.status !== 'conflict' && this.state.status !== 'offline') this.setState({ status: 'pending', dirtyCount: n });
    else this.setState({ dirtyCount: n });
    this.schedule();
  }

  schedule(delay = this.debounceMs) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private cancelTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }

  /** Save everything dirty now. Resolves true when nothing is left unsaved. */
  flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight) return this.inflight.then(() => this.flush());
    this.inflight = this.runOnce().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async runOnce(): Promise<boolean> {
    const def = this.opts.getDefinition();
    if (!def || !this.saved) return true;
    const dirty = computeDirty(def, this.saved);
    const units: SaveUnit[] = [
      ...dirty.pages.map((pageId) => ({ kind: 'page', pageId }) as SaveUnit),
      ...(dirty.site ? [{ kind: 'site' } as SaveUnit] : []),
      ...(dirty.theme ? [{ kind: 'theme' } as SaveUnit] : []),
      ...(this.opts.api.saveGlobalSection ? (dirty.globals ?? []).map((globalId) => ({ kind: 'global', globalId }) as SaveUnit) : []),
    ].filter((u) => !this.paused.has(unitKey(u)));

    if (!units.length) {
      if (!this.paused.size) this.setState({ status: this.state.lastSavedAt ? 'saved' : 'idle', dirtyCount: dirtyCount(dirty), error: null });
      return dirtyCount(dirty) === 0;
    }
    if (!this.online()) {
      this.setState({ status: 'offline', dirtyCount: dirtyCount(dirty) });
      return false;
    }

    this.setState({ status: 'saving', error: null });
    const saved = this.saved;
    const results = await Promise.allSettled(units.map((u) => this.saveUnit(u, def, saved)));

    let offline = false;
    let error: string | null = null;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') return;
      const unit = units[i]!;
      const err = r.reason;
      if (err instanceof AtriumApiError && err.status === 409) {
        const info: ConflictInfo = { unit, label: this.unitLabel(unit, def), serverRevision: conflictRevision(err), message: err.message };
        this.paused.set(unitKey(unit), info);
      } else if (isNetworkError(err)) offline = true;
      else error = err instanceof Error ? err.message : String(err);
    });

    const remaining = this.dirty();
    const firstConflict = [...this.paused.values()][0] ?? null;
    const anySuccess = results.some((r) => r.status === 'fulfilled');
    const status: SaveStatus = firstConflict ? 'conflict' : offline ? 'offline' : error ? 'error' : dirtyCount(remaining) ? 'pending' : 'saved';
    this.setState({
      status,
      error,
      conflict: firstConflict,
      dirtyCount: dirtyCount(remaining),
      lastSavedAt: anySuccess ? Date.now() : this.state.lastSavedAt,
    });

    if (offline) this.retryLater(10_000);
    else if (error) this.retryLater(15_000);
    else if (!firstConflict && dirtyCount(remaining) > 0) this.schedule(); // edits arrived while saving
    return status === 'saved';
  }

  private retryLater(ms: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, ms);
  }

  private unitLabel(unit: SaveUnit, def: WebsiteDefinition) {
    if (unit.kind === 'page') return `Page “${def.pages.find((p) => p.id === unit.pageId)?.title ?? unit.pageId}”`;
    if (unit.kind === 'global') return `Global section “${def.globalSections.find((g) => g.id === unit.globalId)?.name ?? unit.globalId}”`;
    return unit.kind === 'site' ? 'Site settings, header & footer' : 'Theme';
  }

  private async saveUnit(unit: SaveUnit, def: WebsiteDefinition, saved: Snapshot): Promise<void> {
    const { api } = this.opts;
    if (unit.kind === 'page') {
      const page = def.pages.find((p) => p.id === unit.pageId)!;
      const prev = saved.pages.get(page.id);
      const revision = this.revisions.pages[page.id];
      if (revision === undefined) throw new Error(`No revision known for page ${page.title}`);
      const body: Parameters<SaveApi['savePage']>[1] = { document: page, revision };
      if (prev && prev.title !== page.title) body.title = page.title;
      if (prev && prev.slug !== page.slug) body.slug = page.slug;
      if (prev && prev.status !== page.status) body.status = page.status;
      const res = await api.savePage(page.id, body);
      this.revisions.pages[page.id] = res.revision;
      this.saved?.pages.set(page.id, page);
      return;
    }
    if (unit.kind === 'site') {
      const res = await api.saveSite({ settings: def.settings, navigation: def.navigation, header: def.header, footer: def.footer, customCss: def.customCss, revision: this.revisions.site });
      this.revisions.site = res.revision;
      if (this.saved) Object.assign(this.saved, { settings: def.settings, navigation: def.navigation, header: def.header, footer: def.footer, customCss: def.customCss });
      return;
    }
    if (unit.kind === 'global') {
      const g = def.globalSections.find((x) => x.id === unit.globalId)!;
      await api.saveGlobalSection!(g.id, { name: g.name, node: g.node });
      this.saved?.globals.set(g.id, g);
      return;
    }
    const res = await api.saveTheme({ tokens: def.theme, revision: this.revisions.theme });
    this.revisions.theme = res.revision;
    if (this.saved) this.saved.theme = def.theme;
  }

  /** Conflict resolution: resend local data on top of the server's current revision. */
  overwrite(): Promise<boolean> {
    for (const [key, info] of this.paused) {
      if (info.serverRevision !== null) {
        if (info.unit.kind === 'page') this.revisions.pages[info.unit.pageId] = info.serverRevision;
        else if (info.unit.kind === 'site') this.revisions.site = info.serverRevision;
        else if (info.unit.kind === 'theme') this.revisions.theme = info.serverRevision;
      }
      this.paused.delete(key);
    }
    this.setState({ conflict: null, status: 'pending' });
    return this.flush();
  }

  /** Called when the user reloads the latest server draft (init() follows). */
  clearConflicts() {
    this.paused.clear();
    this.setState({ conflict: null });
  }

  /** Browser came back online. */
  handleOnline() {
    if (this.state.status === 'offline') void this.flush();
  }

  dispose() {
    this.cancelTimers();
  }
}
