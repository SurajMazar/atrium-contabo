import type { WebsiteDefinition } from '@atrium/schema';

/** Variables available to `{{…}}` templates in component props. */
export function buildTemplateScope(def: Pick<WebsiteDefinition, 'settings'>, extras: { domain?: string; locale?: string; page?: { title: string; slug: string } } = {}) {
  const s = def.settings;
  return {
    business: { ...s.business, address: s.business.address?.formatted ?? [s.business.address?.street, s.business.address?.locality, s.business.address?.country].filter(Boolean).join(', ') },
    website: { name: s.name, domain: extras.domain ?? '', locale: extras.locale ?? s.localization.defaultLocale },
    vars: s.variables,
    social: Object.fromEntries(s.social.map((l) => [l.network, l.url])),
    page: extras.page,
    year: new Date().getFullYear(),
  };
}
