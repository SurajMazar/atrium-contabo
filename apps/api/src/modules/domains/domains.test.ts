import { describe, expect, it } from 'vitest';
import { DomainsService } from './domains.service';

const service = new DomainsService(null as never, null as never, null as never, null as never, null as never);

describe('custom domains', () => {
  it('treats names under second-level registry suffixes as root domains', () => {
    expect(service.isApex('example.com')).toBe(true);
    expect(service.isApex('leelagarden.com.np')).toBe(true);
    expect(service.isApex('example.co.uk')).toBe(true);
    expect(service.isApex('www.leelagarden.com.np')).toBe(false);
    expect(service.isApex('shop.example.com')).toBe(false);
    expect(service.isApex('a.b.example.com')).toBe(false);
  });
});
