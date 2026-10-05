import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '../driver';
import { httpRequest, type HttpRequestOptions } from '../http';
import { contentTypeFor, digestFiles, fileExtension, mapWithConcurrency, sha256Hex, toIso } from './digest';
import { isApexDomain, normalizeDomain, subdomainLabel, type DnsRecord } from './dns';
import type {
  DeployInput,
  DeploymentInfo,
  DeploymentLogLine,
  DeploymentProvider,
  DeploymentStatus,
  DeploymentTarget,
  DomainConfig,
} from './types';

const PROVIDER = 'cloudflare-pages';
const API = 'https://api.cloudflare.com/client/v4';
/** Per-request upload bucket limits (kept below the API's 50 MB / 5000-file ceiling, like Wrangler). */
const MAX_BUCKET_BYTES = 40 * 1024 * 1024;
const MAX_BUCKET_FILES = 2000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;

export const cloudflarePagesConfigSchema = z.object({
  accountId: z.string().min(1),
  /** Branch name that maps to the production environment. */
  productionBranch: z.string().min(1).default('main'),
});
export const cloudflarePagesSecretsSchema = z.object({
  /** API token with "Cloudflare Pages: Edit" permission. */
  apiToken: z.string().min(1),
});
export type CloudflarePagesConfig = z.output<typeof cloudflarePagesConfigSchema>;
export type CloudflarePagesSecrets = z.output<typeof cloudflarePagesSecretsSchema>;

interface CfEnvelope<T> {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: unknown[];
  result?: T;
}

interface CfProject {
  id?: string;
  name?: string;
  subdomain?: string;
  production_branch?: string;
}

interface CfStage {
  name?: string;
  status?: string;
  started_on?: string | null;
  ended_on?: string | null;
}

interface CfDeployment {
  id: string;
  short_id?: string;
  project_id?: string;
  project_name?: string;
  environment?: string;
  url?: string;
  created_on?: string;
  modified_on?: string;
  latest_stage?: CfStage;
  aliases?: string[] | null;
}

interface CfDomain {
  id?: string;
  name?: string;
  status?: string;
  verification_data?: { status?: string; error_message?: string };
  validation_data?: { status?: string; method?: string; txt_name?: string; txt_value?: string; error_message?: string };
}

// ---------------------------------------------------------------------------
// Id encoding: getStatus/getLogs/cancel/redeploy only receive a deployment id, but every
// Pages endpoint is project-scoped, so DeploymentInfo.id is `${projectName}:${deploymentId}`.
// Project names are [a-z0-9-] so ':' is an unambiguous separator.
// ---------------------------------------------------------------------------

export function encodePagesDeploymentId(projectName: string, deploymentId: string): string {
  return `${projectName}:${deploymentId}`;
}

export function decodePagesDeploymentId(id: string): { projectName: string; deploymentId: string } {
  const i = id.indexOf(':');
  if (i <= 0 || i === id.length - 1) {
    throw new ProviderError(`${PROVIDER}: invalid deployment id "${id}" (expected "<project>:<deploymentId>")`, PROVIDER, false);
  }
  return { projectName: id.slice(0, i), deploymentId: id.slice(i + 1) };
}

/** Pages project names: lowercase [a-z0-9-], ≤58 chars, no leading/trailing dash. */
export function sanitizePagesProjectName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 58)
    .replace(/-+$/, '');
  return cleaned || 'atrium-site';
}

/**
 * Content-addressed asset key. Wrangler uses blake3(base64(content) + extension) truncated to
 * 32 hex chars; Node has no built-in blake3, so we use sha256 of the same input truncated to
 * 32 hex chars. The asset API treats keys as opaque 32-hex identifiers, so this is accepted —
 * it only means our keys won't dedupe against assets uploaded by Wrangler.
 */
export function pagesAssetHash(base64Content: string, path: string): string {
  return sha256Hex(base64Content + fileExtension(path)).slice(0, 32);
}

export function mapPagesStage(stage: CfStage | undefined): DeploymentStatus {
  const name = (stage?.name ?? '').toLowerCase();
  const status = (stage?.status ?? '').toLowerCase();
  if (status === 'failure') return 'failed';
  if (status === 'canceled' || status === 'cancelled') return 'cancelled';
  if (status === 'success' && name === 'deploy') return 'ready';
  if (name === 'queued' || (status === 'idle' && !name)) return 'queued';
  return 'building';
}

export class CloudflarePagesDeploymentProvider implements DeploymentProvider {
  readonly driver = PROVIDER;

  constructor(
    private readonly config: CloudflarePagesConfig,
    private readonly secrets: CloudflarePagesSecrets,
  ) {}

  /**
   * Call the API and unwrap the `{ success, errors, result }` envelope. Non-2xx statuses throw
   * from httpRequest (unless allowed); a 2xx with `success: false` throws a ProviderError here.
   * Returns `undefined` result for allowed non-2xx statuses.
   */
  private async cf<T>(path: string, opts: HttpRequestOptions & { token?: string } = {}): Promise<{ status: number; result: T | undefined }> {
    const { token, ...rest } = opts;
    const url = /^https?:\/\//.test(path) ? path : `${API}${path}`;
    const res = await httpRequest<CfEnvelope<T>>(PROVIDER, url, {
      ...rest,
      headers: { Authorization: `Bearer ${token ?? this.secrets.apiToken}`, ...rest.headers },
    });
    if (!res.ok) return { status: res.status, result: undefined };
    return { status: res.status, result: unwrapCloudflare(res.data) };
  }

  private acc(path: string): string {
    return `/accounts/${encodeURIComponent(this.config.accountId)}${path}`;
  }

  private projectPath(projectName: string, suffix = ''): string {
    return this.acc(`/pages/projects/${encodeURIComponent(projectName)}${suffix}`);
  }

  private async getProject(name: string): Promise<CfProject | undefined> {
    const { result } = await this.cf<CfProject>(this.projectPath(name), { allowStatus: [404] });
    return result;
  }

  private async ensureProject(name: string): Promise<CfProject> {
    const existing = await this.getProject(name);
    if (existing) return existing;
    const { result } = await this.cf<CfProject>(this.acc('/pages/projects'), {
      method: 'POST',
      body: { name, production_branch: this.config.productionBranch },
    });
    return result ?? { name };
  }

  private mapDeployment(projectName: string, d: CfDeployment, fallbackTarget?: DeploymentTarget): DeploymentInfo {
    const project = d.project_name ?? projectName;
    const status = mapPagesStage(d.latest_stage);
    const target: DeploymentTarget = d.environment === 'production' ? 'production' : d.environment === 'preview' ? 'preview' : (fallbackTarget ?? 'preview');
    return {
      id: encodePagesDeploymentId(project, d.id),
      url: d.url,
      status,
      target,
      createdAt: toIso(d.created_on),
      readyAt: status === 'ready' ? toIso(d.latest_stage?.ended_on ?? d.modified_on) : undefined,
      error: status === 'failed' ? `Stage "${d.latest_stage?.name ?? 'unknown'}" failed` : undefined,
      inspectorUrl: `https://dash.cloudflare.com/${this.config.accountId}/pages/view/${project}/${d.id}`,
      projectId: d.project_id,
    };
  }

  /**
   * Direct Upload flow: upload-token → check-missing → upload (batched, base64) →
   * upsert-hashes → create deployment with a `{ "/path": hash }` manifest.
   */
  async deploy(input: DeployInput): Promise<DeploymentInfo> {
    if (input.framework === 'nextjs') {
      throw new ProviderError(
        `${PROVIDER}: Cloudflare Pages Direct Upload serves static files only — build the site as a static export (ATRIUM_STATIC_EXPORT=1) and deploy with framework "static"`,
        PROVIDER,
        false,
      );
    }
    const name = sanitizePagesProjectName(input.projectName);
    await this.ensureProject(name);

    const { result: tokenResult } = await this.cf<{ jwt?: string }>(this.projectPath(name, '/upload-token'));
    const jwt = tokenResult?.jwt;
    if (!jwt) throw new ProviderError(`${PROVIDER}: upload token missing from response`, PROVIDER, true);

    const assets = digestFiles(PROVIDER, input.files).map((f) => {
      if (f.size > MAX_FILE_BYTES) {
        throw new ProviderError(`${PROVIDER}: ${f.path} is ${f.size} bytes; Pages limits assets to 25 MiB`, PROVIDER, false);
      }
      const base64 = f.buffer.toString('base64');
      return { path: f.path, base64, hash: pagesAssetHash(base64, f.path), contentType: contentTypeFor(f.path) };
    });
    const byHash = new Map(assets.map((a) => [a.hash, a]));
    const hashes = [...byHash.keys()];

    const { result: missing } = await this.cf<string[]>(`${API}/pages/assets/check-missing`, {
      method: 'POST',
      token: jwt,
      body: { hashes },
    });
    const toUpload = (missing ?? []).map((h) => byHash.get(h)).filter((a): a is NonNullable<typeof a> => a !== undefined);

    const buckets: Array<typeof toUpload> = [];
    let current: typeof toUpload = [];
    let currentBytes = 0;
    for (const a of toUpload) {
      if (current.length > 0 && (current.length >= MAX_BUCKET_FILES || currentBytes + a.base64.length > MAX_BUCKET_BYTES)) {
        buckets.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(a);
      currentBytes += a.base64.length;
    }
    if (current.length > 0) buckets.push(current);

    await mapWithConcurrency(buckets, UPLOAD_CONCURRENCY, async (bucket) => {
      await this.cf(`${API}/pages/assets/upload`, {
        method: 'POST',
        token: jwt,
        timeoutMs: 300_000,
        body: bucket.map((a) => ({ key: a.hash, value: a.base64, metadata: { contentType: a.contentType }, base64: true })),
      });
    });

    if (hashes.length > 0) {
      await this.cf(`${API}/pages/assets/upsert-hashes`, { method: 'POST', token: jwt, body: { hashes } });
    }

    const manifest: Record<string, string> = {};
    for (const a of assets) manifest[`/${a.path}`] = a.hash;
    const form = new FormData();
    form.set('manifest', JSON.stringify(manifest));
    form.set('branch', input.target === 'production' ? this.config.productionBranch : 'preview');
    const { result } = await this.cf<CfDeployment>(this.projectPath(name, '/deployments'), { method: 'POST', body: form, timeoutMs: 120_000 });
    if (!result) throw new ProviderError(`${PROVIDER}: deployment missing from response`, PROVIDER, true);
    return this.mapDeployment(name, result, input.target);
  }

  /** Retries the deployment (same branch/environment); `target` cannot be changed by Pages. */
  async redeploy(deploymentId: string, _target?: DeploymentTarget): Promise<DeploymentInfo> {
    const { projectName, deploymentId: id } = decodePagesDeploymentId(deploymentId);
    const { result } = await this.cf<CfDeployment>(this.projectPath(projectName, `/deployments/${encodeURIComponent(id)}/retry`), { method: 'POST' });
    if (!result) throw new ProviderError(`${PROVIDER}: retry returned no deployment`, PROVIDER, true);
    return this.mapDeployment(projectName, result);
  }

  /** Accepts either an encoded `<project>:<id>` or a raw Pages deployment id. */
  async rollback(projectName: string, deploymentId: string): Promise<DeploymentInfo> {
    const parsed = deploymentId.includes(':')
      ? decodePagesDeploymentId(deploymentId)
      : { projectName: sanitizePagesProjectName(projectName), deploymentId };
    const { result } = await this.cf<CfDeployment>(
      this.projectPath(parsed.projectName, `/deployments/${encodeURIComponent(parsed.deploymentId)}/rollback`),
      { method: 'POST' },
    );
    if (!result) throw new ProviderError(`${PROVIDER}: rollback returned no deployment`, PROVIDER, true);
    return { ...this.mapDeployment(parsed.projectName, result), target: 'production' };
  }

  async cancel(deploymentId: string): Promise<void> {
    const { projectName, deploymentId: id } = decodePagesDeploymentId(deploymentId);
    await this.cf(this.projectPath(projectName, `/deployments/${encodeURIComponent(id)}/cancel`), { method: 'POST' });
  }

  async getStatus(deploymentId: string): Promise<DeploymentInfo> {
    const { projectName, deploymentId: id } = decodePagesDeploymentId(deploymentId);
    const { result } = await this.cf<CfDeployment>(this.projectPath(projectName, `/deployments/${encodeURIComponent(id)}`));
    if (!result) throw new ProviderError(`${PROVIDER}: deployment ${deploymentId} not found`, PROVIDER, false);
    return this.mapDeployment(projectName, result);
  }

  async getLogs(deploymentId: string): Promise<DeploymentLogLine[]> {
    const { projectName, deploymentId: id } = decodePagesDeploymentId(deploymentId);
    const { result } = await this.cf<{ data?: Array<{ ts?: string; line?: string }> }>(
      this.projectPath(projectName, `/deployments/${encodeURIComponent(id)}/history/logs`),
    );
    return (result?.data ?? []).map((l) => {
      const message = l.line ?? '';
      const level: DeploymentLogLine['level'] = /^(✘|\[?error\b|failed\b)/i.test(message.trim())
        ? 'error'
        : /^(▲|\[?warn(ing)?\b)/i.test(message.trim())
          ? 'warn'
          : 'info';
      return { timestamp: toIso(l.ts) ?? new Date(0).toISOString(), level, message };
    });
  }

  async addDomain(projectName: string, domain: string, _opts?: { redirectTo?: string }): Promise<DomainConfig> {
    const project = sanitizePagesProjectName(projectName);
    const name = normalizeDomain(domain);
    try {
      await this.cf<CfDomain>(this.projectPath(project, '/domains'), { method: 'POST', body: { name } });
    } catch (err) {
      // Already attached to this project → fine; anything else is a real error.
      const existing = await this.getDomain(project, name).catch(() => undefined);
      if (!existing) throw err;
    }
    return this.domainConfig(project, name);
  }

  async removeDomain(projectName: string, domain: string): Promise<void> {
    const project = sanitizePagesProjectName(projectName);
    await this.cf(this.projectPath(project, `/domains/${encodeURIComponent(normalizeDomain(domain))}`), {
      method: 'DELETE',
      allowStatus: [404],
    });
  }

  async verifyDomain(projectName: string, domain: string): Promise<DomainConfig> {
    const project = sanitizePagesProjectName(projectName);
    const name = normalizeDomain(domain);
    try {
      // PATCH re-triggers validation of a pending domain.
      await this.cf(this.projectPath(project, `/domains/${encodeURIComponent(name)}`), { method: 'PATCH' });
    } catch {
      // Best-effort: the GET below reports the current state either way.
    }
    return this.domainConfig(project, name);
  }

  private async getDomain(project: string, domain: string): Promise<CfDomain | undefined> {
    const { result } = await this.cf<CfDomain>(this.projectPath(project, `/domains/${encodeURIComponent(domain)}`), { allowStatus: [404] });
    return result;
  }

  private async domainConfig(project: string, domain: string): Promise<DomainConfig> {
    const [d, p] = await Promise.all([this.getDomain(project, domain), this.getProject(project).catch(() => undefined)]);
    return buildPagesDomainConfig(domain, p?.subdomain ?? `${project}.pages.dev`, d);
  }

  /**
   * `/user/tokens/verify` only works for user-owned tokens; account-owned tokens fail there,
   * so the Pages project listing is the authoritative check.
   */
  async test(): Promise<TestResult> {
    let tokenStatus: string | undefined;
    try {
      const { result } = await this.cf<{ status?: string }>('/user/tokens/verify');
      tokenStatus = result?.status;
      if (tokenStatus && tokenStatus !== 'active') return { ok: false, message: `API token is ${tokenStatus}` };
    } catch {
      // Possibly an account-owned token; fall through to the account-scoped check.
    }
    try {
      const { result } = await this.cf<CfProject[]>(this.acc('/pages/projects'), { query: { per_page: 1 } });
      return {
        ok: true,
        message: `Connected to Cloudflare Pages for account ${this.config.accountId}`,
        details: { tokenStatus, sampleProject: result?.[0]?.name },
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Unwrap a Cloudflare `{ success, errors, result }` envelope; throws ProviderError on `success: false`. */
export function unwrapCloudflare<T>(data: CfEnvelope<T> | undefined): T | undefined {
  if (data && typeof data === 'object' && data.success === false) {
    const msg = (data.errors ?? []).map((e) => (e.code ? `${e.code}: ${e.message ?? ''}` : (e.message ?? ''))).join('; ') || 'request failed';
    throw new ProviderError(`${PROVIDER}: ${msg}`, PROVIDER, false, { body: data });
  }
  return data?.result;
}

export function buildPagesDomainConfig(domain: string, pagesHost: string, d: CfDomain | undefined): DomainConfig {
  const records: DnsRecord[] = [];
  if (d?.validation_data?.txt_name && d.validation_data.txt_value) {
    records.push({ type: 'TXT', name: d.validation_data.txt_name, value: d.validation_data.txt_value, reason: 'Validate the domain for SSL issuance' });
  }
  if (isApexDomain(domain)) {
    records.push({
      type: 'CNAME',
      name: '@',
      value: pagesHost,
      reason: 'Apex domains require the zone to be on Cloudflare DNS (CNAME flattening makes the apex CNAME valid)',
    });
  } else {
    records.push({ type: 'CNAME', name: subdomainLabel(domain), value: pagesHost, reason: 'Point the subdomain at the Pages project' });
  }
  const status = (d?.status ?? '').toLowerCase();
  const verified = status === 'active';
  const errored = status === 'error' || status === 'blocked' || d?.verification_data?.status === 'error' || d?.validation_data?.status === 'error';
  return {
    domain,
    verified,
    records,
    misconfigured: !verified && (errored || Boolean(d?.verification_data?.error_message)),
    ssl: verified ? 'active' : errored ? 'error' : 'pending',
  };
}

export const cloudflarePagesDriver = defineDriver({
  kind: 'deployment',
  id: PROVIDER,
  name: 'Cloudflare Pages',
  description: 'Deploy static exports to Cloudflare Pages via Direct Upload; custom domains via Pages domains.',
  configSchema: cloudflarePagesConfigSchema,
  secretsSchema: cloudflarePagesSecretsSchema,
  create: (config, secrets): DeploymentProvider => new CloudflarePagesDeploymentProvider(config, secrets),
});
