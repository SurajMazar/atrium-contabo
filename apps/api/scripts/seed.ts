/**
 * Idempotent development/demo seed.
 *   pnpm db:seed            (root)  → super admin + demo organization + published demo websites
 * Uses the same site-store pipeline as the API, so seeded sites are fully editable.
 */
import 'dotenv/config';
import { normalizeWebsite } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { createPrismaClient } from '@atrium/db';
import { DEFAULT_PLANS, DEFAULT_ROLES, FEATURE_FLAGS, PERMISSIONS, type WebsiteInput } from '@atrium/schema';
import { createWebsiteFromDefinition, freezeVersion } from '@atrium/site-store';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';
import { blankWebsite } from '../src/modules/websites/blank';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const prisma = createPrismaClient();
const log = (m: string) => console.log(`  ${m}`);

interface DemoEntry {
  key: string;
  name: string;
  definition: WebsiteInput;
}

function demoSites(): DemoEntry[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('@atrium/templates') as { DEMO_SITES?: unknown };
    const raw = lib.DEMO_SITES;
    const entries = Array.isArray(raw) ? raw.map((d: { key?: string; id?: string }, i: number) => [d.key ?? d.id ?? String(i), d] as const) : Object.entries((raw ?? {}) as Record<string, unknown>);
    return entries.map(([key, v]) => {
      const t = v as { name?: string; definition?: WebsiteInput; data?: WebsiteInput; settings?: unknown };
      const definition = (t.definition ?? t.data ?? (t.settings ? (t as unknown as WebsiteInput) : undefined)) as WebsiteInput;
      return { key, name: t.name ?? (definition.settings as { name: string }).name, definition };
    });
  } catch (err) {
    log(`@atrium/templates not available (${(err as Error).message.split('\n')[0]}); seeding blank demo sites`);
    return [
      { key: 'demo-resort', name: 'Demo Resort', definition: blankWebsite('Demo Resort', 'editorial-warm') },
      { key: 'demo-corporate', name: 'Demo Corporate', definition: blankWebsite('Demo Corporate', 'corporate-modern') },
      { key: 'demo-venue', name: 'Demo Venue', definition: blankWebsite('Demo Venue', 'wedding-blush') },
    ];
  }
}

async function reference() {
  await prisma.$transaction([
    ...Object.entries(PERMISSIONS).map(([key, description]) => prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } })),
    ...DEFAULT_PLANS.map((p) => prisma.plan.upsert({ where: { key: p.key }, create: { key: p.key, name: p.name, limits: p.limits as object, features: p.features }, update: { limits: p.limits as object, features: p.features } })),
    ...Object.entries(FEATURE_FLAGS).map(([key, description]) => prisma.featureFlag.upsert({ where: { key }, create: { key, description, enabled: key !== 'collaboration' }, update: {} })),
  ]);
  log('reference data (permissions, plans, feature flags)');
}

async function admin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@atrium.localhost').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Atrium!2026';
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Atrium Admin', isSuperAdmin: true, emailVerifiedAt: new Date(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
    update: { isSuperAdmin: true },
  });
  log(`super admin ${email}`);
  return user;
}

async function organization(ownerId: string) {
  const slug = 'atrium-demo';
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) return existing;
  const org = await prisma.organization.create({ data: { name: 'Atrium Demo Studio', slug, planKey: 'enterprise' } });
  let ownerRole = '';
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.create({ data: { organizationId: org.id, key: r.key, name: r.name, description: r.description, isSystem: true, permissions: { create: r.permissions.map((p) => ({ permissionKey: p })) } } });
    if (r.key === 'owner') ownerRole = role.id;
  }
  await prisma.organizationMember.create({ data: { organizationId: org.id, userId: ownerId, roleId: ownerRole } });
  await prisma.workspace.create({ data: { organizationId: org.id, name: 'Default' } });
  log('organization "Atrium Demo Studio" (enterprise plan)');
  return org;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function sampleActivity(websiteId: string) {
  if (await prisma.analyticsEvent.count({ where: { websiteId } })) return;
  const pages = await prisma.page.findMany({ where: { websiteId }, select: { slug: true } });
  const paths = pages.map((p) => `/${p.slug}`.replace(/\/$/, '') || '/');
  const refs = ['google.com', 'instagram.com', 'tripadvisor.com', undefined, undefined, 'facebook.com'];
  const countries = ['NP', 'IN', 'US', 'GB', 'DE', 'AU', 'CN'];
  const devices = ['mobile', 'mobile', 'desktop', 'tablet'];
  const events = [];
  for (let d = 13; d >= 0; d--) {
    const n = 20 + Math.round(Math.random() * 40);
    for (let i = 0; i < n; i++) {
      const visitor = `v${d}-${Math.floor(i / 2)}`;
      events.push({ websiteId, type: 'pageview', path: paths[i % paths.length] ?? '/', referrer: refs[i % refs.length], country: countries[i % countries.length], device: devices[i % devices.length], browser: i % 3 ? 'Chrome' : 'Safari', visitorHash: sha(visitor), sessionHash: sha(`${visitor}-s`), createdAt: new Date(Date.now() - d * 86_400_000 - i * 60_000) });
    }
  }
  await prisma.analyticsEvent.createMany({ data: events });
}

async function sampleSubmissions(websiteId: string) {
  const form = await prisma.form.findFirst({ where: { websiteId, archivedAt: null }, include: { fields: true } });
  if (!form || (await prisma.formSubmission.count({ where: { websiteId } }))) return;
  const people = [
    { name: 'Asha Gurung', email: 'asha.gurung@example.com', message: 'We are planning a family trip for six in late March. Do you have connecting rooms?' },
    { name: 'Daniel Weber', email: 'd.weber@example.de', message: 'Interested in the honeymoon package for October. Is airport pickup included?' },
    { name: 'Priya Sharma', email: 'priya@example.in', message: 'Corporate retreat for 24 people, three nights. Could you share meeting room options?' },
  ];
  for (const [i, p] of people.entries()) {
    const values = Object.fromEntries(form.fields.filter((f) => ['name', 'email', 'message', 'fullName'].includes(f.name)).map((f) => [f.name, (p as Record<string, string>)[f.name === 'fullName' ? 'name' : f.name]]));
    if (!Object.keys(values).length) Object.assign(values, { name: p.name, email: p.email });
    await prisma.formSubmission.create({
      data: {
        formId: form.id, websiteId, status: i === 2 ? 'CONTACTED' : 'NEW', read: i === 2, summary: values, createdAt: new Date(Date.now() - i * 5 * 3_600_000), pageUrl: '/contact',
        values: { create: Object.entries(values).map(([k, v]) => ({ fieldName: k, fieldLabel: form.fields.find((f) => f.name === k)?.label ?? k, fieldType: form.fields.find((f) => f.name === k)?.type ?? 'text', value: String(v) })) },
      },
    });
  }
}

async function sites(orgId: string, userId: string) {
  for (const demo of demoSites()) {
    const slug = demo.key.replace(/^demo:/, '').replace(/[^a-z0-9-]/g, '-');
    if (await prisma.website.findUnique({ where: { slug } })) {
      log(`website ${slug} exists — skipped`);
      continue;
    }
    const { value, issues } = normalizeWebsite(demo.definition, registry);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length) log(`  ⚠ ${slug}: ${errors.length} component errors (first: ${errors[0]!.message})`);
    const site = await prisma.$transaction((tx) => createWebsiteFromDefinition(tx, { organizationId: orgId, name: demo.name, slug, definition: value, userId }), { timeout: 60_000 });
    await prisma.$transaction((tx) => freezeVersion(tx, site.id, { userId, message: 'Seeded demo', apiBaseUrl: `${(process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/v1` }), { timeout: 60_000 });
    await sampleSubmissions(site.id);
    await sampleActivity(site.id);
    log(`website ${demo.name} → http://${slug}.${process.env.PLATFORM_SITES_DOMAIN ?? 'sites.localhost:3001'} (${value.pages.length} pages, published)`);
  }
}

async function main() {
  console.log('Seeding Atrium…');
  await reference();
  const user = await admin();
  const org = await organization(user.id);
  await sites(org.id, user.id);
  console.log(`Done. Sign in at ${process.env.ADMIN_URL ?? 'http://localhost:3000'} with ${process.env.SEED_ADMIN_EMAIL ?? 'admin@atrium.localhost'}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
