import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '../driver';
import { errorStatus, httpRequest, type HttpRequestOptions, type HttpResponse } from '../http';
import { digestFiles, errorBody, mapWithConcurrency, toIso, uniqueByDigest, type DigestedFile } from './digest';
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

const PROVIDER = 'vercel';
const API = 'https://api.vercel.com';
const UPLOAD_CONCURRENCY = 8;
const DEFAULT_APEX_IP = '76.76.21.21';
const DEFAULT_CNAME = 'cname.vercel-dns.com';

export const vercelConfigSchema = z.object({
  /** Team id (team_…); sent as `teamId` on every request. */
  teamId: z.string().min(1).optional(),
  /** Team slug; used (as `slug`) only when teamId is not set. */
  teamSlug: z.string().min(1).optional(),
  /** Vercel framework preset used for `nextjs` deploys. */
  framework: z.string().min(1).default('nextjs'),
  rootDirectory: z.string().min(1).optional(),
  nodeVersion: z.string().min(1).default('24.x'),
  buildCommand: z.string().min(1).optional(),
  outputDirectory: z.string().min(1).optional(),
  installCommand: z.string().min(1).optional(),
});
export const vercelSecretsSchema = z.object({
  /** Vercel access token (Account Settings → Tokens). */
  token: z.string().min(1),
});
export type VercelConfig = z.output<typeof vercelConfigSchema>;
export type VercelSecrets = z.output<typeof vercelSecretsSchema>;

// ---------------------------------------------------------------------------
// Response shapes (only the fields we read; everything optional for robustness)
// ---------------------------------------------------------------------------

interface VercelProject {
  id: string;
  name?: string;
}

interface VercelDeployment {
  id?: string;
  uid?: string;
  name?: string;
  url?: string;
  readyState?: string;
  status?: string;
  state?: string;
  target?: string | null;
  inspectorUrl?: string | null;
  projectId?: string;
  project?: { id?: string; name?: string };
  createdAt?: number;
  created?: number;
  ready?: number;
  errorMessage?: string | null;
  errorCode?: string | null;
}

interface VercelEvent {
  type?: string;
  created?: number;
  date?: number;
  text?: string;
  level?: string;
  payload?: { text?: string; date?: number; created?: number; level?: string };
}

interface VercelProjectDomain {
  name?: string;
  projectId?: string;
  verified?: boolean;
  redirect?: string | null;
  verification?: Array<{ type?: string; domain?: string; value?: string; reason?: string }>;
}

interface VercelDomainConfigResponse {
  misconfigured?: boolean;
  configuredBy?: string | null;
  recommendedIPv4?: Array<{ rank?: number; value?: string[] }>;
  recommendedCNAME?: Array<{ rank?: number; value?: string }>;
}

interface VercelErrorBody {
  error?: { code?: string; message?: string; missing?: unknown };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Vercel project names: lowercase, ≤100 chars, [a-z0-9._-], no "---". */
export function sanitizeVercelProjectName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{3,}/g, '--')
    .replace(/^[._-]+/, '')
    .slice(0, 100)
    .replace(/[._-]+$/, '');
  return cleaned || 'atrium-site';
}

export function mapVercelState(state: string | undefined | null): DeploymentStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'BUILDING':
      return 'building';
    case 'READY':
      return 'ready';
    case 'ERROR':
      return 'failed';
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled';
    case 'QUEUED':
    case 'INITIALIZING':
    default:
      return 'queued';
  }
}

function withProtocol(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function rankFirst<T extends { rank?: number }>(items: T[] | undefined): T | undefined {
  if (!items?.length) return undefined;
  return [...items].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))[0];
}

function missingShas(err: unknown): string[] | undefined | null {
  if (errorStatus(err) !== 400) return null;
  const body = errorBody(err) as VercelErrorBody | undefined;
  if (body?.error?.code !== 'missing_files') return null;
  const missing = body.error.missing;
  return Array.isArray(missing) ? missing.filter((m): m is string => typeof m === 'string') : undefined;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class VercelDeploymentProvider implements DeploymentProvider {
  readonly driver = PROVIDER;

  constructor(
    private readonly config: VercelConfig,
    private readonly secrets: VercelSecrets,
  ) {}

  private request<T>(path: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const scope = this.config.teamId ? { teamId: this.config.teamId } : this.config.teamSlug ? { slug: this.config.teamSlug } : {};
    return httpRequest<T>(PROVIDER, `${API}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${this.secrets.token}`, ...opts.headers },
      query: { ...scope, ...opts.query },
    });
  }

  private frameworkFor(framework: DeployInput['framework']): string | null {
    return framework === 'static' ? null : this.config.framework;
  }

  private projectSettings(framework: DeployInput['framework']) {
    return {
      framework: this.frameworkFor(framework),
      buildCommand: this.config.buildCommand,
      outputDirectory: this.config.outputDirectory,
      installCommand: this.config.installCommand,
      rootDirectory: this.config.rootDirectory,
      nodeVersion: this.config.nodeVersion,
    };
  }

  private async findProject(idOrName: string): Promise<VercelProject | undefined> {
    const res = await this.request<VercelProject>(`/v9/projects/${encodeURIComponent(idOrName)}`, { allowStatus: [404] });
    return res.status === 404 ? undefined : res.data;
  }

  private async requireProject(projectName: string): Promise<VercelProject> {
    const name = sanitizeVercelProjectName(projectName);
    const project = await this.findProject(name);
    if (!project?.id) throw new ProviderError(`${PROVIDER}: project "${name}" not found`, PROVIDER, false);
    return project;
  }

  private async ensureProject(input: DeployInput): Promise<VercelProject & { name: string }> {
    const name = sanitizeVercelProjectName(input.projectName);
    const existing = await this.findProject(name);
    if (existing?.id) return { ...existing, name: existing.name ?? name };
    const { data } = await this.request<VercelProject>('/v11/projects', {
      method: 'POST',
      body: { name, ...this.projectSettings(input.framework) },
    });
    return { ...data, name: data.name ?? name };
  }

  private async upsertEnv(projectId: string, env: Record<string, string> | undefined): Promise<void> {
    const entries = Object.entries(env ?? {});
    if (entries.length === 0) return;
    await this.request(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
      method: 'POST',
      query: { upsert: 'true' },
      body: entries.map(([key, value]) => ({ key, value, type: 'encrypted', target: ['production', 'preview'] })),
    });
  }

  private async uploadFiles(files: DigestedFile[]): Promise<void> {
    const unique = [...uniqueByDigest(files).values()];
    await mapWithConcurrency(unique, UPLOAD_CONCURRENCY, async (f) => {
      await this.request('/v2/files', {
        method: 'POST',
        headers: {
          'x-vercel-digest': f.sha1,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(f.size),
        },
        body: f.buffer,
        timeoutMs: 120_000,
        responseType: 'none',
      });
    });
  }

  private mapDeployment(d: VercelDeployment, fallback: Partial<DeploymentInfo> = {}): DeploymentInfo {
    const state = d.readyState ?? d.status ?? d.state;
    const status = mapVercelState(state);
    const error = [d.errorCode, d.errorMessage].filter(Boolean).join(': ') || undefined;
    const target: DeploymentTarget = d.target === 'production' ? 'production' : d.target === undefined && fallback.target ? fallback.target : 'preview';
    return {
      id: d.id ?? d.uid ?? fallback.id ?? '',
      url: withProtocol(d.url) ?? fallback.url,
      status,
      target,
      createdAt: toIso(d.createdAt ?? d.created) ?? fallback.createdAt,
      readyAt: status === 'ready' ? toIso(d.ready) : undefined,
      error,
      inspectorUrl: d.inspectorUrl ?? undefined,
      projectId: d.projectId ?? d.project?.id ?? fallback.projectId,
    };
  }

  private async getDeployment(id: string): Promise<VercelDeployment> {
    const { data } = await this.request<VercelDeployment>(`/v13/deployments/${encodeURIComponent(id)}`);
    return data;
  }

  /**
   * Upload-on-demand: create the deployment first; Vercel answers `400 missing_files`
   * listing the shas it doesn't have yet. Upload only those (or every file when the
   * list is absent) and retry once.
   */
  async deploy(input: DeployInput): Promise<DeploymentInfo> {
    const project = await this.ensureProject(input);
    await this.upsertEnv(project.id, input.env);
    const files = digestFiles(PROVIDER, input.files);
    const body = {
      name: project.name,
      project: project.id,
      target: input.target === 'production' ? 'production' : undefined,
      files: files.map((f) => ({ file: f.path, sha: f.sha1, size: f.size })),
      projectSettings: this.projectSettings(input.framework),
      meta: input.meta,
    };
    const create = () =>
      this.request<VercelDeployment>('/v13/deployments', {
        method: 'POST',
        query: { skipAutoDetectionConfirmation: 1 },
        body,
        timeoutMs: 120_000,
      });

    let res: HttpResponse<VercelDeployment>;
    try {
      res = await create();
    } catch (err) {
      const missing = missingShas(err);
      if (missing === null) throw err;
      const wanted = missing ? new Set(missing) : undefined;
      await this.uploadFiles(wanted ? files.filter((f) => wanted.has(f.sha1)) : files);
      res = await create();
    }
    return this.mapDeployment(res.data, { target: input.target, projectId: project.id });
  }

  async redeploy(deploymentId: string, target?: DeploymentTarget): Promise<DeploymentInfo> {
    const original = await this.getDeployment(deploymentId);
    const resolvedTarget: DeploymentTarget = target ?? (original.target === 'production' ? 'production' : 'preview');
    const { data } = await this.request<VercelDeployment>('/v13/deployments', {
      method: 'POST',
      query: { forceNew: 1 },
      body: {
        name: original.name ?? original.project?.name,
        deploymentId,
        target: resolvedTarget === 'production' ? 'production' : undefined,
        project: original.projectId ?? original.project?.id,
      },
    });
    return this.mapDeployment(data, { target: resolvedTarget });
  }

  async rollback(projectName: string, deploymentId: string): Promise<DeploymentInfo> {
    const project = await this.requireProject(projectName);
    const pid = encodeURIComponent(project.id);
    const did = encodeURIComponent(deploymentId);
    try {
      await this.request(`/v10/projects/${pid}/promote/${did}`, { method: 'POST', responseType: 'none' });
    } catch (err) {
      const status = errorStatus(err);
      if (status !== 404 && status !== 400) throw err;
      await this.request(`/v9/projects/${pid}/rollback/${did}`, { method: 'POST', responseType: 'none' });
    }
    return { ...(await this.getStatus(deploymentId)), target: 'production' };
  }

  async cancel(deploymentId: string): Promise<void> {
    await this.request(`/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`, { method: 'PATCH' });
  }

  async getStatus(deploymentId: string): Promise<DeploymentInfo> {
    return this.mapDeployment(await this.getDeployment(deploymentId), { id: deploymentId });
  }

  async getLogs(deploymentId: string): Promise<DeploymentLogLine[]> {
    const { data } = await this.request<VercelEvent[] | { events?: VercelEvent[] }>(`/v3/deployments/${encodeURIComponent(deploymentId)}/events`, {
      query: { builds: 1, direction: 'forward', limit: 2000 },
    });
    const events = Array.isArray(data) ? data : (data?.events ?? []);
    return events.map((e): DeploymentLogLine => {
      const type = (e.type ?? '').toLowerCase();
      const level = (e.level ?? e.payload?.level ?? '').toLowerCase();
      const isError = type === 'stderr' || type === 'error' || type === 'fatal' || level === 'error' || level === 'fatal';
      const isWarn = type === 'warning' || level === 'warning' || level === 'warn';
      return {
        timestamp: toIso(e.created ?? e.date ?? e.payload?.date ?? e.payload?.created) ?? new Date(0).toISOString(),
        level: isError ? 'error' : isWarn ? 'warn' : 'info',
        message: e.payload?.text ?? e.text ?? '',
      };
    });
  }

  async addDomain(projectName: string, domain: string, opts?: { redirectTo?: string }): Promise<DomainConfig> {
    const project = sanitizeVercelProjectName(projectName);
    const name = normalizeDomain(domain);
    let added: VercelProjectDomain | undefined;
    try {
      const { data } = await this.request<VercelProjectDomain>(`/v10/projects/${encodeURIComponent(project)}/domains`, {
        method: 'POST',
        body: { name, redirect: opts?.redirectTo, redirectStatusCode: opts?.redirectTo ? 308 : undefined },
      });
      added = data;
    } catch (err) {
      if (errorStatus(err) !== 409) throw err;
      // Already attached? The project-scoped lookup only succeeds when it belongs to this project.
      const existing = await this.getProjectDomain(project, name);
      if (!existing) throw err;
      added = existing;
    }
    const config = await this.getDomainConfig(name);
    return buildVercelDomainConfig(name, added, config);
  }

  async removeDomain(projectName: string, domain: string): Promise<void> {
    const project = sanitizeVercelProjectName(projectName);
    await this.request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(normalizeDomain(domain))}`, {
      method: 'DELETE',
      allowStatus: [404],
      responseType: 'none',
    });
  }

  async verifyDomain(projectName: string, domain: string): Promise<DomainConfig> {
    const project = sanitizeVercelProjectName(projectName);
    const name = normalizeDomain(domain);
    // 400 = "not verified yet"; the follow-up GET reports the pending verification records.
    await this.request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(name)}/verify`, {
      method: 'POST',
      allowStatus: [400],
    });
    const [pd, config] = await Promise.all([this.getProjectDomain(project, name), this.getDomainConfig(name)]);
    return buildVercelDomainConfig(name, pd, config);
  }

  private async getProjectDomain(project: string, domain: string): Promise<VercelProjectDomain | undefined> {
    const res = await this.request<VercelProjectDomain>(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`, {
      allowStatus: [404],
    });
    return res.status === 404 ? undefined : res.data;
  }

  private async getDomainConfig(domain: string): Promise<VercelDomainConfigResponse | undefined> {
    const res = await this.request<VercelDomainConfigResponse>(`/v6/domains/${encodeURIComponent(domain)}/config`, { allowStatus: [404] });
    return res.status === 404 ? undefined : res.data;
  }

  async test(): Promise<TestResult> {
    try {
      const { data } = await this.request<{ user?: { username?: string; email?: string; id?: string } }>('/v2/user');
      const details: Record<string, unknown> = { username: data?.user?.username, email: data?.user?.email };
      if (this.config.teamId) {
        const team = await this.request<{ id?: string; name?: string; slug?: string }>(`/v2/teams/${encodeURIComponent(this.config.teamId)}`);
        details.team = team.data?.slug ?? team.data?.name ?? this.config.teamId;
      }
      const who = data?.user?.username ?? data?.user?.email ?? 'unknown user';
      return { ok: true, message: `Authenticated as ${who}${details.team ? ` (team ${String(details.team)})` : ''}`, details };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Build a DomainConfig from Vercel's project-domain + domain-config responses. */
export function buildVercelDomainConfig(domain: string, pd: VercelProjectDomain | undefined, config: VercelDomainConfigResponse | undefined): DomainConfig {
  const records: DnsRecord[] = [];
  for (const v of pd?.verification ?? []) {
    if (!v.value) continue;
    records.push({ type: 'TXT', name: v.domain ?? `_vercel.${domain}`, value: v.value, reason: v.reason ?? 'Verify domain ownership' });
  }
  if (isApexDomain(domain)) {
    const ip = rankFirst(config?.recommendedIPv4)?.value?.[0] ?? DEFAULT_APEX_IP;
    records.push({ type: 'A', name: '@', value: ip, reason: 'Point the apex domain at Vercel' });
  } else {
    const cname = rankFirst(config?.recommendedCNAME)?.value?.replace(/\.$/, '') ?? DEFAULT_CNAME;
    records.push({ type: 'CNAME', name: subdomainLabel(domain), value: cname, reason: 'Point the subdomain at Vercel' });
  }
  const misconfigured = config ? config.misconfigured === true : true;
  const verified = pd?.verified === true && !misconfigured;
  return { domain, verified, records, misconfigured, ssl: verified ? 'active' : 'pending' };
}

export const vercelDriver = defineDriver({
  kind: 'deployment',
  id: PROVIDER,
  name: 'Vercel',
  description: 'Deploy sites to Vercel via its REST API (file uploads, previews, promotions, custom domains).',
  configSchema: vercelConfigSchema,
  secretsSchema: vercelSecretsSchema,
  presets: [
    { id: 'nextjs', name: 'Next.js (server rendering)', config: { framework: 'nextjs', nodeVersion: '24.x' } },
  ],
  create: (config, secrets): DeploymentProvider => new VercelDeploymentProvider(config, secrets),
});
