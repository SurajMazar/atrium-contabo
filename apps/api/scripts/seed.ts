/**
 * Idempotent seed.
 *   Local development (NODE_ENV≠production and a local database):
 *     pnpm db:seed                     (root) → reference data, super admin and an empty organization
 *     SEED_DEMO_SITES=1 pnpm db:seed   (root) → also the published demo websites (used by the tutorial recorder)
 *   Production (anything else): reference data and the single super admin only — no organization,
 *   no demo content. Sign in and create your organization from the admin. Existing plans keep the
 *   limits a super admin set. (The API also does this on every start; the seed is optional there.)
 * Uses the same site-store pipeline as the API, so seeded sites are fully editable.
 */
import 'dotenv/config';
import { normalizeWebsite } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { createPrismaClient } from '@atrium/db';
import { DEFAULT_PLANS, DEFAULT_ROLES, FEATURE_FLAGS, PERMISSIONS, type WebsiteInput } from '@atrium/schema';
import { createWebsiteFromDefinition, freezeVersion } from '@atrium/site-store';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
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
      const t = v as { name?: string; slug?: string; definition?: WebsiteInput; data?: WebsiteInput; settings?: unknown };
      const definition = (t.definition ?? (t as { website?: WebsiteInput }).website ?? t.data ?? (t.settings ? (t as unknown as WebsiteInput) : undefined)) as WebsiteInput;
      return { key: t.slug ?? key, name: t.name ?? (definition.settings as { name: string }).name, definition };
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

async function reference(local: boolean) {
  await prisma.$transaction([
    ...Object.entries(PERMISSIONS).map(([key, description]) => prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } })),
    // Production keeps plan limits a super admin edited; local development resets them to the defaults.
    ...DEFAULT_PLANS.map((p) => prisma.plan.upsert({ where: { key: p.key }, create: { key: p.key, name: p.name, limits: p.limits as object, features: p.features }, update: local ? { limits: p.limits as object, features: p.features } : {} })),
    ...Object.entries(FEATURE_FLAGS).map(([key, description]) => prisma.featureFlag.upsert({ where: { key }, create: { key, description, enabled: key !== 'collaboration' }, update: {} })),
  ]);
  log('reference data (permissions, plans, feature flags)');
}

const EXAMPLE_ADMIN_EMAIL = 'admin@atrium.localhost';
const EXAMPLE_ADMIN_PASSWORD = 'Atrium!2026';
const MIN_ADMIN_PASSWORD = 12;
/** Database hosts that count as "local development" (compose service name included). */
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres']);

function databaseHost(env: NodeJS.ProcessEnv): string | undefined {
  try {
    return new URL(env.DATABASE_URL ?? '').hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Local dev (NODE_ENV≠production and a local DATABASE_URL host) keeps the documented .env.example
 * credentials. Anywhere else the super-admin credentials must be explicit and strong: SEED_ADMIN_EMAIL
 * is required, the .env.example values are rejected, and a missing SEED_ADMIN_PASSWORD is replaced by a
 * random one-time password printed once (change it after the first sign-in).
 */
/** Local development: NODE_ENV≠production and the database is on this machine / the compose network. */
export function isLocalDevelopment(env: NodeJS.ProcessEnv = process.env): boolean {
  const host = databaseHost(env);
  return env.NODE_ENV !== 'production' && !!host && LOCAL_DB_HOSTS.has(host);
}

export function resolveSeedAdmin(env: NodeJS.ProcessEnv = process.env): { email: string; password: string; generated: boolean } {
  const host = databaseHost(env);
  const local = isLocalDevelopment(env);
  const email = (env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD ?? '';
  if (local) return { email: email || EXAMPLE_ADMIN_EMAIL, password: password || EXAMPLE_ADMIN_PASSWORD, generated: false };

  const why = env.NODE_ENV === 'production' ? 'NODE_ENV=production' : `DATABASE_URL host "${host ?? '?'}" is not local`;
  const problems: string[] = [];
  if (!email) problems.push('SEED_ADMIN_EMAIL is required');
  else if (email === EXAMPLE_ADMIN_EMAIL || email.endsWith('.localhost')) problems.push(`SEED_ADMIN_EMAIL "${email}" is the .env.example/local value`);
  if (password && password === EXAMPLE_ADMIN_PASSWORD) problems.push('SEED_ADMIN_PASSWORD is the .env.example value');
  else if (password && password.length < MIN_ADMIN_PASSWORD) problems.push(`SEED_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD} characters`);
  else if (password && /change[-_ ]?me|replace[-_ ]?me/i.test(password)) problems.push('SEED_ADMIN_PASSWORD is a placeholder');
  if (problems.length) throw new Error(`Refusing to seed (${why}):\n${problems.map((p) => `  - ${p}`).join('\n')}\nSet strong values in the deploy env file (e.g. \`atrium config set SEED_ADMIN_PASSWORD --generate\`).`);
  if (password) return { email, password, generated: false };
  return { email, password: randomBytes(18).toString('base64url'), generated: true };
}

async function admin({ email, password, generated }: ReturnType<typeof resolveSeedAdmin>) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Atrium Admin', isSuperAdmin: true, emailVerifiedAt: new Date(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
    update: { isSuperAdmin: true },
  });
  log(`super admin ${email}`);
  if (generated && !existing) {
    // Printed once — it is not stored anywhere else.
    console.log(`\n  One-time super-admin password (sign in and change it now): ${password}\n`);
  }
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
  // Validate the super-admin credentials before touching the database.
  const credentials = resolveSeedAdmin();
  const local = isLocalDevelopment();
  console.log(`Seeding Atrium (${local ? 'local development' : 'production: reference data + super admin only'})…`);
  await reference(local);
  const user = await admin(credentials);
  if (!local) {
    console.log(`Done. Sign in at ${process.env.ADMIN_URL ?? 'the admin'} with ${user.email} and create your organization.`);
    return;
  }
  const org = await organization(user.id);
  // Demo websites are opt-in: a normal seed leaves the organization empty, ready for your own sites.
  if (['1', 'true', 'yes'].includes((process.env.SEED_DEMO_SITES ?? '').toLowerCase())) await sites(org.id, user.id);
  else log('demo websites skipped (set SEED_DEMO_SITES=1 to add them)');
  console.log(`Done. Sign in at ${process.env.ADMIN_URL ?? 'http://localhost:3000'} with ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
