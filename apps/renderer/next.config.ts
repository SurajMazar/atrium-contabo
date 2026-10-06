import type { NextConfig } from 'next';

/**
 * Keep this file minimal: the exporter (packages/exporter) overwrites it for standalone projects.
 * - ATRIUM_STATIC_EXPORT=1 → `output: 'export'`; files named `*.platform.ts(x)` (proxy, multi-tenant
 *   routes, revalidate/preview APIs) are excluded via pageExtensions because they need a server.
 */
const isExport = process.env.ATRIUM_STATIC_EXPORT === '1';

const config: NextConfig = {
  transpilePackages: ['@atrium/renderer-core', '@atrium/schema', '@atrium/design-tokens', '@atrium/animations', '@atrium/component-registry', '@atrium/builder-core'],
  pageExtensions: isExport ? ['tsx', 'ts'] : ['platform.tsx', 'platform.ts', 'tsx', 'ts'],
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // app/global-not-found.tsx renders the site's own 404 (also the exported 404.html).
  experimental: {
    globalNotFound: true,
    // Pages preloaded or visited through ClientLinks stay in the browser's router cache until the
    // visitor reloads (sites opt out per website: settings → Page loading → Keep visited pages).
    staleTimes: { static: 60 * 60 * 24, dynamic: 0 },
  },
  ...(isExport ? { output: 'export' as const, trailingSlash: true } : {}),
};

export default config;
