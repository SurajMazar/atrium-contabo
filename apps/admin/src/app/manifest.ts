import type { MetadataRoute } from 'next';

/** Installable PWA manifest for the Atrium admin (not for published sites). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Atrium',
    short_name: 'Atrium',
    description: 'Build, manage and publish websites.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f7f7f5',
    theme_color: '#f7f7f5',
    categories: ['productivity', 'business', 'developer'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Websites', url: '/' },
      { name: 'Account', url: '/account' },
    ],
  };
}
