import { APP_SECRETS, assessSecret } from './secrets';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info' | 'skip';

export interface CheckResult {
  group: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  hint?: string;
}

const isLocalUrl = (v: string | undefined) =>
  !!v && /(localhost|127\.0\.0\.1|\[::1\]|\.localhost\b)/.test(v);

/** Secret strength for the core app secrets. */
export function secretChecks(
  env: Record<string, string | undefined>,
  group = 'Secrets',
): CheckResult[] {
  return Object.keys(APP_SECRETS).map((key) => {
    const a = assessSecret(key, env[key]);
    return a.ok
      ? { group, label: key, status: 'ok' as const, detail: 'strong' }
      : {
          group,
          label: key,
          status:
            env.NODE_ENV === 'production' || a.reason === 'missing' || a.reason === 'wrong-length'
              ? ('fail' as const)
              : ('warn' as const),
          detail: a.message,
          hint: `atrium config set ${key} --generate`,
        };
  });
}

/**
 * Production readiness lint for an env (used by `setup check` and by `doctor`
 * when NODE_ENV=production).
 */
export function productionChecks(env: Record<string, string | undefined>): CheckResult[] {
  const g = 'Production';
  const out: CheckResult[] = [];
  const add = (label: string, ok: boolean, detail: string, hint?: string, warnOnly = false) =>
    out.push({
      group: g,
      label,
      status: ok ? 'ok' : warnOnly ? 'warn' : 'fail',
      detail: ok ? undefined : detail,
      hint: ok ? undefined : hint,
    });

  add(
    'NODE_ENV=production',
    env.NODE_ENV === 'production',
    `NODE_ENV is "${env.NODE_ENV ?? ''}"`,
    'atrium config set NODE_ENV production',
  );
  for (const k of ['ADMIN_URL', 'API_URL', 'RENDERER_URL']) {
    const v = env[k];
    add(
      `${k} is public https`,
      !!v && v.startsWith('https://') && !isLocalUrl(v),
      `${k}=${v ?? '(unset)'}`,
      `Set ${k} to the public https:// URL`,
    );
  }
  add(
    'PLATFORM_SITES_DOMAIN is public',
    !!env.PLATFORM_SITES_DOMAIN &&
      !isLocalUrl(env.PLATFORM_SITES_DOMAIN) &&
      !/:\d+$/.test(env.PLATFORM_SITES_DOMAIN),
    `PLATFORM_SITES_DOMAIN=${env.PLATFORM_SITES_DOMAIN ?? ''}`,
    'e.g. sites.example.com with a wildcard DNS record',
  );
  const cors = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  add(
    'CORS_ORIGINS has no localhost',
    cors.length > 0 && !cors.some(isLocalUrl) && !cors.includes('*'),
    `CORS_ORIGINS=${env.CORS_ORIGINS ?? ''}`,
    'Only list the admin origin(s)',
  );
  const cookie = env.COOKIE_DOMAIN ?? '';
  const sites = env.PLATFORM_SITES_DOMAIN ?? '';
  const cookieLeaks =
    !!cookie && !!sites && (sites === cookie || sites.endsWith(`.${cookie.replace(/^\./, '')}`));
  add(
    'COOKIE_DOMAIN does not cover tenant sites',
    !!cookie && cookie !== 'localhost' && !cookieLeaks,
    cookieLeaks
      ? `COOKIE_DOMAIN=${cookie} would send auth cookies to *.${sites}`
      : `COOKIE_DOMAIN=${cookie || '(unset)'}`,
    'Use the admin host (e.g. admin.example.com)',
  );
  add(
    'COOKIE_SECURE=true',
    env.COOKIE_SECURE === 'true' || env.COOKIE_SECURE === '1',
    `COOKIE_SECURE=${env.COOKIE_SECURE ?? '(unset, defaults to false)'}`,
    'atrium config set COOKIE_SECURE true',
  );
  add(
    'JWT access and refresh secrets differ',
    !env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET,
    'JWT_ACCESS_SECRET equals JWT_REFRESH_SECRET',
    'atrium config set JWT_REFRESH_SECRET --generate',
  );
  let redisAuth = false;
  try {
    const u = new URL(env.REDIS_URL ?? '');
    redisAuth = !!u.password;
  } catch {
    /* unset/invalid → flagged below */
  }
  add(
    'Redis requires a password',
    redisAuth,
    `REDIS_URL has no password (${env.REDIS_URL ? 'redis://<host>' : 'unset'})`,
    'Set requirepass / managed AUTH and use redis://:<password>@host:6379',
    true,
  );
  add(
    'TRUST_PROXY is set explicitly',
    !!env.TRUST_PROXY && env.TRUST_PROXY !== 'false',
    'TRUST_PROXY is unset/false behind a reverse proxy — client IPs (rate limits, audit log) will be the proxy',
    'atrium config set TRUST_PROXY loopback,uniquelocal   # or the number of proxy hops',
    true,
  );
  out.push(
    ...secretChecks(env, g).map((c) =>
      c.status === 'warn' ? { ...c, status: 'fail' as const } : c,
    ),
  );
  add(
    'Database credentials are not the dev default',
    !!env.DATABASE_URL && !/:\/\/atrium:atrium@/.test(env.DATABASE_URL),
    'DATABASE_URL uses the default atrium:atrium credentials',
    'Use a strong password / managed PostgreSQL',
  );
  add(
    'DATABASE_URL requires TLS for remote hosts',
    !env.DATABASE_URL ||
      isLocalUrl(env.DATABASE_URL) ||
      /@(postgres|db|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL) ||
      /sslmode=(require|verify-ca|verify-full)/.test(env.DATABASE_URL),
    'remote DATABASE_URL without sslmode=require',
    'Append ?sslmode=require',
    true,
  );
  add(
    'Object storage is not local disk',
    env.STORAGE_DRIVER !== 'local',
    'STORAGE_DRIVER=local only works on a single node',
    'Use s3/r2/azure-blob for multi-node deployments',
    true,
  );
  add(
    'SMTP is a real relay',
    !!env.SMTP_HOST &&
      !isLocalUrl(`smtp://${env.SMTP_HOST}`) &&
      env.SMTP_HOST !== 'mailpit' &&
      !/REPLACE_ME/.test(env.SMTP_HOST),
    `SMTP_HOST=${env.SMTP_HOST ?? ''}`,
    'Configure SES/Postmark/Mailgun/your relay (or an org-level email provider)',
    true,
  );
  add(
    'Seed admin password changed',
    !!env.SEED_ADMIN_PASSWORD && env.SEED_ADMIN_PASSWORD !== 'Atrium!2026',
    'SEED_ADMIN_PASSWORD is the documented default',
    'atrium config set SEED_ADMIN_PASSWORD --generate (and `atrium set-admin-password` after seeding)',
  );
  const placeholders = Object.entries(env)
    .filter(([, v]) => typeof v === 'string' && v.includes('REPLACE_ME'))
    .map(([k]) => k);
  add(
    'No REPLACE_ME placeholders',
    placeholders.length === 0,
    `still placeholders: ${placeholders.join(', ')}`,
    'Fill in managed service endpoints/credentials',
  );
  return out;
}

export function summarize(results: CheckResult[]) {
  return {
    ok: results.filter((r) => r.status === 'ok').length,
    warn: results.filter((r) => r.status === 'warn').length,
    fail: results.filter((r) => r.status === 'fail').length,
  };
}
