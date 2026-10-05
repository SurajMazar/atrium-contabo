import { Injectable, Logger } from '@nestjs/common';
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

  isApex(hostname: string) {
    return hostname.split('.').length === 2;
  }

  platformRecords(hostname: string, token: string): DnsRecord[] {
    const records: DnsRecord[] = this.isApex(hostname)
      ? [{ type: 'A', name: '@', value: env().PLATFORM_INGRESS_IP, reason: 'Points your root domain at the Atrium edge' }]
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

  async add(websiteId: string, raw: string, user: AuthUser) {
    const hostname = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
    if (!HOSTNAME.test(hostname)) throw badRequest('Enter a valid domain like example.com or www.example.com');
    if (hostname.endsWith(env().PLATFORM_SITES_DOMAIN.split(':')[0]!)) throw badRequest('Platform subdomains are assigned automatically');
    if (await this.db.domain.findUnique({ where: { hostname } })) throw conflict('This domain is already connected to a website');
    const { site, provider } = await this.providerFor(websiteId);
    await this.orgs.assertLimit(site.organizationId, 'customDomains');
    const token = `atrium-verify=${randomToken(16)}`;
    let records = this.platformRecords(hostname, token);
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
    const d = await this.db.domain.create({ data: { websiteId, hostname, isPrimary: isFirst, provider: providerName, verificationToken: token, dnsRecords: records as object[], status: 'pending' } });
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
      let pointing = false;
      if (this.isApex(d.hostname)) pointing = (await resolve4(d.hostname).catch(() => [] as string[])).includes(env().PLATFORM_INGRESS_IP);
      else pointing = (await resolveCname(d.hostname).catch(() => [] as string[])).some((c) => c.replace(/\.$/, '') === env().PLATFORM_CNAME_TARGET);
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
