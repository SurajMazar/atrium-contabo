import type { NextConfig } from 'next';

const API_ORIGIN = (process.env.ATRIUM_API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const dev = process.env.NODE_ENV !== 'production';
/** Served over https (real deployments). Local runs — including `next start` on localhost — are not. */
const httpsDeploy = /^https:\/\//.test(process.env.ADMIN_URL ?? '') && !/localhost|127\.0\.0\.1/.test(process.env.ADMIN_URL ?? '');
const local = !httpsDeploy;
const LOCAL_SRC = ' http://localhost:* http://127.0.0.1:* http://*.localhost:*';

/**
 * Admin/builder CSP. The builder canvas is a same-origin srcdoc iframe and inherits this policy,
 * so customer content rendered there is held to it too. Scripts may only come from this origin
 * (Next needs inline bootstrap scripts; a nonce-based policy is the next step), the admin can only
 * talk to itself (API calls go through the same-origin /api proxy), and nobody may frame it.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:" + (local ? LOCAL_SRC : ''),
  "font-src 'self' data: https:" + (local ? LOCAL_SRC : ''),
  "media-src 'self' blob: https:" + (local ? LOCAL_SRC : ''),
  `connect-src 'self'${dev ? ` ws:${LOCAL_SRC}` : ''}`,
  "frame-src 'self' https:" + (local ? LOCAL_SRC : ''),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(httpsDeploy ? ['upgrade-insecure-requests'] : []),
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(httpsDeploy ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
];

const nextConfig: NextConfig = {
  // Optional separate output dir (e.g. NEXT_DIST_DIR=.next-perf for side-by-side builds).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  experimental: {
    // The /api/v1 rewrite buffers a copy of each proxied body in memory up to this size, before
    // the API has authenticated anything. Large uploads (site imports, media) therefore use the
    // streaming route handlers in src/app/api/v1/organizations/[orgId]/…; everything else is JSON.
    proxyClientMaxBodySize: '25mb',
    // Long AI generation progress streams and slow API responses.
    proxyTimeout: 10 * 60_000,
  },
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
    // User uploads (`/v1/storage/*`) and public endpoints are deliberately NOT proxied: hostile
    // files must never be served from the admin origin, where the session cookie lives.
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [{ source: '/api/v1/:path((?!storage(?:/|$)|public(?:/|$)).*)', destination: `${API_ORIGIN}/v1/:path` }],
    };
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
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
