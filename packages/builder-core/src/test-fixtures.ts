import type { ThemeTokensInput } from '@atrium/schema';

export const DEFAULT_TEST_THEME: ThemeTokensInput = {
  colors: { primary: '#111', primaryContrast: '#fff', secondary: '#333', accent: '#c00', background: '#fff', surface: '#f5f5f5', surfaceAlt: '#eee', text: '#111', muted: '#666', border: '#ddd', inverse: '#111', inverseText: '#fff', success: '#0a0', warning: '#a60', danger: '#a00' },
  typography: { heading: { family: 'Inter' }, body: { family: 'Inter' } },
  spacing: { unit: 4 },
  radius: { sm: '2px', md: '4px', lg: '8px', xl: '12px' },
  shadows: { sm: 'none', md: 'none', lg: 'none' },
  borders: {},
  containerWidths: { narrow: '40rem', default: '72rem', wide: '90rem' },
};
