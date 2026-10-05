import { normalizeWebsite, validateWebsite } from '@atrium/builder-core';
import { createRegistry } from '@atrium/component-registry';
import { THEME_PRESETS } from '@atrium/design-tokens';
import type { WebsiteInput } from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, DEMO_SITES, PAGE_TEMPLATES, SECTION_TEMPLATES, getBlueprint, type BlueprintInput } from './index';

const registry = createRegistry();

const FULL_INPUT: BlueprintInput = {
  businessName: 'Test Business',
  tagline: 'A tagline that sets the tone',
  description: 'A description of the business that is long enough to make a reasonable meta description for search engines and social cards.',
  location: 'Pokhara, Nepal',
  phone: '+977 61 555 0100',
  email: 'hello@example.com',
  address: 'Lakeside Road 12, Pokhara, Nepal',
  social: { instagram: 'https://instagram.com/example', facebook: 'https://facebook.com/example' },
  themePreset: 'editorial-warm',
};

function check(input: WebsiteInput, label: string) {
  const { value, issues } = normalizeWebsite(input, registry);
  expect(issues, `${label}: normalize issues`).toEqual([]);
  const report = validateWebsite(value, registry);
  const failing = report.checks.filter((c) => c.status === 'fail');
  expect(failing, `${label}: failing validation checks`).toEqual([]);
  return { value, report };
}

describe('blueprints', () => {
  it('exposes the required catalog', () => {
    expect(BLUEPRINTS.map((b) => b.key).sort()).toEqual(
      ['corporate', 'creative-agency', 'hospitality-resort', 'minimal-hotel', 'portfolio', 'real-estate', 'restaurant', 'saas', 'wedding-venue'].sort(),
    );
    expect(getBlueprint('restaurant')?.key).toBe('restaurant');
    expect(getBlueprint('nope')).toBeUndefined();
  });
  for (const bp of BLUEPRINTS) {
    it(`${bp.key} builds a valid website from full input`, () => {
      const { value, report } = check(bp.build(FULL_INPUT), bp.key);
      expect(value.settings.name).toBe('Test Business');
      expect(report.checks.find((c) => c.id === 'navigation')?.status).toBe('pass');
      expect(report.checks.find((c) => c.id === 'links')?.status, JSON.stringify(report.checks.find((c) => c.id === 'links')?.details)).toBe('pass');
    });
    it(`${bp.key} builds from minimal input and every theme preset`, () => {
      check(bp.build({ businessName: 'Minimal Co' }), `${bp.key} minimal`);
      for (const preset of Object.keys(THEME_PRESETS)) check(bp.build({ businessName: 'Preset Co', themePreset: preset }), `${bp.key} ${preset}`);
    });
  }
});

describe('demo sites', () => {
  it('ships three demos', () => expect(DEMO_SITES).toHaveLength(3));
  for (const demo of DEMO_SITES) {
    it(`${demo.key} is valid with zero issues`, () => {
      const { value, report } = check(demo.website, demo.key);
      for (const id of ['navigation', 'links', 'forms', 'alt', 'references']) {
        const c = report.checks.find((x) => x.id === id);
        expect(c?.status, `${demo.key} ${id}: ${JSON.stringify(c?.details)}`).toBe('pass');
      }
      expect(value.pages.length).toBeGreaterThanOrEqual(6);
      for (const p of value.pages) {
        expect(p.seo.title, `${demo.key}/${p.slug} seo.title`).toBeTruthy();
        expect(p.seo.description, `${demo.key}/${p.slug} seo.description`).toBeTruthy();
        expect(p.status).toBe('published');
      }
    });
  }
  it('Aranya has a rooms collection with a detail template', () => {
    const { value } = normalizeWebsite(DEMO_SITES.find((d) => d.key === 'aranya-lake-retreat')!.website, registry);
    const rooms = value.collections.find((c) => c.slug === 'rooms');
    expect(rooms?.items.length).toBeGreaterThanOrEqual(4);
    expect(value.pages.some((p) => p.kind === 'collection-template' && p.collection === 'rooms')).toBe(true);
  });
  it('Rosewood routes large weddings to the events team', () => {
    const { value } = normalizeWebsite(DEMO_SITES.find((d) => d.key === 'rosewood-courtyard')!.website, registry);
    const form = value.forms.find((f) => f.fields.some((x) => x.name === 'guestCount'));
    expect(form).toBeTruthy();
    const rule = form!.rules.find((r) => JSON.stringify(r.when ?? {}).includes('guestCount'));
    expect(rule?.then.some((a) => a.type === 'email')).toBe(true);
    expect(rule?.then.some((a) => a.type === 'tag' && a.tags.includes('large-event'))).toBe(true);
  });
});

describe('section templates', () => {
  it('has at least 25 sections across categories', () => {
    expect(SECTION_TEMPLATES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SECTION_TEMPLATES.map((s) => s.key)).size).toBe(SECTION_TEMPLATES.length);
  });
  for (const t of SECTION_TEMPLATES) {
    it(`${t.key} normalizes cleanly`, () => {
      const { issues } = registry.normalize(t.node);
      expect(issues).toEqual([]);
      expect(registry.get(t.node.type)?.level).toBe('section');
    });
  }
});

describe('page templates', () => {
  it('covers the common pages', () => {
    const keys = PAGE_TEMPLATES.map((p) => p.key);
    for (const k of ['about', 'contact', 'rooms', 'gallery', 'faq', 'pricing', 'team', 'blog']) expect(keys).toContain(k);
  });
  for (const t of PAGE_TEMPLATES) {
    it(`${t.key} normalizes cleanly inside a site`, () => {
      const site: WebsiteInput = {
        settings: { name: 'T', business: { name: 'T' }, seo: { siteTitle: 'T' } },
        theme: THEME_PRESETS['editorial-warm']!,
        header: { type: 'site-header', props: {} },
        footer: { type: 'site-footer', props: {} },
        pages: [{ title: 'Home', slug: '', isHomepage: true, sections: [] }, t.page],
      };
      const { issues } = normalizeWebsite(site, registry);
      expect(issues).toEqual([]);
    });
  }
});
