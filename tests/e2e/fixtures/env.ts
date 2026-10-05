import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * Environment for the e2e suite. Every URL can be overridden with an env var so the
 * same specs run against a local `pnpm atrium start`, CI, or a staging stack.
 */
function url(name: string, fallback: string): string {
  return (process.env[name]?.trim() || fallback).replace(/\/+$/, '');
}

export const env = {
  /** Admin + builder (Next.js). Also the Playwright `baseURL`. */
  adminURL: url('E2E_ADMIN_URL', 'http://localhost:3000'),
  /** REST API origin (without `/v1`). */
  apiURL: url('E2E_API_URL', 'http://localhost:4000'),
  /** Public renderer origin (preview links live here: `/_preview/<token>`). */
  rendererURL: url('E2E_RENDERER_URL', 'http://localhost:3001'),
  /** Tenant sites are served at `<protocol>://<slug>.<sitesDomain>`. Chromium resolves `*.localhost` to loopback. */
  sitesDomain: (process.env.E2E_SITES_DOMAIN?.trim() || 'sites.localhost:3001')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, ''),
  sitesProtocol: (process.env.E2E_SITES_PROTOCOL?.trim() || 'http').replace(/:$/, ''),
  /** Mailpit HTTP API/UI (dev SMTP sink). */
  mailpitURL: url('E2E_MAILPIT_URL', 'http://localhost:58025'),
  /** Set E2E_SKIP_EMAIL=1 to skip Mailpit assertions (e.g. no worker or SMTP in the target stack). */
  skipEmail: ['1', 'true', 'yes'].includes((process.env.E2E_SKIP_EMAIL ?? '').toLowerCase()),
  isCI: !!process.env.CI,
} as const;

/** Directory for per-user Playwright storage state (git-ignored). */
export const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

/** Password that satisfies both the admin form rules and the API policy (>= 10 chars, 3 of 4 classes). */
export const TEST_PASSWORD = process.env.E2E_PASSWORD || 'E2e-Atrium-Passw0rd!';

/** Absolute API URL for a `/v1` route, e.g. `apiV1('/auth/me')`. */
export function apiV1(route: string): string {
  return `${env.apiURL}/v1${route.startsWith('/') ? route : `/${route}`}`;
}

/** Public URL of a tenant site on the platform domain. */
export function siteURL(slug: string, pagePath = '/'): string {
  return `${env.sitesProtocol}://${slug}.${env.sitesDomain}${pagePath.startsWith('/') ? pagePath : `/${pagePath}`}`;
}

/** Short random suffix, lowercase alphanumeric (safe for slugs, emails and form names). */
export function rand(len = 6): string {
  return randomBytes(len)
    .toString('base64url')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, len)
    .padEnd(len, '0');
}

/** Unique, sortable id: `<prefix>-<base36 time>-<rand>`. Lowercase, slug-safe. */
export function uniqueId(prefix = 'e2e'): string {
  return `${prefix}-${Date.now().toString(36)}-${rand(5)}`;
}

/** Unique test mailbox: `e2e+<timestamp>-<rand>@atrium.test`. */
export function uniqueEmail(tag = 'e2e'): string {
  return `${tag}+${Date.now()}-${rand(6)}@atrium.test`;
}

/** Unique, slug-safe identifier no longer than `max` characters. */
export function uniqueSlug(prefix = 'e2e', max = 40): string {
  return uniqueId(prefix).slice(0, max).replace(/-+$/, '');
}
