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

/*
 * Production policy — the renderer subset of @atrium/server-kit `assertProductionSecrets`
 * (packages/server-kit/src/production-secrets.ts). It is mirrored here instead of imported because the
 * exporter vendors the renderer's @atrium/* dependencies into standalone projects, and server-kit
 * (Prisma, BullMQ…) must not end up there. Keep the two in sync.
 */
const EXAMPLE_SECRETS = ['change-me-renderer-secret', 'change-me-access-secret-change-me-access-secret', 'change-me-refresh-secret-change-me-refresh-secret', 'change-me-analytics-salt'];
const LOOPBACK_HOST = /^(localhost|.*\.localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\]|::1?)$/i;
const isLoopbackHost = (host: string) => LOOPBACK_HOST.test(host.replace(/:\d+$/, ''));

function secretProblem(value: string | undefined): string | undefined {
  if (!value) return 'is not set';
  if (EXAMPLE_SECRETS.some((e) => value.includes(e))) return 'is (derived from) the .env.example value';
  if (/change[-_ ]?me|replace[-_ ]?me/i.test(value)) return 'contains a placeholder';
  if (value.length < 32) return 'is shorter than 32 characters';
  if (new Set(value).size < 8) return 'has too few distinct characters';
  return undefined;
}

/** Problems that would make a production renderer insecure (empty = fine). */
export function rendererProductionIssues(env: Record<string, string | undefined> = process.env): string[] {
  // Exported/static single-site builds read site.json and never talk to the API.
  if (env.ATRIUM_SNAPSHOT_SOURCE === 'file' || env.ATRIUM_STATIC_EXPORT === '1') return [];
  const issues: string[] = [];
  const secret = secretProblem(env.RENDERER_SECRET);
  if (secret) issues.push(`RENDERER_SECRET ${secret} (generate with \`atrium config set RENDERER_SECRET --generate\`)`);
  const domain = (env.PLATFORM_SITES_DOMAIN ?? 'sites.localhost:3001').toLowerCase();
  const publicUrls = [env.RENDERER_URL, env.NEXT_PUBLIC_ATRIUM_API_URL, env.ATRIUM_PUBLIC_API_URL].filter((v): v is string => !!v);
  const hosts = [domain, ...publicUrls.map((u) => { try { return new URL(u).host; } catch { return u; } })];
  const allowLoopback = ['1', 'true'].includes((env.ATRIUM_ALLOW_LOCALHOST_PRODUCTION ?? '').toLowerCase()) && hosts.every(isLoopbackHost);
  if (!allowLoopback) {
    if (isLoopbackHost(domain)) issues.push(`PLATFORM_SITES_DOMAIN "${domain}" points at localhost`);
    for (const u of publicUrls) {
      let url: URL | undefined;
      try { url = new URL(u); } catch { issues.push(`"${u}" is not a URL`); continue; }
      if (url.protocol !== 'https:') issues.push(`"${u}" must use https://`);
      else if (isLoopbackHost(url.hostname)) issues.push(`"${u}" points at localhost`);
    }
  }
  return issues;
}

/**
 * Called from instrumentation.ts when the server boots (not during `next build`).
 * NODE_ENV=production → throws (the server refuses to start); otherwise warns about a weak secret.
 */
export function assertRendererProductionEnv(env: Record<string, string | undefined> = process.env): void {
  const issues = rendererProductionIssues(env);
  if (!issues.length) return;
  // `next start` forces NODE_ENV=production; ATRIUM_DEPLOY_ENV (set by scripts/with-env.mjs from the
  // root .env) tells a local production-mode run apart from a real deployment.
  const deployEnv = env.ATRIUM_DEPLOY_ENV ?? env.NODE_ENV;
  if (deployEnv === 'production') {
    throw new Error(`Refusing to start: insecure production configuration (NODE_ENV=production):\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
  const secretIssues = issues.filter((i) => i.startsWith('RENDERER_SECRET'));
  if (secretIssues.length && deployEnv === 'development') console.warn(`[atrium] renderer: ${secretIssues.join('; ')} — fine for local development, refused in production`);
}
