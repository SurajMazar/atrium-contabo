import { normalizeWebsite } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import type { WebsiteDefinition, WebsiteInput } from '@atrium/schema';
// Templates are consumed from source (renderer-core does not depend on the templates package at runtime).
import { BLUEPRINTS, DEMO_SITES } from '../../templates/src/index';

export function normalize(input: WebsiteInput): WebsiteDefinition {
  const { value, issues } = normalizeWebsite(input, registry);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  return value;
}

export const demos = DEMO_SITES.map((d) => ({ key: d.key, def: normalize(d.website) }));
export const blueprints = BLUEPRINTS.map((b) => ({ key: b.key, def: normalize(b.build({ businessName: 'Smoke Test Co', email: 'hi@example.com', phone: '+1 555 0100', address: '1 Main St, Springfield, USA' })) }));
export const aranya = demos.find((d) => d.key === 'aranya-lake-retreat')!.def;
