import { isSafeNodeId } from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { registry } from './index';

describe('registry normalization safety', () => {
  it('re-assigns node ids that are unsafe for CSS selectors', () => {
    const { node } = registry.normalize({ id: 'x{}</style><script>', type: 'section', props: {}, children: [{ id: 'ok_child-1', type: 'heading', props: { text: 'x' } }] });
    expect(node.id).not.toContain('<');
    expect(isSafeNodeId(node.id)).toBe(true);
    expect(node.children?.[0]?.id).toBe('ok_child-1');
  });
  it('embed urls must be https; allow tokens are sanitized', () => {
    expect(registry.parseProps('embed', { mode: 'iframe', url: 'javascript:alert(1)' })).toMatchObject({ success: true, data: { url: undefined } });
    expect(registry.parseProps('embed', { mode: 'iframe', url: 'http://x.example' })).toMatchObject({ success: true, data: { url: undefined } });
    expect(registry.parseProps('embed', { mode: 'iframe', url: 'https://x.example/a', allow: 'autoplay" onload="x' })).toMatchObject({ success: true, data: { url: 'https://x.example/a', allow: 'autoplay onloadx' } });
  });
  it('link-ish props drop script URLs', () => {
    const team = registry.parseProps('team', { members: [{ name: 'A', links: [{ label: 'x', url: 'javascript:alert(1)' }] }] });
    expect(team.success && (team.data.members as Array<{ links: Array<{ url: string }> }>)[0]!.links[0]!.url).toBe('#');
    const booking = registry.parseProps('booking-cta', { bookingUrl: 'javascript:alert(1)' });
    expect(booking.success && booking.data.bookingUrl).toBe('/');
  });
});
