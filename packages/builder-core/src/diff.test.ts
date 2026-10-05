import { createRegistry } from '@atrium/component-registry';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_THEME } from './test-fixtures';
import { diffWebsites, normalizeWebsite } from './index';

const registry = createRegistry();

function site() {
  return normalizeWebsite(
    {
      settings: { name: 'Leela', business: { name: 'Leela Garden' }, seo: { siteTitle: 'Leela Garden' } },
      theme: DEFAULT_TEST_THEME,
      header: { type: 'site-header', props: {} },
      footer: { type: 'site-footer', props: {} },
      navigation: { menus: { primary: [] } },
      pages: [{ title: 'Home', slug: '', isHomepage: true, sections: [{ type: 'hero', props: { heading: 'Welcome' } }] }],
      forms: [{ id: 'form_1', name: 'Contact', slug: 'contact', fields: [{ id: 'f1', name: 'email', label: 'Email', type: 'email' }], rules: [{ id: 'r1', name: 'Notify', then: [{ type: 'email', to: ['team@leela.test'], subject: 'New' }] }] }],
    },
    registry,
  ).value;
}

describe('diffWebsites (field-level, sensitive entries)', () => {
  it('lists scripts individually with src host, plus analytics ids', () => {
    const base = site();
    const next = produce(base, (d) => {
      d.settings.scripts = [
        { id: 's1', name: 'Tracker', placement: 'head', src: 'https://evil.example.com/t.js', consentCategory: 'necessary', enabled: true },
        { id: 's2', name: 'Inline', placement: 'body-end', code: 'alert(1)', consentCategory: 'necessary', enabled: true },
      ];
      d.settings.analytics = { builtIn: true, googleAnalyticsId: 'G-123' };
    });
    const rows = diffWebsites(base, next);
    const scripts = rows.filter((r) => r.area === 'scripts');
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toMatchObject({ kind: 'added', label: 'Script: Tracker', sensitive: true });
    expect(scripts[0]!.detail).toContain('evil.example.com');
    expect(scripts[1]!.detail).toContain('inline code');
    expect(rows.find((r) => r.area === 'analytics')).toMatchObject({ id: 'analytics:googleAnalyticsId', detail: 'G-123', sensitive: true });
    // no generic "Site settings" row when only code/tracking changed
    expect(rows.some((r) => r.id === 'settings')).toBe(false);
  });

  it('shows form recipients and webhook hosts', () => {
    const base = site();
    const next = produce(base, (d) => {
      d.forms[0]!.rules[0]!.then = [
        { type: 'email', to: ['attacker@evil.test'], subject: 'x' },
        { type: 'webhook', url: 'https://hooks.evil.test/collect' },
        { type: 'sms', to: ['+15550100'], body: 'hi' },
      ];
    });
    const rule = diffWebsites(base, next).find((r) => r.area === 'formRules')!;
    expect(rule.sensitive).toBe(true);
    expect(rule.detail).toContain('attacker@evil.test');
    expect(rule.detail).toContain('hooks.evil.test');
    expect(rule.detail).toContain('SMS to +15550100');
  });

  it('covers redirects, custom CSS, global sections and page status/scripts/layout', () => {
    const base = site();
    const home = base.pages[0]!;
    const next = produce(base, (d) => {
      d.redirects = [{ id: 'rd1', source: '/old', destination: 'https://phish.example.net/login', statusCode: 302, enabled: true }];
      d.customCss = 'body{display:none}';
      d.globalSections = [{ id: 'g1', name: 'Promo', node: { id: 'n_g1', type: 'section', props: {} } }];
      const p = d.pages[0]!;
      p.status = 'published';
      p.scripts = { head: '<script src="https://x.test/a.js"></script>' };
      p.customCss = '.a{}';
      p.layout = { header: 'hidden', footer: 'default' };
      p.sections[0]!.customCss = '.hero{}';
    });
    const rows = diffWebsites(base, next);
    expect(rows.find((r) => r.area === 'redirects')).toMatchObject({ kind: 'added', label: 'Redirect /old', sensitive: true });
    expect(rows.find((r) => r.area === 'redirects')!.detail).toContain('phish.example.net');
    expect(rows.filter((r) => r.area === 'customCss').map((r) => r.id).sort()).toEqual(['customCss', home.id, home.sections[0]!.id].sort());
    expect(rows.find((r) => r.area === 'globalSection')).toMatchObject({ kind: 'added', label: 'Global section: Promo' });
    expect(rows.find((r) => r.area === 'status')).toMatchObject({ detail: 'draft → published', sensitive: true });
    expect(rows.find((r) => r.area === 'pageScripts')).toMatchObject({ kind: 'added', sensitive: true });
    expect(rows.find((r) => r.area === 'layout')!.detail).toContain('header hidden');
  });

  it('flags embeds and keeps plain content edits non-sensitive', () => {
    const base = site();
    const home = base.pages[0]!;
    const content = produce(base, (d) => void (d.pages[0]!.sections[0]!.props.heading = 'Hello'));
    const rows = diffWebsites(base, content);
    expect(rows).toEqual([{ kind: 'modified', scope: 'section', id: home.sections[0]!.id, label: 'hero: Hello', pageId: home.id }]);
    const embed = produce(base, (d) => void d.pages[0]!.sections.push({ id: 'n_embed', type: 'embed', props: { html: '<iframe src="https://x.test"></iframe>' } }));
    expect(diffWebsites(base, embed).find((r) => r.id === 'n_embed')).toMatchObject({ kind: 'added', area: 'embed', sensitive: true });
  });
});
