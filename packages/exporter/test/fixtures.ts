import { normalizeWebsite } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { THEME_PRESETS } from '@atrium/design-tokens';
import type { SiteSnapshot, WebsiteDefinition, WebsiteInput } from '@atrium/schema';

export function sampleInput(): WebsiteInput {
  const theme = Object.values(THEME_PRESETS)[0]!;
  return {
    settings: {
      name: 'Aranya Lake Retreat',
      business: { name: 'Aranya Lake Retreat', email: 'stay@aranya.example', address: {} },
      seo: { siteTitle: 'Aranya', titleTemplate: '%s · Aranya', ogImage: 'https://cdn.example.com/og.jpg' },
      branding: { logo: 'https://cdn.example.com/logo.svg' },
    },
    theme,
    header: { type: 'site-header', props: {} },
    footer: { type: 'site-footer', props: {} },
    pages: [
      { title: 'Home', slug: '', isHomepage: true, sections: [{ type: 'hero', props: { heading: 'Welcome', image: { src: 'https://cdn.example.com/media/hero.webp', mediaId: 'm1', alt: 'Lake' } } }] },
      { title: 'Rooms', slug: 'rooms', sections: [{ type: 'section', props: {}, customCss: '& { background: url("/media/bg.png") }' } as never] },
      { title: 'Deluxe', slug: 'rooms/deluxe', sections: [] },
    ],
    forms: [{ name: 'Contact', slug: 'contact', fields: [{ id: 'f1', type: 'email', name: 'email', label: 'Email', required: true }], rules: [{ id: 'notify', name: 'Notify', then: [{ type: 'webhook', url: 'https://hooks.example.com/secret-capability' }] }] } as never],
    collections: [{ slug: 'rooms', name: 'Rooms', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'photo', label: 'Photo', type: 'image' }], items: [{ id: 'i1', slug: 'suite', data: { name: 'Suite', photo: 'https://cdn.example.com/media/suite.jpg' } }] } as never],
  };
}

export function sampleDefinition(): WebsiteDefinition {
  return normalizeWebsite(sampleInput(), registry).value;
}

export function sampleSnapshot(definition = sampleDefinition()): SiteSnapshot {
  return { websiteId: 'w_123', versionId: 'v_1', version: 3, publishedAt: '2026-10-01T00:00:00.000Z', apiBaseUrl: 'https://api.atrium.example', definition, runtime: { captcha: {} } };
}
