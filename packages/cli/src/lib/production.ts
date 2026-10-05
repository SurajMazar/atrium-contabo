import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { EnvFile, formatValue } from './env';
import { generateSecret, isSecretKey } from './secrets';
import { renderDir, renderTemplate, type RenderedFile, type TemplateVars } from './template';
import { templatesDir } from './paths';

export type TargetId =
  | 'podman'
  | 'docker'
  | 'systemd'
  | 'k8s'
  | 'cpanel'
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'vercel'
  | 'fly'
  | 'railway'
  | 'render';

/** How backing services are reached in the generated env. */
type EnvMode = 'compose' | 'host' | 'managed';

interface TargetSpec {
  title: string;
  doc: string;
  envMode: EnvMode;
  /** Files copied from the repository (root-relative → out-relative). */
  copies: Array<{ from: string; to: string; rewrite?: boolean }>;
  /** Extra env files to emit: k8s splits config vs secrets, Vercel per-app subsets. */
  envLayout: 'single' | 'k8s' | 'vercel';
}

export const TARGETS: Record<TargetId, TargetSpec> = {
  podman: {
    title: 'Single server with Podman (compose or Quadlet/systemd) + Caddy',
    doc: 'docs/deployment/vps-podman.md',
    envMode: 'compose',
    envLayout: 'single',
    copies: [
      { from: 'infra/compose.prod.yaml', to: 'compose.yaml' },
      { from: 'infra/caddy/Caddyfile', to: 'caddy/Caddyfile' },
      { from: 'infra/quadlet', to: 'quadlet', rewrite: true },
      { from: 'infra/scripts/backup.sh', to: 'scripts/backup.sh' },
    ],
  },
  docker: {
    title: 'Single server with Docker Compose + Caddy',
    doc: 'docs/deployment/vps-podman.md',
    envMode: 'compose',
    envLayout: 'single',
    copies: [
      { from: 'infra/compose.prod.yaml', to: 'compose.yaml' },
      { from: 'infra/caddy/Caddyfile', to: 'caddy/Caddyfile' },
      { from: 'infra/scripts/backup.sh', to: 'scripts/backup.sh' },
    ],
  },
  systemd: {
    title: 'Bare-metal / VM with systemd units + nginx (Node.js on the host)',
    doc: 'docs/deployment/vps-podman.md',
    envMode: 'host',
    envLayout: 'single',
    copies: [
      { from: 'infra/systemd', to: 'systemd' },
      { from: 'infra/nginx/atrium.conf', to: 'nginx/atrium.conf', rewrite: true },
      { from: 'infra/caddy/Caddyfile', to: 'caddy/Caddyfile' },
      { from: 'infra/scripts/backup.sh', to: 'scripts/backup.sh' },
    ],
  },
  k8s: {
    title: 'Kubernetes (Kustomize overlay on infra/k8s/base)',
    doc: 'docs/deployment/kubernetes.md',
    envMode: 'managed',
    envLayout: 'k8s',
    copies: [],
  },
  cpanel: {
    title: 'cPanel / shared hosting (static or Node.js-app renderer) + external API',
    doc: 'docs/deployment/cpanel.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
  aws: {
    title: 'AWS — ECS Fargate + RDS + ElastiCache + S3 + CloudFront',
    doc: 'docs/deployment/aws.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
  azure: {
    title: 'Azure — Container Apps + PostgreSQL Flexible Server + Cache for Redis + Blob',
    doc: 'docs/deployment/azure.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
  gcp: {
    title: 'Google Cloud — Cloud Run + GKE/GCE worker + Cloud SQL + Memorystore + GCS',
    doc: 'docs/deployment/gcp.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
  vercel: {
    title: 'Vercel for admin + renderer; API/worker on a container platform',
    doc: 'docs/deployment/vercel.md',
    envMode: 'managed',
    envLayout: 'vercel',
    copies: [],
  },
  fly: {
    title: 'Fly.io (api, worker, renderer, admin apps)',
    doc: 'docs/deployment/fly-railway-render.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
  railway: {
    title: 'Railway (four services from the Containerfiles)',
    doc: 'docs/deployment/fly-railway-render.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
  render: {
    title: 'Render (Blueprint: web services, background worker, Postgres, Key Value)',
    doc: 'docs/deployment/fly-railway-render.md',
    envMode: 'managed',
    envLayout: 'single',
    copies: [],
  },
};

export const TARGET_IDS = Object.keys(TARGETS) as TargetId[];

export interface ProductionOptions {
  target: TargetId;
  domain: string;
  email: string;
  registry: string;
  tag: string;
  namespace: string;
  appDir: string;
  outDir: string;
  root: string;
  overwrite?: boolean;
}

export function productionVars(o: ProductionOptions): TemplateVars {
  const domain = o.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const k8sBase = relative(o.outDir, join(o.root, 'infra', 'k8s', 'base'))
    .split('\\')
    .join('/');
  const k8sComponents = relative(o.outDir, join(o.root, 'infra', 'k8s', 'components'))
    .split('\\')
    .join('/');
  return {
    domain,
    adminHost: `admin.${domain}`,
    apiHost: `api.${domain}`,
    sitesDomain: `sites.${domain}`,
    mediaHost: `media.${domain}`,
    acmeEmail: o.email,
    registry: o.registry.replace(/\/+$/, ''),
    tag: o.tag,
    namespace: o.namespace,
    appDir: o.appDir,
    srcDir: o.root,
    k8sBase,
    k8sComponents,
    target: o.target,
    generatedAt: new Date().toISOString(),
    doc: TARGETS[o.target].doc,
    title: TARGETS[o.target].title,
  };
}

const MANAGED_PLACEHOLDER = 'REPLACE_ME';

/** Point copied infra files at the chosen domain, registry and image tag. */
export function rewriteArtifact(src: string, vars: TemplateVars): string {
  return src
    .replace(/example\.com/g, String(vars.domain))
    .replace(/ghcr\.io\/your-org/g, String(vars.registry))
    .replace(/(atrium-(?:api|worker|renderer|admin|migrate)):latest/g, `$1:${vars.tag}`);
}

/**
 * Build a production .env from .env.example: production URLs for the domain,
 * fresh secrets, and backing-service URLs suited to the target topology.
 */
export function buildProductionEnv(example: EnvFile, vars: TemplateVars, mode: EnvMode): EnvFile {
  const env = example.clone();
  const d = String(vars.domain);
  const pgPassword = generateSecret('POSTGRES_PASSWORD');
  const s3Key = generateSecret('S3_ACCESS_KEY_ID');
  const s3Secret = generateSecret('S3_SECRET_ACCESS_KEY');
  const set = (k: string, v: string) => env.set(k, v);

  set('NODE_ENV', 'production');
  set('ADMIN_URL', `https://${vars.adminHost}`);
  set('API_URL', `https://${vars.apiHost}`);
  set('RENDERER_URL', `https://${vars.sitesDomain}`);
  set('PLATFORM_SITES_DOMAIN', String(vars.sitesDomain));
  set('PREVIEW_URL', `https://${vars.sitesDomain}`);
  set('CORS_ORIGINS', `https://${vars.adminHost}`);
  // Scope cookies to the admin host only — never the parent domain shared with tenant sites.
  set('COOKIE_DOMAIN', String(vars.adminHost));
  // Secure cookies over https; DNS guidance shown to tenants for custom domains.
  env.set('COOKIE_SECURE', 'true');
  env.set('TRUST_PROXY', 'true');
  env.set('PLATFORM_CNAME_TARGET', String(vars.sitesDomain));
  for (const k of [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'RENDERER_SECRET',
    'ANALYTICS_SALT',
    'SEED_ADMIN_PASSWORD',
  ])
    set(k, generateSecret(k));
  set('SEED_ADMIN_EMAIL', String(vars.acmeEmail));
  set('MAIL_FROM', `Atrium <no-reply@${d}>`);
  set('STORAGE_DRIVER', 's3');
  set('S3_FORCE_PATH_STYLE', 'true');
  set('SMTP_SECURE', 'false');

  if (mode === 'compose') {
    set('POSTGRES_PASSWORD', pgPassword);
    set(
      'DATABASE_URL',
      `postgresql://${env.get('POSTGRES_USER') ?? 'atrium'}:${pgPassword}@postgres:5432/${env.get('POSTGRES_DB') ?? 'atrium'}`,
    );
    set('REDIS_URL', 'redis://redis:6379');
    set('S3_ENDPOINT', 'http://s3:8333');
    set('S3_PUBLIC_URL', `https://${vars.mediaHost}/${env.get('S3_BUCKET') ?? 'atrium-media'}`);
    set('S3_ACCESS_KEY_ID', s3Key);
    set('S3_SECRET_ACCESS_KEY', s3Secret);
  } else if (mode === 'host') {
    set('POSTGRES_PASSWORD', pgPassword);
    set(
      'DATABASE_URL',
      `postgresql://${env.get('POSTGRES_USER') ?? 'atrium'}:${pgPassword}@127.0.0.1:5432/${env.get('POSTGRES_DB') ?? 'atrium'}`,
    );
    set('REDIS_URL', 'redis://127.0.0.1:6379');
    set('S3_ENDPOINT', `https://s3.${MANAGED_PLACEHOLDER}.example`);
    set('S3_PUBLIC_URL', `https://${vars.mediaHost}`);
    set('S3_ACCESS_KEY_ID', MANAGED_PLACEHOLDER);
    set('S3_SECRET_ACCESS_KEY', MANAGED_PLACEHOLDER);
  } else {
    set('POSTGRES_PASSWORD', MANAGED_PLACEHOLDER);
    set(
      'DATABASE_URL',
      `postgresql://atrium:${MANAGED_PLACEHOLDER}@${MANAGED_PLACEHOLDER}.db.internal:5432/atrium?sslmode=require`,
    );
    set(
      'REDIS_URL',
      `rediss://default:${MANAGED_PLACEHOLDER}@${MANAGED_PLACEHOLDER}.cache.internal:6379`,
    );
    set('S3_ENDPOINT', `https://s3.${MANAGED_PLACEHOLDER}.example`);
    set('S3_PUBLIC_URL', `https://${vars.mediaHost}`);
    set('S3_ACCESS_KEY_ID', MANAGED_PLACEHOLDER);
    set('S3_SECRET_ACCESS_KEY', MANAGED_PLACEHOLDER);
    set('S3_FORCE_PATH_STYLE', 'false');
  }
  set('SMTP_HOST', `smtp.${MANAGED_PLACEHOLDER}.example`);
  set('SMTP_PORT', '587');
  // Local-dev host port mappings are irrelevant in production but harmless; keep app ports.
  const extra: Array<[string, string, string?]> = [
    ['ATRIUM_DOMAIN', d, 'Deployment (generated by `atrium setup production`)'],
    ['ADMIN_HOST', String(vars.adminHost)],
    ['API_HOST', String(vars.apiHost)],
    ['SITES_DOMAIN', String(vars.sitesDomain)],
    ['MEDIA_HOST', String(vars.mediaHost)],
    ['ACME_EMAIL', String(vars.acmeEmail)],
    ['ATRIUM_IMAGE_REGISTRY', String(vars.registry)],
    ['ATRIUM_IMAGE_TAG', String(vars.tag)],
    [
      'ATRIUM_API_INTERNAL_URL',
      mode === 'compose'
        ? 'http://api:4000'
        : mode === 'host'
          ? 'http://127.0.0.1:4000'
          : `https://${vars.apiHost}`,
    ],
  ];
  if (mode === 'compose') extra.push(['ATRIUM_SRC_DIR', String(vars.srcDir)]);
  for (const [k, v, comment] of extra) env.set(k, v, { comment });
  return env;
}

/** Keys considered secret for k8s Secret vs ConfigMap split. */
export function isSecretEnvKey(key: string): boolean {
  return isSecretKey(key) || key === 'DATABASE_URL' || key === 'REDIS_URL';
}

const VERCEL_KEYS = {
  admin: [
    'NODE_ENV',
    'API_URL',
    'ATRIUM_API_INTERNAL_URL',
    'ADMIN_URL',
    'RENDERER_URL',
    'PLATFORM_SITES_DOMAIN',
    'PREVIEW_URL',
  ],
  renderer: [
    'NODE_ENV',
    'API_URL',
    'ATRIUM_API_INTERNAL_URL',
    'RENDERER_URL',
    'PLATFORM_SITES_DOMAIN',
    'PREVIEW_URL',
    'RENDERER_SECRET',
    'ANALYTICS_SALT',
  ],
};

function envSubset(env: EnvFile, keys: string[], header: string): string {
  return (
    [
      `# ${header}`,
      ...keys.filter((k) => env.has(k)).map((k) => `${k}=${formatValue(env.get(k)!)}`),
    ].join('\n') + '\n'
  );
}

function copyRecursive(
  src: string,
  dest: string,
  transform?: (s: string) => string,
  overwrite = false,
): string[] {
  const written: string[] = [];
  if (statSync(src).isDirectory()) {
    for (const e of readdirSync(src))
      written.push(...copyRecursive(join(src, e), join(dest, e), transform, overwrite));
    return written;
  }
  if (existsSync(dest) && !overwrite) return written;
  mkdirSync(dirname(dest), { recursive: true });
  if (transform) writeFileSync(dest, transform(readFileSync(src, 'utf8')));
  else copyFileSync(src, dest);
  written.push(dest);
  return written;
}

export interface GenerateResult {
  files: RenderedFile[];
  envFiles: string[];
  nextSteps: string;
}

/** Generate deployment artifacts for one target into `outDir`. */
export function generateProduction(o: ProductionOptions, example: EnvFile): GenerateResult {
  const spec = TARGETS[o.target];
  const vars = productionVars(o);
  mkdirSync(o.outDir, { recursive: true });
  const files: RenderedFile[] = [];

  for (const c of spec.copies) {
    const src = join(o.root, c.from);
    if (!existsSync(src)) continue;
    const transform = c.rewrite ? (s: string) => rewriteArtifact(s, vars) : undefined;
    for (const f of copyRecursive(src, join(o.outDir, c.to), transform, o.overwrite))
      files.push({ path: f, rel: relative(o.outDir, f) });
  }

  const tplDir = join(templatesDir, 'production', o.target);
  if (existsSync(tplDir))
    files.push(...renderDir(tplDir, o.outDir, vars, { overwrite: o.overwrite }));

  const env = buildProductionEnv(example, vars, spec.envMode);
  const envFiles: string[] = [];
  const writeSecretFile = (name: string, content: string) => {
    const f = join(o.outDir, name);
    if (existsSync(f) && !o.overwrite) return;
    writeFileSync(f, content, { mode: 0o600 });
    envFiles.push(f);
  };
  const banner = `# Generated by \`atrium setup production --target ${o.target}\` on ${vars.generatedAt}.\n# Contains secrets — keep it out of git (chmod 600). Replace every REPLACE_ME value.\n`;
  if (spec.envLayout === 'k8s') {
    const cfg: string[] = [];
    const sec: string[] = [];
    for (const k of env.keys()) (isSecretEnvKey(k) ? sec : cfg).push(`${k}=${env.get(k) ?? ''}`);
    writeSecretFile('config.env', `${banner}${cfg.join('\n')}\n`);
    writeSecretFile('secrets.env', `${banner}${sec.join('\n')}\n`);
  } else {
    writeSecretFile('.env', banner + env.toString());
    if (spec.envLayout === 'vercel') {
      writeSecretFile(
        'env.admin',
        envSubset(env, VERCEL_KEYS.admin, 'Vercel project: atrium-admin'),
      );
      writeSecretFile(
        'env.renderer',
        envSubset(env, VERCEL_KEYS.renderer, 'Vercel project: atrium-renderer'),
      );
    }
  }
  if (spec.envMode === 'compose') {
    const s3 = {
      identities: [
        {
          name: 'atrium',
          credentials: [
            { accessKey: env.get('S3_ACCESS_KEY_ID'), secretKey: env.get('S3_SECRET_ACCESS_KEY') },
          ],
          actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'],
        },
        { name: 'anonymous', actions: ['Read'] },
      ],
    };
    // write into the folder layout compose.prod.yaml expects (./seaweedfs/s3.json)
    mkdirSync(join(o.outDir, 'seaweedfs'), { recursive: true });
    const s3File = join(o.outDir, 'seaweedfs', 's3.json');
    if (!existsSync(s3File) || o.overwrite) {
      writeFileSync(s3File, `${JSON.stringify(s3, null, 2)}\n`, { mode: 0o600 });
      envFiles.push(s3File);
    }
  }

  const nsTpl = join(templatesDir, 'production', 'NEXT-STEPS.common.md.tpl');
  const nextSteps = existsSync(join(o.outDir, 'NEXT-STEPS.md'))
    ? readFileSync(join(o.outDir, 'NEXT-STEPS.md'), 'utf8')
    : existsSync(nsTpl)
      ? renderTemplate(readFileSync(nsTpl, 'utf8'), vars)
      : '';
  return { files, envFiles, nextSteps };
}
