/**
 * Per-site configuration. Content comes from each site's own data modules (see extract.ts); this
 * file only records what differs in *presentation* between the two builds and where the copy that
 * lives in page JSX (not in data/) differs between them.
 */
export interface SiteConfig {
  key: 'leela-garden' | 'vilasa-by-leela';
  root: string;
  /** Name of the imported website in Atrium. */
  websiteName: string;
  palette: Record<string, string> & { shadowRgb: string };
  /** The second accent: moss green (Leela) or the sign's mid bronze (Vilasa). */
  accentKey: 'moss' | 'bronze';
  logo: {
    /** Path under public/ of the header mark. */
    mark: string;
    width: number;
    height: number;
    /** Header heights at base / md / xl. */
    h: [string, string | null, string];
    gap: string;
    /** Wordmark set beside the mark in the display face (Leela only). */
    wordmark?: string;
  };
  /** The full sign shown in the footer instead of the name in type (Vilasa only). */
  footerLogo?: { src: string; width: number; height: number };
  hideNativeCursor: boolean;
  lenisLerp: number;
  navCaptions: string[];
  /** SITE.shortName — the title of the full-screen menu. */
  shortName: string;
  copy: {
    /** Venue page CTA lead. */
    venueCtaLead: string;
  };
}

export const SITES: SiteConfig[] = [
  {
    key: 'leela-garden',
    root: '/Users/surajthapa/personal/Lela-Garden',
    websiteName: 'Leela Garden',
    palette: {
      cream: '#fdfcf8', charcoal: '#1c1c1c', gold: '#d9a21b', stone: '#62615c', moss: '#4a5d4e',
      surface: '#faf9f5', surfaceLow: '#f4f4f0', surfaceMid: '#efeeea', surfaceVariant: '#e3e2df',
      goldDeep: '#7a5900', goldLight: '#f8bd39', goldInk: '#8f630c', ink: '#3e3d39', shadowRgb: '28 28 28',
    },
    accentKey: 'moss',
    logo: { mark: 'brand/leela-monogram.png', width: 289, height: 240, h: ['2.25rem', null, '2.75rem'], gap: '.625rem', wordmark: 'Leela Garden' },
    hideNativeCursor: true,
    lenisLerp: 0.18,
    navCaptions: [],
    shortName: '',
    copy: { venueCtaLead: 'Eight hundred guests are difficult to picture from a photograph. Book a viewing and stand in the middle of it.' },
  },
  {
    key: 'vilasa-by-leela',
    root: '/Users/surajthapa/personal/vilasa-by-leela',
    websiteName: 'Vilasa by Leela',
    palette: {
      cream: '#fbf7ee', charcoal: '#22180c', gold: '#c9a25a', stone: '#6b6052', bronze: '#7b5e34',
      surface: '#f8f3e8', surfaceLow: '#f2ecdf', surfaceMid: '#ece4d4', surfaceVariant: '#e0d6c3',
      goldDeep: '#6e4f1c', goldLight: '#e8c98a', goldInk: '#835e1c', ink: '#3d3126', shadowRgb: '34 24 12',
    },
    accentKey: 'bronze',
    logo: { mark: 'brand/vilasa-mark.png', width: 242, height: 192, h: ['3rem', '3.5rem', '4rem'], gap: '0' },
    footerLogo: { src: 'brand/vilasa-logo.png', width: 599, height: 720 },
    hideNativeCursor: false,
    lenisLerp: 0.15,
    navCaptions: [],
    shortName: '',
    copy: { venueCtaLead: 'Eight hundred seats is difficult to picture from a photograph. Book a viewing and stand in the middle of it.' },
  },
];
