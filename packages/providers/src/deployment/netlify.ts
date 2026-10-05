import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult, TENANT_CONTEXT, type DriverContext } from '../driver';
import { httpRequest, type HttpRequestOptions, type HttpResponse } from '../http';
import { digestFiles, encodePathSegments, mapWithConcurrency, toIso, uniqueByDigest } from './digest';
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

const PROVIDER = 'netlify';
const API = 'https://api.netlify.com/api/v1';
const UPLOAD_CONCURRENCY = 8;
/** Netlify's load balancer for apex domains on external DNS. */
const NETLIFY_APEX_IP = '75.2.60.5';

export const netlifyConfigSchema = z.object({
  /** Team (account) slug new sites are created under; defaults to the token owner's team. */
  accountSlug: z.string().min(1).optional(),
  /** Pin every deployment to an existing site instead of resolving/creating one by project name. */
  siteId: z.string().min(1).optional(),
});
export const netlifySecretsSchema = z.object({
  /** Netlify personal access token. */
  token: z.string().min(1),
});
export type NetlifyConfig = z.output<typeof netlifyConfigSchema>;
export type NetlifySecrets = z.output<typeof netlifySecretsSchema>;

interface NetlifySite {
  id: string;
  name?: string;
  url?: string;
  ssl_url?: string;
  admin_url?: string;
  custom_domain?: string | null;
  domain_aliases?: string[] | null;
  default_domain?: string;
}

interface NetlifyDeploy {
  id: string;
  site_id?: string;
  state?: string;
  name?: string;
  url?: string;
  ssl_url?: string;
  deploy_url?: string;
  deploy_ssl_url?: string;
  admin_url?: string;
  context?: string;
  draft?: boolean;
  required?: string[];
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  summary?: { status?: string; messages?: Array<{ type?: string; title?: string; description?: string; details?: string }> };
}

interface NetlifySsl {
  state?: string;
  domains?: string[];
}

/** Netlify site names are global subdomains of netlify.app: [a-z0-9-], ≤63 chars. */
export function sanitizeNetlifySiteName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 63)
    .replace(/-+$/, '');
  return cleaned || 'atrium-site';
}

export function mapNetlifyState(state: string | undefined): DeploymentStatus {
  switch ((state ?? '').toLowerCase()) {
    case 'new':
    case 'pending':
    case 'enqueued':
      return 'queued';
    case 'ready':
      return 'ready';
    case 'error':
    case 'rejected':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      // uploading, uploaded, preparing, prepared, processing, processed, building, retrying…
      return 'building';
  }
}

export class NetlifyDeploymentProvider implements DeploymentProvider {
  readonly driver = PROVIDER;

  constructor(
    private readonly config: NetlifyConfig,
    private readonly secrets: NetlifySecrets,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {}

  private request<T>(path: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return httpRequest<T>(PROVIDER, `${API}${path}`, {
      // Fixed vendor API: error bodies may be shown; build logs can be large.
      network: this.ctx.network,
      revealErrorBody: true,
      maxResponseBytes: 16 * 1024 * 1024,
      ...opts,
      headers: { Authorization: `Bearer ${this.secrets.token}`, ...opts.headers },
    });
  }

  private async findSite(projectName: string): Promise<NetlifySite | undefined> {
    if (this.config.siteId) {
      const res = await this.request<NetlifySite>(`/sites/${encodeURIComponent(this.config.siteId)}`, { allowStatus: [404] });
      return res.status === 404 ? undefined : res.data;
    }
    const name = sanitizeNetlifySiteName(projectName);
    const { data } = await this.request<NetlifySite[]>('/sites', { query: { name, filter: 'all' } });
    return (Array.isArray(data) ? data : []).find((s) => s.name === name);
  }

  private async requireSite(projectName: string): Promise<NetlifySite> {
    const site = await this.findSite(projectName);
    if (!site) throw new ProviderError(`${PROVIDER}: site for "${projectName}" not found`, PROVIDER, false);
    return site;
  }

  private async ensureSite(projectName: string): Promise<NetlifySite> {
    const existing = await this.findSite(projectName);
    if (existing) return existing;
    if (this.config.siteId) throw new ProviderError(`${PROVIDER}: configured site ${this.config.siteId} not found`, PROVIDER, false);
    const path = this.config.accountSlug ? `/${encodeURIComponent(this.config.accountSlug)}/sites` : '/sites';
    const { data } = await this.request<NetlifySite>(path, { method: 'POST', body: { name: sanitizeNetlifySiteName(projectName) } });
    return data;
  }

  private mapDeploy(d: NetlifyDeploy, fallbackTarget?: DeploymentTarget): DeploymentInfo {
    const status = mapNetlifyState(d.state);
    const target: DeploymentTarget =
      d.draft === true || (d.context !== undefined && d.context !== 'production') ? 'preview' : (fallbackTarget ?? 'production');
    const url = target === 'preview' ? (d.deploy_ssl_url ?? d.deploy_url) : (d.ssl_url ?? d.url ?? d.deploy_ssl_url);
    return {
      id: d.id,
      url,
      status,
      target,
      createdAt: toIso(d.created_at),
      readyAt: status === 'ready' ? toIso(d.published_at ?? d.updated_at) : undefined,
      error: d.error_message ?? undefined,
      inspectorUrl: d.admin_url ? `${d.admin_url.replace(/\/$/, '')}/deploys/${d.id}` : undefined,
      projectId: d.site_id,
    };
  }

  private async getDeploy(id: string): Promise<NetlifyDeploy> {
    const { data } = await this.request<NetlifyDeploy>(`/deploys/${encodeURIComponent(id)}`);
    return data;
  }

  /**
   * File-digest deploy: send `{ "/path": sha1 }`, upload only the shas Netlify reports as
   * `required`, then return the deploy's current state. Netlify serves static files only,
   * so `nextjs` input must be built as a static export (ATRIUM_STATIC_EXPORT=1) first.
   */
  async deploy(input: DeployInput): Promise<DeploymentInfo> {
    if (input.framework === 'nextjs') {
      throw new ProviderError(
        `${PROVIDER}: the Netlify driver deploys static files only — build the site as a static export (ATRIUM_STATIC_EXPORT=1) and deploy with framework "static"`,
        PROVIDER,
        false,
      );
    }
    const site = await this.ensureSite(input.projectName);
    const files = digestFiles(PROVIDER, input.files);
    const manifest: Record<string, string> = {};
    for (const f of files) manifest[`/${f.path}`] = f.sha1;

    const { data: created } = await this.request<NetlifyDeploy>(`/sites/${encodeURIComponent(site.id)}/deploys`, {
      method: 'POST',
      body: { files: manifest, draft: input.target === 'preview', async: false },
      timeoutMs: 120_000,
    });

    const required = new Set(created.required ?? []);
    const toUpload = [...uniqueByDigest(files).values()].filter((f) => required.has(f.sha1));
    await mapWithConcurrency(toUpload, UPLOAD_CONCURRENCY, async (f) => {
      await this.request(`/deploys/${encodeURIComponent(created.id)}/files${encodePathSegments(f.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: f.buffer,
        timeoutMs: 120_000,
        responseType: 'none',
      });
    });

    const current = toUpload.length > 0 ? await this.getDeploy(created.id) : created;
    return this.mapDeploy({ ...current, site_id: current.site_id ?? site.id }, input.target);
  }

  /** Netlify "restore" re-publishes an existing deploy (always to production). */
  async redeploy(deploymentId: string, _target?: DeploymentTarget): Promise<DeploymentInfo> {
    const deploy = await this.getDeploy(deploymentId);
    if (!deploy.site_id) throw new ProviderError(`${PROVIDER}: deploy ${deploymentId} has no site id`, PROVIDER, false);
    return this.restore(deploy.site_id, deploymentId);
  }

  async rollback(projectName: string, deploymentId: string): Promise<DeploymentInfo> {
    const site = await this.requireSite(projectName);
    return this.restore(site.id, deploymentId);
  }

  private async restore(siteId: string, deploymentId: string): Promise<DeploymentInfo> {
    const { data } = await this.request<NetlifyDeploy>(
      `/sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deploymentId)}/restore`,
      { method: 'POST' },
    );
    return { ...this.mapDeploy({ ...data, id: data?.id ?? deploymentId, site_id: data?.site_id ?? siteId }), target: 'production' };
  }

  async cancel(deploymentId: string): Promise<void> {
    await this.request(`/deploys/${encodeURIComponent(deploymentId)}/cancel`, { method: 'POST', responseType: 'none' });
  }

  async getStatus(deploymentId: string): Promise<DeploymentInfo> {
    return this.mapDeploy(await this.getDeploy(deploymentId));
  }

  /**
   * Netlify has no REST endpoint for file-digest deploy logs (build logs stream over a
   * websocket only for git builds), so lines are synthesised from the deploy object.
   */
  async getLogs(deploymentId: string): Promise<DeploymentLogLine[]> {
    const d = await this.getDeploy(deploymentId);
    const ts = toIso(d.updated_at ?? d.created_at) ?? new Date().toISOString();
    const lines: DeploymentLogLine[] = [];
    if (d.created_at) lines.push({ timestamp: toIso(d.created_at) ?? ts, level: 'info', message: `Deploy ${d.id} created` });
    lines.push({ timestamp: ts, level: mapNetlifyState(d.state) === 'failed' ? 'error' : 'info', message: `State: ${d.state ?? 'unknown'}` });
    for (const m of d.summary?.messages ?? []) {
      const level = m.type === 'error' ? 'error' : m.type === 'warning' ? 'warn' : 'info';
      const text = [m.title, m.description].filter(Boolean).join(' — ');
      if (text) lines.push({ timestamp: ts, level, message: text });
    }
    if (d.error_message) lines.push({ timestamp: ts, level: 'error', message: d.error_message });
    return lines;
  }

  /**
   * The first custom domain becomes `custom_domain`; further ones are `domain_aliases`.
   * `redirectTo` is not supported by the Netlify site API (Netlify redirects aliases to the
   * primary domain itself) and is ignored.
   */
  async addDomain(projectName: string, domain: string, _opts?: { redirectTo?: string }): Promise<DomainConfig> {
    const site = await this.requireSite(projectName);
    const name = normalizeDomain(domain);
    const aliases = site.domain_aliases ?? [];
    if (site.custom_domain !== name && !aliases.includes(name)) {
      const patch = site.custom_domain ? { domain_aliases: [...aliases, name] } : { custom_domain: name };
      await this.request(`/sites/${encodeURIComponent(site.id)}`, { method: 'PATCH', body: patch });
    }
    return this.verifyDomain(projectName, name);
  }

  async removeDomain(projectName: string, domain: string): Promise<void> {
    const site = await this.findSite(projectName);
    if (!site) return;
    const name = normalizeDomain(domain);
    const aliases = site.domain_aliases ?? [];
    let patch: Record<string, unknown> | undefined;
    if (site.custom_domain === name) {
      // Promote the first alias (if any) to primary so the site keeps a custom domain.
      const [next, ...rest] = aliases;
      patch = { custom_domain: next ?? null, domain_aliases: rest };
    } else if (aliases.includes(name)) {
      patch = { domain_aliases: aliases.filter((a) => a !== name) };
    }
    if (patch) await this.request(`/sites/${encodeURIComponent(site.id)}`, { method: 'PATCH', body: patch });
  }

  async verifyDomain(projectName: string, domain: string): Promise<DomainConfig> {
    const site = await this.requireSite(projectName);
    const name = normalizeDomain(domain);
    const present = site.custom_domain === name || (site.domain_aliases ?? []).includes(name);
    let sslState: string | undefined;
    try {
      const res = await this.request<NetlifySsl>(`/sites/${encodeURIComponent(site.id)}/ssl`, { allowStatus: [404, 422] });
      if (res.ok && (!res.data?.domains || res.data.domains.includes(name))) sslState = res.data?.state;
    } catch {
      // SSL status is best-effort (not available on every plan/site state).
    }
    const issued = sslState === 'issued';
    const siteHost = site.default_domain ?? `${site.name ?? sanitizeNetlifySiteName(projectName)}.netlify.app`;
    const records: DnsRecord[] = isApexDomain(name)
      ? [{ type: 'A', name: '@', value: NETLIFY_APEX_IP, reason: 'Point the apex domain at Netlify’s load balancer' }]
      : [{ type: 'CNAME', name: subdomainLabel(name), value: siteHost, reason: 'Point the subdomain at the Netlify site' }];
    const verified = present && issued;
    return {
      domain: name,
      verified,
      records,
      misconfigured: !present,
      ssl: issued ? 'active' : sslState === 'error' || sslState === 'failed' ? 'error' : 'pending',
    };
  }

  async test(): Promise<TestResult> {
    try {
      const { data } = await this.request<{ email?: string; full_name?: string; slug?: string }>('/user');
      return {
        ok: true,
        message: `Authenticated as ${data?.email ?? data?.full_name ?? 'unknown user'}`,
        details: { email: data?.email, name: data?.full_name },
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const netlifyDriver = defineDriver({
  kind: 'deployment',
  id: PROVIDER,
  name: 'Netlify',
  description: 'Deploy static exports to Netlify with file-digest uploads; custom domains via site settings.',
  configSchema: netlifyConfigSchema,
  secretsSchema: netlifySecretsSchema,
  create: (config, secrets, ctx): DeploymentProvider => new NetlifyDeploymentProvider(config, secrets, ctx),
});
