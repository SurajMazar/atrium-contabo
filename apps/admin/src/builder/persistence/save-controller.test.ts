import { AtriumApiError } from '@atrium/sdk';
import type { WebsiteDefinition } from '@atrium/schema';
import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { makeSite } from '../test/fixtures';
import { computeDirty, SaveController, snapshotOf, type SaveApi } from './save-controller';

type ApiMock = Record<'savePage' | 'saveSite' | 'saveTheme', Mock>;

function setup(overrides: Partial<ApiMock> = {}) {
  let def: WebsiteDefinition = makeSite();
  const api: ApiMock = {
    savePage: vi.fn(async (_id: string, body: { revision: number }) => ({ revision: body.revision + 1 })),
    saveSite: vi.fn(async (body: { revision: number }) => ({ revision: body.revision + 1 })),
    saveTheme: vi.fn(async (body: { revision: number }) => ({ revision: body.revision + 1 })),
    ...overrides,
  };
  let online = true;
  const states: string[] = [];
  const c = new SaveController({ api: api as unknown as SaveApi, getDefinition: () => def, debounceMs: 800, isOnline: () => online, onState: (s) => states.push(s.status) });
  c.init(def, { site: 3, theme: 7, pages: { home: 10, about: 20 } });
  return {
    c,
    api,
    states,
    edit(recipe: (d: WebsiteDefinition) => void) {
      def = produce(def, recipe);
      c.notifyChange();
    },
    get def() {
      return def;
    },
    setOnline(v: boolean) {
      online = v;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('dirty tracking', () => {
  it('detects changed units by reference only', () => {
    const def = makeSite();
    const snap = snapshotOf(def);
    expect(computeDirty(def, snap)).toEqual({ pages: [], site: false, theme: false, globals: [] });
    const next = produce(def, (d) => {
      d.pages[0]!.title = 'Start';
      d.theme.colors.primary = '#000';
    });
    expect(computeDirty(next, snap)).toMatchObject({ pages: ['home'], site: false, theme: true });
    const nav = produce(next, (d) => void (d.navigation.menus.primary = []));
    expect(computeDirty(nav, snap).site).toBe(true);
  });
});

describe('SaveController', () => {
  it('debounces and saves only dirty pages with their revision', async () => {
    const t = setup();
    t.edit((d) => void (d.pages[0]!.sections[0]!.props.heading = 'A'));
    t.edit((d) => void (d.pages[0]!.sections[0]!.props.heading = 'AB'));
    expect(t.c.state.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(799);
    expect(t.api.savePage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    expect(t.api.savePage).toHaveBeenCalledTimes(1);
    const [pageId, body] = t.api.savePage.mock.calls[0]!;
    expect(pageId).toBe('home');
    expect(body).toMatchObject({ revision: 10 });
    expect((body as { document: { sections: Array<{ props: { heading: string } }> } }).document.sections[0]!.props.heading).toBe('AB');
    expect(t.api.saveSite).not.toHaveBeenCalled();
    expect(t.api.saveTheme).not.toHaveBeenCalled();
    expect(t.c.state.status).toBe('saved');
    expect(t.c.revisions.pages.home).toBe(11);
  });

  it('sends title/slug changes alongside the document', async () => {
    const t = setup();
    t.edit((d) => {
      d.pages[1]!.title = 'About us';
      d.pages[1]!.slug = 'about-us';
    });
    await t.c.flush();
    expect(t.api.savePage).toHaveBeenCalledWith('about', expect.objectContaining({ title: 'About us', slug: 'about-us', revision: 20 }));
  });

  it('saves site-level data and theme through their own endpoints', async () => {
    const t = setup();
    t.edit((d) => {
      d.header.props.sticky = false;
      d.theme.colors.accent = '#ff0000';
    });
    await t.c.flush();
    expect(t.api.saveSite).toHaveBeenCalledWith(expect.objectContaining({ revision: 3, header: expect.objectContaining({ type: 'site-header' }) }));
    expect(t.api.saveTheme).toHaveBeenCalledWith(expect.objectContaining({ revision: 7, tokens: expect.objectContaining({ colors: expect.objectContaining({ accent: '#ff0000' }) }) }));
    expect(t.api.savePage).not.toHaveBeenCalled();
    expect(t.c.revisions).toMatchObject({ site: 4, theme: 8 });
    expect(t.c.hasUnsaved()).toBe(false);
  });

  it('keeps edits made during an in-flight save dirty and saves them next', async () => {
    let release!: () => void;
    const t = setup({
      savePage: vi.fn(
        (_id: string, body: { revision: number }) =>
          new Promise<{ revision: number }>((resolve) => {
            release = () => resolve({ revision: body.revision + 1 });
          }),
      ),
    });
    t.edit((d) => void (d.pages[0]!.title = 'One'));
    const flushing = t.c.flush();
    t.edit((d) => void (d.pages[0]!.title = 'Two'));
    release();
    await flushing;
    expect(t.c.state.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(800);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.api.savePage).toHaveBeenCalledTimes(2);
    expect(t.api.savePage.mock.calls[1]![1]).toMatchObject({ revision: 11, title: 'Two' });
  });

  it('pauses a conflicting unit, keeps saving others, and can overwrite with the server revision', async () => {
    const t = setup({
      savePage: vi.fn(async (id: string, body: { revision: number }) => {
        if (id === 'home' && body.revision === 10) throw new AtriumApiError(409, 'CONFLICT', 'Stale revision', { current: 14 });
        return { revision: body.revision + 1 };
      }),
    });
    t.edit((d) => {
      d.pages[0]!.title = 'Mine';
      d.pages[1]!.title = 'Also mine';
    });
    await t.c.flush();
    expect(t.c.state.status).toBe('conflict');
    expect(t.c.state.conflict).toMatchObject({ unit: { kind: 'page', pageId: 'home' }, serverRevision: 14 });
    expect(t.c.revisions.pages.about).toBe(21); // other unit still saved

    // further edits do not retry the paused unit
    t.edit((d) => void (d.pages[0]!.title = 'Mine 2'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.api.savePage.mock.calls.filter(([id]) => (id as string) === 'home')).toHaveLength(1);

    await t.c.overwrite();
    const last = t.api.savePage.mock.calls[t.api.savePage.mock.calls.length - 1]!;
    expect(last[0]).toBe('home');
    expect(last[1]).toMatchObject({ revision: 14, title: 'Mine 2' });
    expect(t.c.state.status).toBe('saved');
    expect(t.c.state.conflict).toBeNull();
  });

  it('queues while offline and flushes when connectivity returns', async () => {
    const t = setup();
    t.setOnline(false);
    t.edit((d) => void (d.pages[0]!.title = 'Offline edit'));
    await t.c.flush();
    expect(t.c.state.status).toBe('offline');
    expect(t.api.savePage).not.toHaveBeenCalled();
    expect(t.c.hasUnsaved()).toBe(true);
    t.setOnline(true);
    t.c.handleOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.api.savePage).toHaveBeenCalledTimes(1);
    expect(t.c.state.status).toBe('saved');
  });

  it('treats network failures as offline and retries automatically', async () => {
    let fail = true;
    const t = setup({
      savePage: vi.fn(async (_id: string, body: { revision: number }) => {
        if (fail) throw new TypeError('Failed to fetch');
        return { revision: body.revision + 1 };
      }),
    });
    t.edit((d) => void (d.pages[0]!.title = 'X'));
    await t.c.flush();
    expect(t.c.state.status).toBe('offline');
    fail = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.api.savePage).toHaveBeenCalledTimes(2);
    expect(t.c.state.status).toBe('saved');
  });

  it('reports server errors with a retry', async () => {
    const t = setup({ saveTheme: vi.fn(async () => Promise.reject(new AtriumApiError(500, 'INTERNAL', 'Boom'))) });
    t.edit((d) => void (d.theme.colors.primary = '#111111'));
    await t.c.flush();
    expect(t.c.state.status).toBe('error');
    expect(t.c.state.error).toBe('Boom');
    expect(t.c.hasUnsaved()).toBe(true);
  });

  it('markSaved adopts server-applied state (AI apply) without re-saving', async () => {
    const t = setup();
    t.edit((d) => void (d.pages[0]!.title = 'AI title'));
    t.c.markSaved(t.def, { pages: { home: 12 } });
    await t.c.flush();
    expect(t.api.savePage).not.toHaveBeenCalled();
    expect(t.c.revisions.pages.home).toBe(12);
  });
});
