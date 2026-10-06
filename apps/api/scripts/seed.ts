/**
 * Idempotent seed: reference data (permissions, plans, feature flags) and the single super admin —
 * nothing else. Sign in as the super admin and create organizations from the admin (only super
 * admins can). Production keeps plan limits a super admin edited. (The API also does this on every
 * start.) Demo content for the tutorial recorder lives in scripts/seed-demo.ts.
 *   pnpm db:seed   (root)
 * Uses the same site-store pipeline as the API, so seeded sites are fully editable.
 */
import 'dotenv/config';
import { createPrismaClient } from '@atrium/db';
import { DEFAULT_PLANS, FEATURE_FLAGS, PERMISSIONS } from '@atrium/schema';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const prisma = createPrismaClient();
const log = (m: string) => console.log(`  ${m}`);

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
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, isSuperAdmin: true } });
  // Sign-up is open: an account someone registered with this address is only promoted when its
  // password is SEED_ADMIN_PASSWORD (an email match alone must never grant platform control).
  if (existing && !existing.isSuperAdmin && !(generated ? false : existing.passwordHash && (await argon2.verify(existing.passwordHash, password).catch(() => false)))) {
    throw new Error(`Refusing to promote ${email}: the account already exists and its password is not SEED_ADMIN_PASSWORD. Promote an account you control with \`node dist/cli.js super-admin --email …\` instead.`);
  }
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

async function main() {
  // Validate the super-admin credentials before touching the database.
  const credentials = resolveSeedAdmin();
  const local = isLocalDevelopment();
  console.log(`Seeding Atrium (${local ? 'local development' : 'production'})…`);
  await reference(local);
  const user = await admin(credentials);
  console.log(`Done. Sign in at ${process.env.ADMIN_URL ?? 'the admin'} with ${user.email} and create your first organization.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
