/** Renderer configuration (server-only). */
export const SOURCE: 'api' | 'file' = process.env.ATRIUM_SNAPSHOT_SOURCE === 'file' ? 'file' : 'api';
export const IS_EXPORT = process.env.ATRIUM_STATIC_EXPORT === '1';

const rawApi = (process.env.ATRIUM_API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
/** Internal API base including `/v1`. */
export const API_V1 = rawApi.endsWith('/v1') ? rawApi : `${rawApi}/v1`;
export const RENDERER_SECRET = process.env.RENDERER_SECRET ?? '';
/** `{slug}.{PLATFORM_SITES_DOMAIN}` hosts the platform subdomains (e.g. sites.localhost:3001). */
export const PLATFORM_SITES_DOMAIN = (process.env.PLATFORM_SITES_DOMAIN ?? 'sites.localhost:3001').toLowerCase();
/** Seconds a resolved snapshot stays fresh before background revalidation. */
export const SNAPSHOT_REVALIDATE = 300;
/** Public API base used by the browser when the snapshot does not carry one. */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_ATRIUM_API_URL ?? process.env.ATRIUM_PUBLIC_API_URL;
