import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { resolve4, resolveCname, resolveTxt } from 'node:dns/promises';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, conflict } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { randomToken } from '../../common/tokens';
import { OrganizationsService } from '../organizations/organizations.service';
import { ResolverService } from '../providers/resolver.service';

const HOSTNAME = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;
/** Second-level registry suffixes of country TLDs (`example.com.np`, `example.co.uk` are root domains). */
const SECOND_LEVEL_SUFFIX = /\.(?:com|net|org|edu|gov|mil|co|ac|or|ne|go|gen|info|biz|ltd|plc|nom|sch|me|int)\.[a-z]{2}$/;
/** RFC 5737 documentation address used as the default PLATFORM_INGRESS_IP: means "not configured". */
const PLACEHOLDER_INGRESS_IP = '203.0.113.10';

/** Hostnames of the platform's own apps (admin, API, renderer, preview) — never claimable by tenants. */
function platformHostnames(): Set<string> {
  const out = new Set<string>();
  for (const u of [env().ADMIN_URL, env().API_URL, env().RENDERER_URL, env().PREVIEW_URL]) {
    try {
      out.add(new URL(u).hostname.toLowerCase());
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  reason: string;
}

@Injectable()
export class DomainsService {
  private readonly logger = new Logger('Domains');
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgs: OrganizationsService,
    private readonly resolver: ResolverService,
    private readonly audit: AuditService,
    private readonly queues: QueueService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  dto(d: { id: string; hostname: string; isPrimary: boolean; redirectToPrimary: boolean; environment: string; provider: string; status: string; dnsStatus: string; sslStatus: string; dnsRecords: unknown; verifiedAt: Date | null; lastCheckedAt: Date | null }) {
    return { id: d.id, hostname: d.hostname, isPrimary: d.isPrimary, redirectToPrimary: d.redirectToPrimary, environment: d.environment, provider: d.provider, status: d.status, dnsStatus: d.dnsStatus, sslStatus: d.sslStatus, dnsRecords: d.dnsRecords as DnsRecord[], verifiedAt: d.verifiedAt?.toISOString() ?? null, lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null };
  }

  /** Root (registrable) domain: `example.com`, or `example.com.np` / `example.co.uk` under a second-level suffix. */
  isApex(hostname: string) {
    const labels = hostname.split('.').length;
    return labels === 2 || (labels === 3 && SECOND_LEVEL_SUFFIX.test(hostname));
  }

  /**
   * Addresses of the platform edge: PLATFORM_INGRESS_IP when configured, plus whatever PLATFORM_CNAME_TARGET
   * resolves to, so an A record that points at the edge counts even when the IP is not in the env.
   */
  async ingressIps(): Promise<string[]> {
    const ips = new Set<string>();
    if (env().PLATFORM_INGRESS_IP && env().PLATFORM_INGRESS_IP !== PLACEHOLDER_INGRESS_IP) ips.add(env().PLATFORM_INGRESS_IP);
    for (const ip of await resolve4(env().PLATFORM_CNAME_TARGET).catch(() => [] as string[])) ips.add(ip);
    return [...ips];
  }

  async platformRecords(hostname: string, token: string): Promise<DnsRecord[]> {
    const records: DnsRecord[] = this.isApex(hostname)
      ? [{ type: 'A', name: '@', value: (await this.ingressIps())[0] ?? env().PLATFORM_INGRESS_IP, reason: 'Points your root domain at the Atrium edge' }]
      : [{ type: 'CNAME', name: hostname.split('.')[0]!, value: env().PLATFORM_CNAME_TARGET, reason: 'Points this subdomain at the Atrium edge' }];
    records.push({ type: 'TXT', name: `_atrium-verify.${hostname}`, value: token, reason: 'Proves you own this domain' });
    return records;
  }

  async list(websiteId: string) {
    return (await this.db.domain.findMany({ where: { websiteId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] })).map((d) => this.dto(d));
  }

  private async providerFor(websiteId: string) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    if (site.deploymentMode !== 'INDEPENDENT' || !site.deploymentIntegrationId) return { site, provider: null };
    const provider = await this.resolver.resolver.deployment({ organizationId: site.organizationId, websiteId, providerId: site.deploymentIntegrationId });
    return { site, provider };
  }

  /**
   * Organization-specific proof token for claiming a hostname that another account has already
   * added. Deterministic (HMAC), so the claimant can publish it before retrying.
   */
  claimToken(organizationId: string, hostname: string) {
    return `atrium-claim=${createHmac('sha256', env().ENCRYPTION_KEY).update(`domain-claim|${organizationId}|${hostname}`).digest('base64url').slice(0, 32)}`;
  }

  async add(websiteId: string, raw: string, user: AuthUser) {
    const hostname = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
    if (!HOSTNAME.test(hostname)) throw badRequest('Enter a valid domain like example.com or www.example.com');
    const platformHost = env().PLATFORM_SITES_DOMAIN.split(':')[0]!;
    if (hostname === platformHost || hostname.endsWith(`.${platformHost}`)) throw badRequest('Platform subdomains are assigned automatically');
    if (platformHostnames().has(hostname)) throw badRequest('This domain is used by the platform');
    const { site, provider } = await this.providerFor(websiteId);
    const existing = await this.db.domain.findUnique({ where: { hostname }, include: { website: { select: { organizationId: true } } } });
    if (existing) {
      if (existing.websiteId === websiteId) throw conflict('This domain is already connected to this website');
      // Someone else holds the hostname. Ownership proof wins: if the requester has published their claim
      // TXT record, the other (stale or squatted) connection is released. Otherwise explain how to prove it.
      const claim = this.claimToken(site.organizationId, hostname);
      const txt = await resolveTxt(`_atrium-verify.${hostname}`).catch(() => [] as string[][]);
      if (!txt.some((parts) => parts.join('') === claim)) {
        throw conflict(`This domain is connected to another website. If you own it, add a TXT record at _atrium-verify.${hostname} with the value ${claim} and try again.`, { claimRecord: { type: 'TXT', name: `_atrium-verify.${hostname}`, value: claim } });
      }
      await this.db.domain.delete({ where: { id: existing.id } });
      await this.audit.log({ organizationId: existing.website.organizationId, websiteId: existing.websiteId, actor: null, action: 'domain.released', resourceType: 'domain', resourceId: existing.id, summary: `${hostname} was claimed by its verified owner and disconnected from this website` });
      await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'domain.claimed', resourceType: 'domain', summary: `${user.name} proved ownership of ${hostname} and took it over from another website` });
    }
    await this.orgs.assertLimit(site.organizationId, 'customDomains');
    const token = `atrium-verify=${randomToken(16)}`;
    let records = await this.platformRecords(hostname, token);
    let providerName = 'platform';
    if (provider) {
      providerName = provider.driver;
      try {
        const cfg = await provider.addDomain(site.externalProject ?? site.slug, hostname);
        records = cfg.records;
      } catch (err) {
        throw badRequest(`The deployment provider rejected this domain: ${(err as Error).message}`);
      }
    }
    const isFirst = (await this.db.domain.count({ where: { websiteId } })) === 0;
    let d;
    try {
      d = await this.db.domain.create({ data: { websiteId, hostname, isPrimary: isFirst, provider: providerName, verificationToken: token, dnsRecords: records as object[], status: 'pending' } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflict('This domain was just connected to another website');
      throw err;
    }
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'domain.added', resourceType: 'domain', resourceId: d.id, summary: `${user.name} added domain ${hostname}` });
    return this.dto(d);
  }

  async update(id: string, body: { isPrimary?: boolean; redirectToPrimary?: boolean }) {
    const d = await this.db.domain.findUniqueOrThrow({ where: { id } });
    if (body.isPrimary) await this.db.domain.updateMany({ where: { websiteId: d.websiteId, id: { not: id } }, data: { isPrimary: false } });
    return this.dto(await this.db.domain.update({ where: { id }, data: body }));
  }

  async remove(id: string, user: AuthUser) {
    const d = await this.db.domain.findUniqueOrThrow({ where: { id } });
    const { site, provider } = await this.providerFor(d.websiteId);
    if (provider) await provider.removeDomain(site.externalProject ?? site.slug, d.hostname).catch((err: Error) => this.logger.warn(`provider removeDomain failed: ${err.message}`));
    await this.db.domain.delete({ where: { id } });
    if (d.isPrimary) {
      const next = await this.db.domain.findFirst({ where: { websiteId: d.websiteId }, orderBy: { createdAt: 'asc' } });
      if (next) await this.db.domain.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await this.audit.log({ organizationId: site.organizationId, websiteId: d.websiteId, actor: user, action: 'domain.removed', resourceType: 'domain', resourceId: id, summary: `${user.name} removed domain ${d.hostname}` });
  }

  /** Check DNS (platform) or ask the provider (independent) and update status. */
  async verify(id: string) {
    const d = await this.db.domain.findUniqueOrThrow({ where: { id } });
    const { site, provider } = await this.providerFor(d.websiteId);
    let verified = false;
    let dnsStatus = 'unverified';
    let records = d.dnsRecords as unknown as DnsRecord[];
    let ssl = d.sslStatus;
    if (provider) {
      const cfg = await provider.verifyDomain(site.externalProject ?? site.slug, d.hostname);
      verified = cfg.verified && !cfg.misconfigured;
      dnsStatus = cfg.misconfigured ? 'misconfigured' : verified ? 'valid' : 'pending';
      records = cfg.records.length ? cfg.records : records;
      ssl = cfg.ssl ?? (verified ? 'active' : 'pending');
    } else {
      const txt = await resolveTxt(`_atrium-verify.${d.hostname}`).catch(() => [] as string[][]);
      const ownership = txt.some((parts) => parts.join('') === d.verificationToken);
      // Either record style counts: a CNAME to the platform target, or A records at the edge's addresses
      // (root domains cannot use a CNAME; some subdomains use A records too).
      const [cnames, addresses, ingress] = await Promise.all([
        resolveCname(d.hostname).catch(() => [] as string[]),
        resolve4(d.hostname).catch(() => [] as string[]),
        this.ingressIps(),
      ]);
      const pointing = cnames.some((c) => c.replace(/\.$/, '') === env().PLATFORM_CNAME_TARGET) || addresses.some((ip) => ingress.includes(ip));
      records = await this.platformRecords(d.hostname, d.verificationToken);
      verified = ownership && pointing;
      dnsStatus = verified ? 'valid' : ownership ? 'not-pointing' : pointing ? 'ownership-pending' : 'unverified';
      // TLS is provisioned on demand by the edge (Caddy on-demand TLS) once DNS points here.
      ssl = verified ? 'active' : 'pending';
    }
    const updated = await this.db.domain.update({ where: { id }, data: { status: verified ? 'active' : 'pending', dnsStatus, sslStatus: ssl, dnsRecords: records as object[], verifiedAt: verified ? (d.verifiedAt ?? new Date()) : null, lastCheckedAt: new Date() } });
    if (verified && !d.verifiedAt) await this.queues.emit(site.organizationId, d.websiteId, 'domain.verified', { hostname: d.hostname });
    return this.dto(updated);
  }
}
