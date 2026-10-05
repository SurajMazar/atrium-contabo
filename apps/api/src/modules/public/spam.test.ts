import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../media/media.service';
import { spamScore } from './spam';

describe('spamScore', () => {
  it('flags honeypots and link spam, passes normal enquiries', () => {
    expect(spamScore({ msg: 'hi' }, { honeypot: true })).toBe(1);
    expect(spamScore({ msg: 'We would love to host our wedding in May for 120 guests.' }, { honeypot: false, captchaScore: 0.9, elapsedMs: 40_000 })).toBeLessThan(0.2);
    expect(spamScore({ msg: 'best seo services http://a http://b http://c' }, { honeypot: false, elapsedMs: 500 })).toBeGreaterThanOrEqual(0.8);
  });
});

describe('sanitizeSvg', () => {
  it('removes scripts, handlers and javascript urls', () => {
    const out = sanitizeSvg('<svg onload="x()"><script>alert(1)</script><a href="javascript:alert(1)"><rect onclick="y()"/></a></svg>');
    expect(out).not.toMatch(/script|onload|onclick|javascript:/i);
  });
});
