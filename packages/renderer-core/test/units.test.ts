import { describe, expect, it } from 'vitest';
import { createRenderContext, formIslandProps, interpolateProps, resolveIcon, sanitizeHtml } from '../src/index';
import { buildBookingUrl } from '../src/islands/booking';
import { aranya } from './fixtures';

describe('sanitizeHtml', () => {
  it('removes scripts, handlers and javascript: URLs but keeps formatting', () => {
    const out = sanitizeHtml('<p onclick="x()">Hi <strong>there</strong><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="/ok" target="_blank">ok</a><iframe src="https://e.com"></iframe></p>');
    expect(out).toBe('<p>Hi <strong>there</strong><a>bad</a><a href="/ok" target="_blank" rel="noopener noreferrer">ok</a></p>');
  });
  it('optionally allows allowlisted https iframes (sandboxed)', () => {
    expect(sanitizeHtml('<iframe src="https://www.youtube-nocookie.com/embed/x" onload="x"></iframe>', { allowIframes: true })).toContain('sandbox=');
    expect(sanitizeHtml('<iframe src="https://e.com/x" onload="x"></iframe>', { allowIframes: true })).toBe('');
    expect(sanitizeHtml('<iframe src="http://e.com/x"></iframe>', { allowIframes: true })).not.toContain('src=');
  });
});

describe('forms', () => {
  it('never sends form rules (recipients, webhooks) to the browser', () => {
    const ctx = createRenderContext({ definition: aranya, mode: 'live', apiBaseUrl: 'http://api.test/v1' });
    const form = aranya.forms[0]!;
    const props = formIslandProps(ctx, 'n', form.id)!;
    expect(props.formId).toBe(form.id);
    expect(JSON.stringify(props)).not.toContain('@aranya.example');
    expect('rules' in props.form).toBe(false);
  });
});

describe('helpers', () => {
  it('merges MediaRef values bound with {{item.image}}', () => {
    const out = interpolateProps({ image: { src: '{{item.image}}', alt: '{{item.name}}' } }, { item: { name: 'Suite', image: { src: 'https://x/y.jpg', width: 10, height: 5 } } });
    expect(out.image).toEqual({ src: 'https://x/y.jpg', alt: 'Suite', width: 10, height: 5 });
  });
  it('builds booking engine URLs with query params', () => {
    const url = buildBookingUrl({ bookingUrl: 'https://book.test/r?lang=en', arrivalParam: 'in', departureParam: 'out', guestsParam: 'a', extraParams: [{ key: 'hotel', value: 'h1' }] }, { arrival: '2026-11-01', departure: '2026-11-03', guests: 2 });
    expect(url).toBe('https://book.test/r?lang=en&in=2026-11-01&out=2026-11-03&a=2&hotel=h1');
  });
  it('resolves icons by lucide name, PascalCase, alias and brand', () => {
    expect(resolveIcon('map-pin')).toBeTruthy();
    expect(resolveIcon('MapPin')).toBeTruthy();
    expect(resolveIcon('pool')).toBeTruthy();
    expect(resolveIcon('instagram')).toBeTruthy();
    expect(resolveIcon('definitely-not-an-icon')).toBeUndefined();
  });
});
