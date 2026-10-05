import { ThemeTokensSchema, type ThemeTokens, type ThemeTokensInput } from '@atrium/schema';

const base = {
  radius: { none: '0', sm: '2px', md: '4px', lg: '8px', xl: '14px', full: '9999px' },
  shadows: { sm: '0 1px 2px rgb(0 0 0 / 0.05)', md: '0 6px 20px -8px rgb(0 0 0 / 0.18)', lg: '0 24px 60px -24px rgb(0 0 0 / 0.28)' },
  borders: { width: '1px', style: 'solid' as const },
  containerWidths: { narrow: '46rem', default: '76rem', wide: '90rem', full: '100%' },
  spacing: { unit: 4, sectionY: 'regular' as const },
};

const status = { success: '#2F6B4F', warning: '#A86B1A', danger: '#A23B2E' };

function preset(input: Omit<ThemeTokensInput, 'radius' | 'shadows' | 'borders' | 'containerWidths' | 'spacing'> & Partial<ThemeTokensInput>): ThemeTokens {
  return ThemeTokensSchema.parse({ ...base, ...input });
}

export const THEME_PRESETS: Record<string, ThemeTokens> = {
  'editorial-warm': preset({
    name: 'Editorial Warm',
    colors: {
      primary: '#2E2A24', primaryContrast: '#F7F2EA', secondary: '#8A6E4B', accent: '#B5835A', background: '#F7F2EA',
      surface: '#EFE7DA', surfaceAlt: '#E6DCCB', text: '#26221D', muted: '#6E655A', border: '#D9CDBA', inverse: '#1F1C18',
      inverseText: '#F2EBDF', ...status,
    },
    typography: {
      heading: { family: 'Cormorant Garamond', source: 'google', weights: [400, 500, 600], italic: true, fallback: 'Georgia, serif' },
      body: { family: 'Manrope', source: 'google', weights: [400, 500, 600], italic: false, fallback: 'system-ui, sans-serif' },
      baseSize: 17, scale: 1.3, headingWeight: 500, headingLineHeight: 1.04, headingLetterSpacing: '-0.015em',
    },
    buttons: { radius: '0', textTransform: 'uppercase', letterSpacing: '0.14em', paddingY: '1.05em', paddingX: '2.1em', weight: 600 },
    motion: { intensity: 'moderate', ease: 'power3.out', duration: 1.1 },
    spacing: { unit: 4, sectionY: 'airy' },
  }),
  'earthy-eco': preset({
    name: 'Earthy Eco',
    colors: {
      primary: '#3B4A3A', primaryContrast: '#F3F0E6', secondary: '#7B8B5E', accent: '#C08B4C', background: '#F3F0E6',
      surface: '#E8E3D3', surfaceAlt: '#DCD5C0', text: '#232A22', muted: '#636B5C', border: '#CFC8B3', inverse: '#1E261E',
      inverseText: '#EEEADC', ...status,
    },
    typography: {
      heading: { family: 'Fraunces', source: 'google', weights: [300, 400, 500], italic: true, fallback: 'Georgia, serif' },
      body: { family: 'DM Sans', source: 'google', weights: [400, 500, 700], italic: false, fallback: 'system-ui, sans-serif' },
      baseSize: 17, scale: 1.28, headingWeight: 400, headingLineHeight: 1.06, headingLetterSpacing: '-0.02em',
    },
    buttons: { radius: '999px', textTransform: 'none', letterSpacing: '0', paddingY: '0.9em', paddingX: '1.7em', weight: 500 },
    motion: { intensity: 'subtle', ease: 'power2.out', duration: 1 },
    spacing: { unit: 4, sectionY: 'airy' },
  }),
  'corporate-modern': preset({
    name: 'Corporate Modern',
    colors: {
      primary: '#1D3FBF', primaryContrast: '#FFFFFF', secondary: '#0E1A33', accent: '#0F8B8D', background: '#FFFFFF',
      surface: '#F4F6FA', surfaceAlt: '#E9EDF5', text: '#0E1726', muted: '#556074', border: '#DDE2EC', inverse: '#0B1324',
      inverseText: '#E9EDF5', ...status,
    },
    typography: {
      heading: { family: 'Inter Tight', source: 'google', weights: [500, 600, 700], italic: false, fallback: 'system-ui, sans-serif' },
      body: { family: 'Inter', source: 'google', weights: [400, 500, 600], italic: false, fallback: 'system-ui, sans-serif' },
      baseSize: 16, scale: 1.25, headingWeight: 600, headingLineHeight: 1.1, headingLetterSpacing: '-0.025em',
    },
    buttons: { radius: '6px', textTransform: 'none', letterSpacing: '0', paddingY: '0.8em', paddingX: '1.4em', weight: 600 },
    motion: { intensity: 'subtle', ease: 'power2.out', duration: 0.7 },
    radius: { none: '0', sm: '4px', md: '6px', lg: '10px', xl: '16px', full: '9999px' },
  }),
  'wedding-blush': preset({
    name: 'Wedding Blush',
    colors: {
      primary: '#6F4A47', primaryContrast: '#FBF7F3', secondary: '#B08D57', accent: '#C9A27A', background: '#FBF7F3',
      surface: '#F3EAE3', surfaceAlt: '#EADDD3', text: '#2D2322', muted: '#7A6A66', border: '#E2D3C8', inverse: '#2B201F',
      inverseText: '#F6EEE8', ...status,
    },
    typography: {
      heading: { family: 'Bodoni Moda', source: 'google', weights: [400, 500], italic: true, fallback: 'Georgia, serif' },
      body: { family: 'Nunito Sans', source: 'google', weights: [400, 600], italic: false, fallback: 'system-ui, sans-serif' },
      accent: { family: 'Pinyon Script', source: 'google', weights: [400], italic: false, fallback: 'cursive' },
      baseSize: 17, scale: 1.3, headingWeight: 400, headingLineHeight: 1.08, headingLetterSpacing: '-0.01em',
    },
    buttons: { radius: '0', textTransform: 'uppercase', letterSpacing: '0.18em', paddingY: '1.1em', paddingX: '2.2em', weight: 600 },
    motion: { intensity: 'moderate', ease: 'power3.out', duration: 1.1 },
    spacing: { unit: 4, sectionY: 'airy' },
  }),
  'midnight-luxe': preset({
    name: 'Midnight Luxe',
    colorScheme: 'dark',
    colors: {
      primary: '#C8A96A', primaryContrast: '#121110', secondary: '#8C7A5B', accent: '#D9C08C', background: '#121110',
      surface: '#1B1A18', surfaceAlt: '#24221F', text: '#EDE6D8', muted: '#A39A8A', border: '#34312C', inverse: '#F2ECDF',
      inverseText: '#151412', ...status,
    },
    typography: {
      heading: { family: 'Cormorant', source: 'google', weights: [400, 500], italic: true, fallback: 'Georgia, serif' },
      body: { family: 'Jost', source: 'google', weights: [300, 400, 500], italic: false, fallback: 'system-ui, sans-serif' },
      baseSize: 17, scale: 1.32, headingWeight: 400, headingLineHeight: 1.02, headingLetterSpacing: '-0.01em',
    },
    buttons: { radius: '0', textTransform: 'uppercase', letterSpacing: '0.2em', paddingY: '1.1em', paddingX: '2.2em', weight: 500 },
    motion: { intensity: 'expressive', ease: 'expo.out', duration: 1.2 },
    spacing: { unit: 4, sectionY: 'airy' },
  }),
  'minimal-mono': preset({
    name: 'Minimal Mono',
    colors: {
      primary: '#111111', primaryContrast: '#FAFAF9', secondary: '#3A3A3A', accent: '#E4572E', background: '#FAFAF9',
      surface: '#F0F0EE', surfaceAlt: '#E6E6E3', text: '#111111', muted: '#66665F', border: '#DEDED9', inverse: '#111111',
      inverseText: '#FAFAF9', ...status,
    },
    typography: {
      heading: { family: 'Space Grotesk', source: 'google', weights: [400, 500, 600], italic: false, fallback: 'system-ui, sans-serif' },
      body: { family: 'IBM Plex Sans', source: 'google', weights: [400, 500], italic: false, fallback: 'system-ui, sans-serif' },
      baseSize: 16, scale: 1.333, headingWeight: 500, headingLineHeight: 1.02, headingLetterSpacing: '-0.035em',
    },
    buttons: { radius: '0', textTransform: 'none', letterSpacing: '0', paddingY: '0.85em', paddingX: '1.5em', weight: 500 },
    motion: { intensity: 'subtle', ease: 'power4.out', duration: 0.8 },
    radius: { none: '0', sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },
  }),
  'bistro-classic': preset({
    name: 'Bistro Classic',
    colors: {
      primary: '#6B1E1A', primaryContrast: '#F8F1E4', secondary: '#2B3A2F', accent: '#C2943F', background: '#F8F1E4',
      surface: '#EFE4D0', surfaceAlt: '#E5D6BC', text: '#231A15', muted: '#6F6255', border: '#DCCBB0', inverse: '#1F1714',
      inverseText: '#F4EADB', ...status,
    },
    typography: {
      heading: { family: 'DM Serif Display', source: 'google', weights: [400], italic: true, fallback: 'Georgia, serif' },
      body: { family: 'Work Sans', source: 'google', weights: [400, 500, 600], italic: false, fallback: 'system-ui, sans-serif' },
      baseSize: 17, scale: 1.27, headingWeight: 400, headingLineHeight: 1.05, headingLetterSpacing: '-0.01em',
    },
    buttons: { radius: '2px', textTransform: 'uppercase', letterSpacing: '0.12em', paddingY: '0.95em', paddingX: '1.9em', weight: 600 },
  }),
};

export const DEFAULT_THEME = THEME_PRESETS['editorial-warm']!;
