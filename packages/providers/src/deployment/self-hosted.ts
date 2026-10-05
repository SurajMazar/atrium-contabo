import { randomBytes } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { z } from 'zod';
import { defineDriver, type TestResult } from '../driver';
import { dnsGuidance, isApexDomain, normalizeDomain } from './dns';
import type { DeployInput, DeploymentInfo, DeploymentLogLine, DeploymentProvider, DeploymentTarget, DomainConfig } from './types';

const PROVIDER = 'self-hosted';

const hostname = z
  .string()
  .min(1)
  .transform((v) => normalizeDomain(v))
  .pipe(z.string().regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/, 'Must be a hostname'));

export const selfHostedConfigSchema = z.object({
  /** Wildcard domain sites are served from, as `{projectName}.{platformDomain}`. */
  platformDomain: hostname,
  protocol: z.enum(['https', 'http']).default('https'),
  /** Non-standard public port for site URLs (local dev, e.g. 3001); omitted for 80/443. */
  port: z.number().int().min(1).max(65535).optional(),
  /** Public IPv4 of the platform ingress (apex A records). */
  ingressIPv4: z.ipv4().optional(),
  /** Public IPv6 of the platform ingress (apex AAAA records). */
  ingressIPv6: z.ipv6().optional(),
  /** Hostname subdomains should CNAME to; defaults to platformDomain. */
  ingressCname: hostname.optional(),
  /** Label of the TXT record the platform's own ownership verifier checks (`<prefix>.<domain>`). */
  verificationTxtPrefix: z.string().min(1).default('_atrium-verify'),
});
export const selfHostedSecretsSchema = z.object({});
export type SelfHostedConfig = z.output<typeof selfHostedConfigSchema>;

/** Subset of `node:dns/promises` used for verification (injectable for tests). */
export interface DnsResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
  resolveCname(hostname: string): Promise<string[]>;
}

/** Hostname-safe label for a project: [a-z0-9-], ≤63 chars. */
export function selfHostedLabel(projectName: string): string {
  const cleaned = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 63)
    .replace(/-+$/, '');
  return cleaned || 'site';
}

/** Name of the TXT record the platform's ownership verifier expects for a domain. */
export function selfHostedVerificationRecordName(domain: string, config: Pick<SelfHostedConfig, 'verificationTxtPrefix'>): string {
  return `${config.verificationTxtPrefix}.${normalizeDomain(domain)}`;
}

async function safeLookup(fn: () => Promise<string[]>): Promise<string[]> {
  try {
    return (await fn()).map((v) => normalizeDomain(v));
  } catch {
    // ENOTFOUND / ENODATA / ESERVFAIL / timeouts all mean "not (yet) pointing at us".
    return [];
  }
}

/**
 * Platform-hosted mode: the platform's own renderer serves the published snapshot at
 * `{protocol}://{projectName}.{platformDomain}` (and on verified custom domains), so there is
 * nothing to upload — `deploy` ignores `files` and reports `ready` immediately; the worker
 * marks the snapshot live itself. TLS is terminated by the platform via on-demand certificates.
 */
export class SelfHostedDeploymentProvider implements DeploymentProvider {
  readonly driver = PROVIDER;

  constructor(
    private readonly config: SelfHostedConfig,
    private readonly resolver: DnsResolver = dnsPromises,
  ) {}

  private siteUrl(projectName: string): string {
    const port = this.config.port ? `:${this.config.port}` : '';
    return `${this.config.protocol}://${selfHostedLabel(projectName)}.${this.config.platformDomain}${port}`;
  }

  /** Recover the project label from `self-<label>-<stamp>`; undefined for foreign ids. */
  private projectFromId(id: string): string | undefined {
    return /^self-([a-z0-9-]+)-[a-z0-9]+$/.exec(id)?.[1];
  }

  private info(id: string, target: DeploymentTarget, projectName?: string): DeploymentInfo {
    const project = projectName ?? this.projectFromId(id);
    const now = new Date().toISOString();
    return { id, url: project ? this.siteUrl(project) : undefined, status: 'ready', target, createdAt: now, readyAt: now };
  }

  async deploy(input: DeployInput): Promise<DeploymentInfo> {
    const label = selfHostedLabel(input.projectName);
    const id = `self-${label}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    return this.info(id, input.target, label);
  }

  async redeploy(deploymentId: string, target?: DeploymentTarget): Promise<DeploymentInfo> {
    return this.info(deploymentId, target ?? 'production');
  }

  async rollback(projectName: string, deploymentId: string): Promise<DeploymentInfo> {
    return this.info(deploymentId, 'production', projectName);
  }

  async cancel(_deploymentId: string): Promise<void> {
    // Nothing runs remotely, so there is nothing to cancel.
  }

  async getStatus(deploymentId: string): Promise<DeploymentInfo> {
    return this.info(deploymentId, 'production');
  }

  async getLogs(deploymentId: string): Promise<DeploymentLogLine[]> {
    return [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Deployment ${deploymentId} is served by the platform renderer from the published snapshot; no build step runs.`,
      },
    ];
  }

  async addDomain(projectName: string, domain: string, _opts?: { redirectTo?: string }): Promise<DomainConfig> {
    return this.verifyDomain(projectName, domain);
  }

  async removeDomain(_projectName: string, _domain: string): Promise<void> {
    // Routing is owned by the platform (domain table); nothing to remove at a provider.
  }

  /**
   * Real DNS check: apex A must contain ingressIPv4 (or, without one, match the ingress
   * host's A records); a subdomain must CNAME to ingressCname/platformDomain (or any
   * `*.platformDomain`), or resolve to the same A records as the ingress.
   * Ownership TXT verification is left to the platform's own verifier.
   */
  async verifyDomain(_projectName: string, domain: string): Promise<DomainConfig> {
    const name = normalizeDomain(domain);
    const records = dnsGuidance(name, this.config);
    const ingressHost = normalizeDomain(this.config.ingressCname ?? this.config.platformDomain);
    const platform = normalizeDomain(this.config.platformDomain);

    const ingressIps = async (): Promise<string[]> =>
      this.config.ingressIPv4 ? [this.config.ingressIPv4] : safeLookup(() => this.resolver.resolve4(ingressHost));
    const aMatches = async (): Promise<boolean> => {
      const [actual, expected] = await Promise.all([safeLookup(() => this.resolver.resolve4(name)), ingressIps()]);
      return actual.length > 0 && actual.some((ip) => expected.includes(ip));
    };

    let verified: boolean;
    if (isApexDomain(name)) {
      verified = await aMatches();
    } else {
      const cnames = await safeLookup(() => this.resolver.resolveCname(name));
      verified =
        cnames.some((c) => c === ingressHost || c === platform || c.endsWith(`.${platform}`)) || (cnames.length === 0 && (await aMatches()));
    }
    return { domain: name, verified, records, misconfigured: !verified, ssl: verified ? 'active' : 'pending' };
  }

  async test(): Promise<TestResult> {
    return {
      ok: true,
      message: `Sites are served by the platform at ${this.config.protocol}://<project>.${this.config.platformDomain}`,
      details: { platformDomain: this.config.platformDomain, ingressIPv4: this.config.ingressIPv4, ingressCname: this.config.ingressCname },
    };
  }
}

export const selfHostedDriver = defineDriver({
  kind: 'deployment',
  id: PROVIDER,
  name: 'Platform hosted',
  description: 'Serve published sites from this platform at {project}.{platformDomain}; custom domains point at the platform ingress.',
  configSchema: selfHostedConfigSchema,
  secretsSchema: selfHostedSecretsSchema,
  create: (config): DeploymentProvider => new SelfHostedDeploymentProvider(config),
});
