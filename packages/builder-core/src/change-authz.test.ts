import { createRegistry } from '@atrium/component-registry';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_THEME } from './test-fixtures';
import { applyOperation, missingRequirements, normalizeWebsite, pageChangeRequirements, siteChangeRequirements } from './index';

const registry = createRegistry();

function site() {
  return normalizeWebsite(
    {
      settings: { name: 'Leela', business: { name: 'Leela Garden' }, seo: { siteTitle: 'Leela Garden' } },
      theme: DEFAULT_TEST_THEME,
      header: { type: 'site-header', props: {} },
      footer: { type: 'site-footer', props: {} },
      pages: [
        { title: 'Home', slug: 'home', isHomepage: true, sections: [{ type: 'hero', props: { heading: 'Welcome' } }] },
        { title: 'About', slug: 'about', sections: [{ type: 'section', props: {}, children: [{ type: 'embed', props: { mode: 'html', html: '<p>widget</p>' } }] }] },
      ],
    },
    registry,
  ).value;
}

/** Permissions of the default Editor role. */
const EDITOR = new Set(['organization.read', 'website.read', 'page.read', 'media.read', 'form.read', 'deployment.read', 'page.create', 'page.update', 'page.publish', 'media.upload', 'collection.content', 'ai.use', 'deployment.preview']);
const CONTENT_MANAGER = new Set(['website.read', 'page.read', 'page.update', 'collection.content', 'media.upload', 'ai.use']);
const SEO_MANAGER = new Set(['website.read', 'page.read', 'seo.manage', 'redirect.manage', 'page.update']);

const reasons = (before: ReturnType<typeof site>, after: ReturnType<typeof site>, granted: Set<string>) => missingRequirements(siteChangeRequirements(before, after), granted).map((r) => r.reason);

describe('siteChangeRequirements', () => {
  it('allows plain content edits for page.update', () => {
    const before = site();
    const after = produce(before, (d) => {
      d.pages[0]!.sections[0]!.props.heading = 'Hello';
    });
    expect(reasons(before, after, EDITOR)).toEqual([]);
  });

  it('requires code.manage for site scripts, whatever the write path', () => {
    const before = site();
    const after = produce(before, (d) => {
      applyOperation(d, { op: 'updateSettings', patch: { scripts: [{ id: 's1', name: 'x', placement: 'head', consentCategory: 'necessary', enabled: true, code: 'alert(1)' }] } }, registry);
    });
    expect(reasons(before, after, EDITOR)).toContain('change site scripts');
    expect(reasons(before, after, new Set([...EDITOR, 'code.manage', 'website.update']))).toEqual([]);
  });

  it('requires code.manage for custom CSS and page scripts', () => {
    const before = site();
    const css = produce(before, (d) => void (d.customCss = 'body{color:red}'));
    expect(reasons(before, css, EDITOR)).toContain('change custom CSS');
    const scripts = produce(before, (d) => void (d.pages[0]!.scripts = { head: '<script>alert(1)</script>' }));
    expect(reasons(before, scripts, EDITOR)).toContain('add or change page custom code');
  });

  it('requires code.manage for element and page CSS', () => {
    const before = site();
    const node = produce(before, (d) => void (d.pages[0]!.sections[0]!.customCss = '&{position:fixed;inset:0}'));
    expect(reasons(before, node, EDITOR)).toContain('add or change custom CSS on a page or element');
    const page = produce(before, (d) => void (d.pages[0]!.customCss = 'body{display:none}'));
    expect(reasons(before, page, EDITOR)).toContain('add or change custom CSS on a page or element');
  });

  it('requires code.manage to add or change embeds but not to duplicate existing ones', () => {
    const before = site();
    const added = produce(before, (d) => {
      d.pages[0]!.sections.push({ id: 'e2', type: 'embed', props: { mode: 'html', html: '<iframe src="https://evil.example"></iframe>' } } as never);
    });
    expect(reasons(before, added, EDITOR)).toContain('add or change an embed / custom HTML block');
    const duplicated = produce(before, (d) => {
      d.pages.push({ ...JSON.parse(JSON.stringify(d.pages[1])), id: 'p-copy', slug: 'about-copy', isHomepage: false });
    });
    expect(reasons(before, duplicated, EDITOR)).toEqual([]);
  });

  it('maps theme, navigation, redirects, forms and settings to their permissions', () => {
    const before = site();
    const theme = produce(before, (d) => void (d.theme.colors.primary = '#000'));
    expect(reasons(before, theme, EDITOR)).toEqual(['change the theme']);
    const redirects = produce(before, (d) => void d.redirects.push({ id: 'r', source: '/a', destination: 'https://evil.example', statusCode: 301, enabled: true } as never));
    expect(reasons(before, redirects, EDITOR)).toEqual(['change redirects']);
    const nav = produce(before, (d) => void (d.navigation.menus.primary = [{ id: 'n', label: 'x', link: '/x' } as never]));
    expect(reasons(before, nav, EDITOR)).toEqual(['change navigation, header or footer']);
    const form = produce(before, (d) => void d.forms.push({ id: 'f1', name: 'Leads', slug: 'leads', fields: [], rules: [], settings: {} } as never));
    expect(reasons(before, form, EDITOR)).toEqual(['create a form']);
    const settings = produce(before, (d) => void (d.settings.name = 'Renamed'));
    expect(reasons(before, settings, EDITOR)).toEqual(['change site settings']);
  });

  it('lets SEO managers change SEO settings only', () => {
    const before = site();
    const seo = produce(before, (d) => void (d.settings.seo.siteTitle = 'New title'));
    expect(reasons(before, seo, SEO_MANAGER)).toEqual([]);
    const other = produce(before, (d) => void (d.settings.name = 'Renamed'));
    expect(reasons(before, other, SEO_MANAGER)).toEqual(['change site settings']);
  });

  it('requires page.publish to schedule (scheduling publishes the whole site)', () => {
    const before = site();
    const scheduled = produce(before, (d) => {
      d.pages[1]!.status = 'scheduled';
      d.pages[1]!.publishAt = new Date(Date.now() + 60_000).toISOString();
    });
    expect(reasons(before, scheduled, CONTENT_MANAGER)).toEqual(['schedule a page for publishing']);
    expect(reasons(before, scheduled, EDITOR)).toEqual([]);
  });

  it('requires page.delete / page.create for page lifecycle', () => {
    const before = site();
    const deleted = produce(before, (d) => void d.pages.splice(1, 1));
    expect(reasons(before, deleted, EDITOR)).toContain('delete a page');
    expect(reasons(before, deleted, CONTENT_MANAGER)).toContain('delete a page');
  });

  it('treats the super-admin wildcard as everything', () => {
    const before = site();
    const after = produce(before, (d) => void (d.customCss = 'x'));
    expect(missingRequirements(siteChangeRequirements(before, after), new Set(['*']))).toEqual([]);
  });
});

describe('pageChangeRequirements', () => {
  it('ignores key order and undefined fields when nothing changed', () => {
    const page = site().pages[0]!;
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(page).reverse())));
    expect(pageChangeRequirements(page, reordered)).toEqual([]);
  });
});
