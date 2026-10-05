import { normalizeWebsite } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { DEFAULT_THEME } from '@atrium/design-tokens';
import type { WebsiteDefinition } from '@atrium/schema';

/** Small but realistic site: home (hero + section › stack › heading/text/button) and an empty About page. */
export function makeSite(): WebsiteDefinition {
  const { value } = normalizeWebsite(
    {
      settings: { name: 'Test', business: { name: 'Test Co' }, seo: { siteTitle: 'Test' } },
      theme: DEFAULT_THEME,
      header: { type: 'site-header', props: {} },
      footer: { type: 'site-footer', props: {} },
      navigation: { menus: { primary: [{ id: 'n1', label: 'Home', link: '/' }] } },
      pages: [
        {
          id: 'home',
          title: 'Home',
          slug: '',
          isHomepage: true,
          sections: [
            { id: 'hero', type: 'hero', props: { heading: 'Welcome' } },
            {
              id: 'sec',
              type: 'section',
              props: {},
              children: [
                {
                  id: 'stack',
                  type: 'stack',
                  props: {},
                  children: [
                    { id: 'h1', type: 'heading', props: { text: 'Hello' } },
                    { id: 't1', type: 'text', props: { text: 'Body copy' } },
                    { id: 'b1', type: 'button', props: { label: 'Go' } },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'about', title: 'About', slug: 'about', sections: [] },
      ],
    },
    registry,
  );
  return value;
}
