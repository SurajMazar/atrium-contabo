import { THEME_PRESETS } from '@atrium/design-tokens';
import { SOCIAL_NETWORKS, slugify, type SiteSettingsInput, type SocialLink, type ThemeTokensInput } from '@atrium/schema';
import type { BlueprintInput } from './types';

type Network = (typeof SOCIAL_NETWORKS)[number];

/** Deep copy of a design-tokens preset, optionally overridden. Falls back to `fallback` for unknown keys. */
export function themeFrom(key: string | undefined, fallback: string, overrides: Partial<ThemeTokensInput> = {}): ThemeTokensInput {
  const base = THEME_PRESETS[key ?? ''] ?? THEME_PRESETS[fallback] ?? Object.values(THEME_PRESETS)[0]!;
  return { ...(JSON.parse(JSON.stringify(base)) as ThemeTokensInput), ...overrides };
}

/** Social map ({ instagram: 'https://…' }) → settings.social entries. Unknown networks become `custom`. */
export function socialFrom(map: Record<string, string> | undefined): SocialLink[] {
  return Object.entries(map ?? {})
    .filter(([, url]) => !!url)
    .map(([network, url]) => {
      const known = (SOCIAL_NETWORKS as readonly string[]).includes(network);
      return { id: `social-${slugify(network)}`, network: (known ? network : 'custom') as Network, url, label: known ? undefined : network, visible: true, newTab: true };
    });
}

/** Placeholder profiles so footers/social components have something to render until the owner edits them. */
export const PLACEHOLDER_SOCIAL = { instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/' };

/** Split a free-form address into the structured BusinessInfo shape (keeps the original as `formatted`). */
export function addressFrom(address: string | undefined, location?: string) {
  const formatted = address ?? location;
  if (!formatted) return {};
  const parts = formatted.split(',').map((p) => p.trim()).filter(Boolean);
  return { formatted, street: parts.length > 2 ? parts[0] : undefined, locality: parts.length > 1 ? parts[parts.length - 2] : parts[0], country: parts.length > 1 ? parts[parts.length - 1] : undefined };
}

/** Common settings scaffold for blueprints. */
export function settingsFrom(input: BlueprintInput, opts: { type: string; description: string; titleSuffix?: string; structuredData?: Array<'Organization' | 'LocalBusiness' | 'Hotel' | 'Resort' | 'Restaurant' | 'EventVenue' | 'WebSite' | 'Service'> }): SiteSettingsInput {
  const name = input.businessName.trim();
  const description = input.description ?? opts.description;
  return {
    name,
    business: {
      name,
      type: opts.type,
      tagline: input.tagline,
      description,
      phone: input.phone,
      email: input.email,
      address: addressFrom(input.address, input.location),
      openingHours: [],
    },
    social: socialFrom(input.social ?? PLACEHOLDER_SOCIAL),
    branding: { wordmark: name },
    seo: {
      siteTitle: name,
      titleTemplate: `%s — ${name}`,
      description: description.slice(0, 300),
      robots: { index: true, follow: true },
      structuredData: (opts.structuredData ?? ['Organization', 'WebSite']).map((type) => ({ type, auto: true })),
      verification: {},
    },
    localization: { defaultLocale: 'en', locales: ['en'], strategy: 'prefix-except-default' },
    scripts: [],
    cookieConsent: { enabled: false, title: 'We value your privacy', message: 'We use cookies to improve your experience and measure site performance.', categories: ['necessary', 'analytics', 'marketing'], position: 'bottom-left' },
    analytics: { builtIn: true },
    variables: {},
  };
}
