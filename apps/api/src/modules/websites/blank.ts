import { DEFAULT_THEME, THEME_PRESETS } from '@atrium/design-tokens';
import type { WebsiteInput } from '@atrium/schema';

/** Minimal but tasteful starting point for a blank website. */
export function blankWebsite(name: string, presetKey?: string): WebsiteInput {
  const theme = (presetKey && THEME_PRESETS[presetKey]) || DEFAULT_THEME;
  return {
    settings: {
      name,
      business: { name, description: '' },
      seo: { siteTitle: name, titleTemplate: '%s — {site}', description: '' },
    },
    theme,
    navigation: { menus: { primary: [{ id: '', label: 'Home', link: '/' }, { id: '', label: 'Contact', link: '/contact' }], footer: [], legal: [] } },
    header: { type: 'site-header', variant: 'classic', props: { menu: 'primary', cta: { label: 'Get in touch', link: '/contact', style: 'primary', iconPosition: 'end' } } },
    footer: { type: 'site-footer', variant: 'columns', props: { description: '{{business.description}}' } },
    pages: [
      {
        title: 'Home', slug: '', isHomepage: true, status: 'draft',
        seo: { title: name, description: `Welcome to ${name}.` },
        sections: [
          { type: 'hero', variant: 'minimal', props: { eyebrow: 'Welcome', heading: name, subheading: 'Start editing this page in the builder — or ask AI to draft it for you.', buttons: [{ label: 'Get in touch', link: '/contact', style: 'primary', iconPosition: 'end' }], tone: 'default', height: 'tall' } },
        ],
      },
      {
        title: 'Contact', slug: 'contact', status: 'draft',
        seo: { title: 'Contact', description: `Get in touch with ${name}.` },
        sections: [{ type: 'section', props: {}, children: [{ type: 'heading', props: { text: 'Contact us', level: 'h1' } }, { type: 'text', props: { text: 'We usually reply within one business day.' } }] }],
      },
    ],
  };
}
