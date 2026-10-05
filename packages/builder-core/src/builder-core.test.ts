import { createRegistry } from '@atrium/component-registry';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_THEME } from './test-fixtures';
import { applyOperation, diffWebsites, HistoryEngine, moveNode, normalizeWebsite, scanBrokenLinks, validateWebsite, analyzePageSeo } from './index';

const registry = createRegistry();

function site() {
  return normalizeWebsite(
    {
      settings: { name: 'Leela', business: { name: 'Leela Garden' }, seo: { siteTitle: 'Leela Garden' } },
      theme: DEFAULT_TEST_THEME,
      header: { type: 'site-header', props: {} },
      footer: { type: 'site-footer', props: {} },
      navigation: { menus: { primary: [{ id: '', label: 'Rooms', link: '/rooms' }, { id: '', label: 'Missing', link: '/nope' }] } },
      pages: [
        { title: 'Home', slug: 'home', isHomepage: true, sections: [{ type: 'hero', props: { heading: 'Welcome' } }, { type: 'heading', props: { text: 'loose element' } }] },
        { title: 'Rooms', slug: 'rooms', sections: [{ type: 'section', anchor: 'suites', props: {}, children: [{ type: 'button', props: { label: 'Go', link: '#nowhere' } }] }] },
      ],
    },
    registry,
  );
}

describe('normalizeWebsite', () => {
  it('assigns ids, homepage slug and wraps non-section roots', () => {
    const { value, issues } = site();
    expect(value.pages[0]!.slug).toBe('');
    expect(value.pages[0]!.sections[1]!.type).toBe('section');
    expect(value.navigation.menus.primary![0]!.id).toBeTruthy();
    expect(issues.some((i) => i.message.includes('wrapping'))).toBe(true);
  });
});

describe('operations', () => {
  it('adds, updates, moves and removes nodes immutably', () => {
    const base = site().value;
    const home = base.pages[0]!;
    let created = '';
    const next = produce(base, (d) => {
      created = applyOperation(d, { op: 'addNode', pageId: home.id, parentId: null, index: 0, node: { type: 'section', props: {} } }, registry).createdId!;
      applyOperation(d, { op: 'updateNode', pageId: home.id, nodeId: home.sections[0]!.id, props: { heading: 'Changed' }, variant: 'editorial' }, registry);
      applyOperation(d, { op: 'setStyle', pageId: home.id, nodeId: created, key: 'padding', breakpoint: 'mobile', value: '20px' }, registry);
    });
    expect(base.pages[0]!.sections).toHaveLength(2);
    expect(next.pages[0]!.sections).toHaveLength(3);
    expect(next.pages[0]!.sections[1]!.props.heading).toBe('Changed');
    expect(next.pages[0]!.sections[0]!.style?.padding).toEqual({ mobile: '20px' });
    expect(() => produce(next, (d) => void applyOperation(d, { op: 'updateNode', pageId: home.id, nodeId: home.sections[0]!.id, variant: 'nope' }, registry))).toThrow(/Unknown variant/);
    expect(() => produce(next, (d) => void applyOperation(d, { op: 'addNode', pageId: home.id, parentId: null, node: { type: 'button', props: {} } }, registry))).toThrow(/not a section/);
    const moved = produce(next, (d) => moveNode(d.pages[0]!.sections, created, null, 3));
    expect(moved.pages[0]!.sections[2]!.id).toBe(created);
    const diff = diffWebsites(base, next);
    expect(diff.filter((c) => c.kind === 'added')).toHaveLength(1);
  });
  it('creates, duplicates pages and enforces unique slugs', () => {
    const base = site().value;
    const next = produce(base, (d) => {
      applyOperation(d, { op: 'createPage', page: { title: 'About Us', slug: 'about' } }, registry);
      applyOperation(d, { op: 'duplicatePage', pageId: d.pages[1]!.id }, registry);
    });
    expect(next.pages.map((p) => p.slug)).toEqual(['', 'rooms', 'about', 'rooms-copy']);
    expect(() => produce(next, (d) => void applyOperation(d, { op: 'createPage', page: { title: 'x', slug: 'about' } }, registry))).toThrow(/already exists/);
  });
});

describe('analysis', () => {
  it('finds broken links and anchors', () => {
    const broken = scanBrokenLinks(site().value);
    expect(broken.map((b) => b.reason)).toEqual(expect.arrayContaining(['Anchor #nowhere not found on page', 'No page at /nope', 'No page at /contact']));
  });
  it('validates and scores SEO', () => {
    const def = site().value;
    const report = validateWebsite(def, registry);
    expect(report.checks.find((c) => c.id === 'navigation')?.status).toBe('fail');
    const seo = analyzePageSeo(def.pages[0]!, def);
    expect(seo.score).toBeGreaterThan(0);
    expect(seo.checks.find((c) => c.id === 'h1')?.status).toBe('pass');
  });
});

describe('history', () => {
  it('undoes and redoes with patches, merging rapid edits', () => {
    const h = new HistoryEngine<{ a: number; b: string }>();
    let s = { a: 1, b: 'x' };
    s = h.record(s, 'a', (d) => void (d.a = 2));
    s = h.record(s, 'type', (d) => void (d.b = 'xy'), { mergeKey: 'b' });
    s = h.record(s, 'type', (d) => void (d.b = 'xyz'), { mergeKey: 'b' });
    expect(h.entries).toHaveLength(2);
    s = h.undo(s).state;
    expect(s).toEqual({ a: 2, b: 'x' });
    s = h.undo(s).state;
    expect(s).toEqual({ a: 1, b: 'x' });
    s = h.redo(s).state;
    expect(s.a).toBe(2);
  });
});
