import { applyOperation, normalizeWebsite } from '@atrium/builder-core';
import { createRegistry } from '@atrium/component-registry';
import { createPrismaClient } from '@atrium/db';
import { THEME_PRESETS } from '@atrium/design-tokens';
import { produce } from 'immer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWebsiteFromDefinition, loadDraft, persistDraft, toPublishedDefinition } from './index';

process.env.DATABASE_URL ??= 'postgresql://atrium:atrium@localhost:55432/atrium';
const prisma = createPrismaClient();
const registry = createRegistry();
let orgId = '';
let reachable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  await prisma.plan.upsert({ where: { key: 'starter' }, create: { key: 'starter', name: 'Starter', limits: {}, features: [] }, update: {} });
  const org = await prisma.organization.create({ data: { name: 'SiteStore Test', slug: `sst-${Date.now()}` } });
  orgId = org.id;
});

afterAll(async () => {
  if (reachable && orgId) await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});

const input = () =>
  normalizeWebsite(
    {
      settings: { name: 'Round Trip', business: { name: 'Round Trip Co' }, seo: { siteTitle: 'Round Trip' } },
      theme: THEME_PRESETS['corporate-modern']!,
      header: { type: 'site-header', props: {} },
      footer: { type: 'site-footer', props: {} },
      navigation: { menus: { primary: [{ id: 'n1', label: 'About', link: '/about' }] } },
      pages: [
        { title: 'Home', slug: '', isHomepage: true, status: 'published', sections: [{ type: 'hero', props: { heading: 'Hello' } }] },
        { title: 'About', slug: 'about', sections: [{ type: 'section', props: {}, children: [{ type: 'heading', props: { text: 'About us' } }] }] },
      ],
      forms: [{ name: 'Contact', slug: 'contact', fields: [{ id: 'f1', type: 'email', name: 'email', label: 'Email', required: true, width: 'full' }], rules: [{ id: 'r1', name: 'Notify', enabled: true, then: [{ type: 'email', to: ['a@b.co'], subject: 'New' }], otherwise: [], stopProcessing: false }] }],
      collections: [{ slug: 'rooms', name: 'Rooms', fields: [{ key: 'name', label: 'Name', type: 'text', required: true }], items: [{ id: 'i1', slug: 'deluxe', status: 'published', data: { name: 'Deluxe' }, position: 0 }, { id: 'i2', slug: 'draft-room', status: 'draft', data: { name: 'Draft' }, position: 1 }] }],
      redirects: [{ source: '/old', destination: '/about', statusCode: 301, enabled: true }],
    },
    registry,
  ).value;

describe('site-store', () => {
  it('creates, loads, edits and persists a draft losslessly', async () => {
    if (!reachable) return;
    const def = input();
    const site = await createWebsiteFromDefinition(prisma, { organizationId: orgId, name: 'Round Trip', slug: `rt-${Date.now()}`, definition: def });
    const loaded = await loadDraft(prisma, site.id);
    expect(loaded.definition).toEqual(def);

    const home = loaded.definition.pages[0]!;
    const edited = produce(loaded.definition, (d) => {
      applyOperation(d, { op: 'updateNode', pageId: home.id, nodeId: home.sections[0]!.id, props: { heading: 'Changed' } }, registry);
      applyOperation(d, { op: 'createPage', page: { title: 'Contact', slug: 'contact' } }, registry);
      applyOperation(d, { op: 'updatePage', pageId: d.pages[1]!.id, patch: { slug: 'about-us' } }, registry);
      applyOperation(d, { op: 'updateTheme', patch: { colors: { primary: '#000000' } } }, registry);
      d.forms[0]!.fields.push({ id: 'f2', type: 'text', name: 'name', label: 'Name', required: false, width: 'half' });
    });
    const res = await persistDraft(prisma, site.id, loaded.definition, edited, { versionSource: 'AI', versionMessage: 'test' });
    expect(res.changed.pages).toEqual([home.id, edited.pages[1]!.id]);
    expect(res.createdPages).toHaveLength(1);
    expect(res.changed.theme).toBe(true);
    expect(Object.keys(res.pageVersions)).toHaveLength(2);
    expect(res.revisions.theme).toBe(2);

    const reloaded = await loadDraft(prisma, site.id);
    expect(reloaded.definition).toEqual(edited);

    const published = toPublishedDefinition(reloaded.definition);
    expect(published.collections[0]!.items.map((i) => i.slug)).toEqual(['deluxe']);
  });
});
