import type { NextConfig } from 'next';

const API_ORIGIN = (process.env.ATRIUM_API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Optional separate output dir (e.g. NEXT_DIST_DIR=.next-perf for side-by-side builds).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@atrium/ui', '@atrium/renderer-core'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  async rewrites() {
    // Same-origin API proxy so the httpOnly refresh cookie works. `/api/v1/auth/*`
    // is handled by a route handler (src/app/api/v1/auth) that also rewrites the
    // refresh-cookie path; `fallback` rewrites run after app routes (incl. dynamic
    // ones), so that handler wins and everything else is proxied here.
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: '/api/:path*', destination: `${API_ORIGIN}/:path*` }] };
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
