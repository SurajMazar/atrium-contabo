import type { DomainConfig } from './types';

export type DnsRecord = DomainConfig['records'][number];

/**
 * Common two-label public suffixes. A domain whose last two labels match one of
 * these is registered at the third label (example.co.uk is an apex, www.example.co.uk is not).
 * Not a full Public Suffix List — covers the suffixes customers actually use.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  // UK
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'ac.uk', 'gov.uk', 'sch.uk',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'asn.au',
  // Nepal
  'com.np', 'org.np', 'net.np', 'edu.np', 'gov.np',
  // India
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'ac.in', 'edu.in', 'gov.in',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'ac.nz', 'govt.nz', 'geek.nz',
  // Brazil
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  // Japan
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'gr.jp',
  // Others
  'co.za', 'org.za', 'web.za', 'net.za',
  'com.mx', 'org.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve', 'com.ec',
  'com.cn', 'net.cn', 'org.cn', 'com.hk', 'org.hk', 'com.tw', 'org.tw', 'co.kr', 'or.kr',
  'com.sg', 'org.sg', 'com.my', 'org.my', 'co.id', 'or.id', 'web.id', 'co.th', 'in.th', 'com.ph', 'com.vn',
  'com.pk', 'org.pk', 'com.bd', 'org.bd', 'com.lk', 'org.lk',
  'com.tr', 'org.tr', 'co.il', 'org.il', 'com.sa', 'com.eg', 'co.ke', 'or.ke', 'com.ng', 'org.ng', 'co.ug', 'co.tz',
  'com.ua', 'org.ua', 'com.pl', 'com.ru', 'org.ru', 'co.at', 'or.at', 'com.es', 'org.es', 'com.pt', 'com.gr',
]);

/** Lowercase, trim, strip a trailing dot. */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.+$/, '');
}

/** The registrable domain ("example.co.uk" for "www.example.co.uk"). */
export function registrableDomain(domain: string): string {
  const labels = normalizeDomain(domain).split('.');
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return labels.slice(MULTI_LABEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

/** True when the domain is the zone apex (no subdomain), e.g. example.com or example.com.np. */
export function isApexDomain(domain: string): boolean {
  return registrableDomain(domain) === normalizeDomain(domain);
}

/** Record name relative to the zone: '@' for apex, otherwise the subdomain label(s) ("www", "blog.eu"). */
export function subdomainLabel(domain: string): string {
  const d = normalizeDomain(domain);
  const apex = registrableDomain(d);
  return d === apex ? '@' : d.slice(0, d.length - apex.length - 1);
}

/** Targets a platform-hosted deployment routes custom domains to. */
export interface DnsGuidanceTarget {
  platformDomain: string;
  ingressIPv4?: string;
  ingressIPv6?: string;
  ingressCname?: string;
}

/**
 * Pure DNS guidance for pointing a custom domain at a platform-hosted site:
 * - apex → A (and AAAA) records at '@' when ingress IPs are known; otherwise an
 *   ALIAS/ANAME-style CNAME at '@' (CNAME flattening) to the ingress host.
 * - subdomain → CNAME <label> → ingressCname ?? platformDomain.
 */
export function dnsGuidance(domain: string, target: DnsGuidanceTarget): DnsRecord[] {
  const host = normalizeDomain(target.ingressCname ?? target.platformDomain);
  if (!isApexDomain(domain)) {
    return [{ type: 'CNAME', name: subdomainLabel(domain), value: host, reason: `Point ${normalizeDomain(domain)} at the platform ingress` }];
  }
  const records: DnsRecord[] = [];
  if (target.ingressIPv4) records.push({ type: 'A', name: '@', value: target.ingressIPv4, reason: 'Point the apex domain at the platform ingress (IPv4)' });
  if (target.ingressIPv6) records.push({ type: 'AAAA', name: '@', value: target.ingressIPv6, reason: 'Point the apex domain at the platform ingress (IPv6)' });
  if (records.length === 0) {
    records.push({
      type: 'CNAME',
      name: '@',
      value: host,
      reason: 'Apex domains cannot hold a plain CNAME: use your DNS host’s ALIAS/ANAME or CNAME-flattening record type',
    });
  }
  return records;
}
