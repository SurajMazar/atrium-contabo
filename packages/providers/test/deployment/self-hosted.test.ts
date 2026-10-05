import { describe, expect, it } from 'vitest';
import { dnsGuidance, isApexDomain, subdomainLabel } from '../../src/deployment/dns';
import { SelfHostedDeploymentProvider, selfHostedDriver, type DnsResolver } from '../../src/deployment/self-hosted';
import { deploymentDrivers } from '../../src/deployment';

const notFound = () => Promise.reject(Object.assign(new Error('queryA ENOTFOUND'), { code: 'ENOTFOUND' }));

function resolver(map: { a?: Record<string, string[]>; cname?: Record<string, string[]> }): DnsResolver {
  return {
    resolve4: (h) => (map.a?.[h] ? Promise.resolve(map.a[h]) : notFound()),
    resolve6: () => notFound(),
    resolveCname: (h) => (map.cname?.[h] ? Promise.resolve(map.cname[h]) : notFound()),
  };
}

const config = selfHostedDriver.configSchema.parse({
  platformDomain: 'Sites.Example.com',
  ingressIPv4: '203.0.113.10',
  ingressIPv6: '2001:db8::1',
  ingressCname: 'ingress.example.com',
});

describe('self-hosted driver', () => {
  it('parses config with defaults', () => {
    const c = selfHostedDriver.configSchema.parse({ platformDomain: 'sites.example.com' });
    expect(c).toMatchObject({ platformDomain: 'sites.example.com', protocol: 'https', verificationTxtPrefix: '_atrium-verify' });
    expect(() => selfHostedDriver.configSchema.parse({ platformDomain: 'not a host' })).toThrow();
    expect(() => selfHostedDriver.configSchema.parse({ platformDomain: 'a.com', ingressIPv4: '999.1.1.1' })).toThrow();
  });

  it('deploy is a no-op returning ready with the platform URL', async () => {
    const p = selfHostedDriver.create(config, {});
    const info = await p.deploy({ projectName: 'My Site', target: 'production', framework: 'nextjs', files: [{ path: 'x', content: 'ignored' }] });
    expect(info.status).toBe('ready');
    expect(info.target).toBe('production');
    expect(info.url).toBe('https://my-site.sites.example.com');
    expect(info.id).toMatch(/^self-my-site-[a-z0-9]+$/);
    expect(info.readyAt).toBeDefined();

    const status = await p.getStatus(info.id);
    expect(status).toMatchObject({ id: info.id, status: 'ready', url: 'https://my-site.sites.example.com' });
    expect(await p.getLogs(info.id)).toHaveLength(1);
    expect(await p.rollback('my-site', 'self-my-site-abc')).toMatchObject({ id: 'self-my-site-abc', status: 'ready', target: 'production' });
    expect((await p.test()).ok).toBe(true);
  });

  it.each([
    ['example.com', true],
    ['Example.COM.', true],
    ['www.example.com', false],
    ['a.b.example.com', false],
    ['example.co.uk', true],
    ['www.example.co.uk', false],
    ['example.com.np', true],
    ['shop.example.com.np', false],
    ['example.com.au', true],
    ['example.co.jp', true],
    ['blog.example.co.nz', false],
  ])('isApexDomain(%s) = %s', (domain, expected) => {
    expect(isApexDomain(domain)).toBe(expected);
  });

  it('subdomainLabel strips the registrable domain', () => {
    expect(subdomainLabel('example.com')).toBe('@');
    expect(subdomainLabel('www.example.com')).toBe('www');
    expect(subdomainLabel('a.b.example.co.uk')).toBe('a.b');
  });

  it('dnsGuidance: apex → A/AAAA, subdomain → CNAME', () => {
    expect(dnsGuidance('example.com', config)).toEqual([
      { type: 'A', name: '@', value: '203.0.113.10', reason: expect.any(String) },
      { type: 'AAAA', name: '@', value: '2001:db8::1', reason: expect.any(String) },
    ]);
    expect(dnsGuidance('www.example.com', config)).toEqual([{ type: 'CNAME', name: 'www', value: 'ingress.example.com', reason: expect.any(String) }]);
    expect(dnsGuidance('blog.example.com', { platformDomain: 'sites.example.com' })).toEqual([
      { type: 'CNAME', name: 'blog', value: 'sites.example.com', reason: expect.any(String) },
    ]);
    // apex without ingress IPs → flattened CNAME guidance
    expect(dnsGuidance('example.com', { platformDomain: 'sites.example.com' })).toEqual([
      { type: 'CNAME', name: '@', value: 'sites.example.com', reason: expect.stringMatching(/ALIAS/) },
    ]);
  });

  it('verifyDomain performs DNS lookups', async () => {
    const p = new SelfHostedDeploymentProvider(
      config,
      resolver({
        a: { 'example.com': ['203.0.113.10'], 'wrong.com': ['198.51.100.1'] },
        cname: { 'www.example.com': ['ingress.example.com.'], 'shop.example.com': ['my-site.sites.example.com'] },
      }),
    );
    expect(await p.verifyDomain('my-site', 'example.com')).toMatchObject({ verified: true, ssl: 'active', misconfigured: false });
    expect(await p.verifyDomain('my-site', 'www.example.com')).toMatchObject({ verified: true, ssl: 'active' });
    expect((await p.verifyDomain('my-site', 'shop.example.com')).verified).toBe(true);
    expect(await p.verifyDomain('my-site', 'wrong.com')).toMatchObject({ verified: false, ssl: 'pending', misconfigured: true });
    expect((await p.verifyDomain('my-site', 'missing.example.org')).verified).toBe(false);
  });

  it('exports all deployment drivers', () => {
    expect(deploymentDrivers.map((d) => d.id)).toEqual(['vercel', 'netlify', 'cloudflare-pages', 'self-hosted']);
    expect(deploymentDrivers.every((d) => d.kind === 'deployment')).toBe(true);
  });
});
