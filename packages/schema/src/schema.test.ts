import { describe, expect, it } from 'vitest';
import {
  NodeSchema, evaluateConditionGroup, interpolate, planFormRules, resolveBinding, resolveResponsive, setResponsive,
  validateSubmission, resolveLink, type FormRule,
} from './index';

describe('responsive values', () => {
  it('cascades desktop-first', () => {
    const v = { base: '96px', tablet: '48px', mobile: '20px' };
    expect(resolveResponsive(v, 'base')).toBe('96px');
    expect(resolveResponsive(v, 'laptop')).toBe('96px');
    expect(resolveResponsive(v, 'tablet')).toBe('48px');
    expect(resolveResponsive(v, 'mobile')).toBe('20px');
    expect(resolveResponsive({ base: 1, tablet: 2 }, 'mobile')).toBe(2);
  });
  it('sets and collapses values', () => {
    expect(setResponsive('96px', 'mobile', '20px')).toEqual({ base: '96px', mobile: '20px' });
    expect(setResponsive({ base: '96px', mobile: '20px' }, 'mobile', undefined)).toBe('96px');
  });
});

describe('node schema', () => {
  it('parses nested nodes with responsive styles', () => {
    const node = NodeSchema.parse({
      id: 'a', type: 'section', props: {}, style: { padding: { base: '96px 0', mobile: '40px 0' } },
      children: [{ id: 'b', type: 'heading', props: { text: 'Hi' } }],
    });
    expect(node.children?.[0]?.type).toBe('heading');
  });
  it('rejects bad anchors', () => {
    expect(() => NodeSchema.parse({ id: 'a', type: 'x', props: {}, anchor: '1 bad' })).toThrow();
  });
});

describe('templating', () => {
  it('interpolates paths with fallback', () => {
    expect(interpolate('Call {{business.phone}}', { business: { phone: '+977 1' } })).toBe('Call +977 1');
    expect(interpolate('{{business.fax | n/a}}', { business: {} })).toBe('n/a');
    expect(resolveBinding('{{item.image}}', { item: { image: { src: 'x' } } })).toEqual({ src: 'x' });
  });
});

describe('form rules', () => {
  const rules: FormRule[] = [
    {
      id: 'big', name: 'Big weddings', enabled: true, stopProcessing: false, otherwise: [],
      when: { match: 'all', conditions: [{ field: 'eventType', op: 'eq', value: 'wedding' }, { field: 'guestCount', op: 'gt', value: 200 }] },
      then: [{ type: 'email', to: ['events@company.com'], subject: 'Large wedding' }],
    },
    {
      id: 'geo', name: 'Region routing', enabled: true, stopProcessing: false,
      when: { match: 'all', conditions: [{ field: 'country', op: 'eq', value: 'Nepal' }] },
      then: [{ type: 'tag', tags: ['nepal'] }],
      otherwise: [{ type: 'tag', tags: ['international'] }],
    },
  ];
  it('plans then/otherwise branches', () => {
    const plan = planFormRules(rules, { eventType: 'wedding', guestCount: '250', country: 'India' });
    expect(plan.map((p) => `${p.ruleId}:${p.branch}`)).toEqual(['big:then', 'geo:otherwise']);
  });
  it('supports nested groups', () => {
    expect(evaluateConditionGroup({ match: 'any', conditions: [{ field: 'a', op: 'empty' }, { match: 'all', conditions: [{ field: 'b', op: 'eq', value: 1 }] }] }, { a: 'x', b: 1 })).toBe(true);
  });
});

describe('submission validation', () => {
  const form = {
    fields: [
      { id: '1', type: 'email' as const, name: 'email', label: 'Email', required: true, width: 'full' as const },
      { id: '2', type: 'number' as const, name: 'guests', label: 'Guests', required: false, width: 'full' as const, validation: { min: 1, max: 500 } },
      { id: '3', type: 'text' as const, name: 'venue', label: 'Venue', required: true, width: 'full' as const, showIf: { match: 'all' as const, conditions: [{ field: 'guests', op: 'gt' as const, value: 100 }] } },
    ],
  };
  it('validates and skips hidden conditional fields', () => {
    expect(validateSubmission(form, { email: 'a@b.co', guests: '20' }).valid).toBe(true);
    const r = validateSubmission(form, { email: 'nope', guests: '200' });
    expect(r.errors.map((e) => e.field).sort()).toEqual(['email', 'venue']);
  });
});

describe('links', () => {
  it('resolves page and whatsapp links', () => {
    const ctx = { pagePath: (id: string) => (id === 'p1' ? '/rooms' : undefined) };
    expect(resolveLink({ type: 'page', pageId: 'p1', anchor: 'suites' }, ctx)?.href).toBe('/rooms#suites');
    expect(resolveLink({ type: 'whatsapp', phone: '+977 98-1' }, ctx)?.href).toBe('https://wa.me/977981');
  });
});
