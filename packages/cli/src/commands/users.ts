import type { Command } from 'commander';
import { getMe } from '../lib/api';
import { context, type Context } from '../lib/context';
import { loadDbPackage, loadWorkspacePackage, requireFrom, type PrismaLike } from '../lib/db';
import { examples } from '../lib/help';
import { CliError, ask, color, log, readStdin, task } from '../lib/ui';

type Argon2 = { hash(pw: string, opts?: { type?: number }): Promise<string>; argon2id: number };

function loadArgon2(root: string): Argon2 {
  for (const dir of ['apps/api', 'packages/server-kit']) {
    try {
      return requireFrom<Argon2>(root, dir, 'argon2');
    } catch {
      /* try next */
    }
  }
  throw new CliError('argon2 is not installed', 'Run `pnpm install` at the repository root (argon2 is a dependency of apps/api).');
}

async function withPrisma<T>(ctx: Context, fn: (prisma: PrismaLike) => Promise<T>): Promise<T> {
  if (!ctx.vars.DATABASE_URL) throw new CliError('DATABASE_URL is not set');
  const prisma = loadDbPackage(ctx.root).createPrismaClient({ url: ctx.vars.DATABASE_URL, max: 2 });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export function validatePassword(pw: string): string | undefined {
  if (pw.length < 10) return 'at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/[^A-Za-z]/.test(pw)) return 'mix letters with digits or symbols';
  return undefined;
}

async function obtainPassword(opts: { password?: string; passwordStdin?: boolean }, label = 'Password'): Promise<string> {
  let pw = opts.password;
  if (opts.password) log.warn('Passing --password on the command line leaves it in shell history; prefer the prompt or --password-stdin.');
  if (!pw && opts.passwordStdin) pw = await readStdin();
  if (!pw) {
    pw = await ask.password(label, { validate: (v) => validatePassword(v) });
    const again = await ask.password('Repeat password');
    if (again !== pw) throw new CliError('Passwords do not match');
  }
  const problem = validatePassword(pw);
  if (problem) throw new CliError(`Weak password: ${problem}`);
  return pw;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

interface DefaultRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

export function registerUsers(program: Command) {
  program
    .command('create-user')
    .description('Create a user directly in the database (admin operation; like `bench add-system-manager`)')
    .requiredOption('--email <email>', 'email address')
    .requiredOption('--name <name>', 'display name')
    .option('--password <password>', 'password (prefer the prompt or --password-stdin)')
    .option('--password-stdin', 'read the password from stdin')
    .option('--super-admin', 'grant platform super-admin')
    .option('--org <slug>', 'also add the user to this organization')
    .option('--role <key>', 'role key within --org', 'admin')
    .addHelpText('after', examples([['atrium create-user --email ops@example.com --name "Ops" --super-admin'], ['atrium create-user --email ed@acme.com --name Ed --org acme --role editor --password-stdin < pw.txt']]))
    .action(async function (this: Command, opts: { email: string; name: string; password?: string; passwordStdin?: boolean; superAdmin?: boolean; org?: string; role: string }) {
      const ctx = context(this);
      const email = opts.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new CliError(`Invalid email "${opts.email}"`);
      const password = await obtainPassword(opts);
      const argon2 = loadArgon2(ctx.root);
      await withPrisma(ctx, async (prisma) => {
        if (await prisma.user.findUnique({ where: { email } })) throw new CliError(`User ${email} already exists`, 'Use `atrium set-admin-password --email …` to change the password.');
        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        const user: { id: string } = await task(`Creating ${email}`, () => prisma.user.create({ data: { email, name: opts.name, passwordHash, isSuperAdmin: !!opts.superAdmin, emailVerifiedAt: new Date() } }));
        if (opts.org) {
          const org = await prisma.organization.findFirst({ where: { OR: [{ slug: opts.org }, { id: opts.org }] } });
          if (!org) throw new CliError(`Organization ${opts.org} not found (user was created)`);
          const role = await prisma.role.findFirst({ where: { organizationId: org.id, key: opts.role } });
          if (!role) throw new CliError(`Role "${opts.role}" not found in ${org.slug} (user was created)`);
          await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
          log.success(`Added to ${org.slug} as ${role.name}`);
        }
        await prisma.auditLog.create({ data: { actorType: 'SYSTEM', actorName: 'atrium-cli', action: 'user.create', resourceType: 'user', resourceId: user.id, summary: `Created ${email} via CLI${opts.superAdmin ? ' (super-admin)' : ''}` } }).catch(() => undefined);
        log.success(`Created ${color.cyan(email)}${opts.superAdmin ? color.magenta(' (super-admin)') : ''}`);
      });
    });

  program
    .command('set-admin-password')
    .description('Reset a user password (default: SEED_ADMIN_EMAIL) and revoke their sessions')
    .option('--email <email>', 'user email (default SEED_ADMIN_EMAIL)')
    .option('--password <password>', 'new password (prefer the prompt or --password-stdin)')
    .option('--password-stdin', 'read the password from stdin')
    .option('--keep-sessions', 'do not sign the user out everywhere')
    .action(async function (this: Command, opts: { email?: string; password?: string; passwordStdin?: boolean; keepSessions?: boolean }) {
      const ctx = context(this);
      const email = (opts.email ?? ctx.vars.SEED_ADMIN_EMAIL ?? '').toLowerCase();
      if (!email) throw new CliError('No email given', 'Pass --email or set SEED_ADMIN_EMAIL.');
      const password = await obtainPassword(opts, `New password for ${email}`);
      const argon2 = loadArgon2(ctx.root);
      await withPrisma(ctx, async (prisma) => {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) throw new CliError(`User ${email} not found`, 'Create it with `atrium create-user` or run `atrium seed`.');
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } });
        if (!opts.keepSessions) {
          const r = await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
          log.info(`Revoked ${r.count} session(s)`);
        }
        await prisma.auditLog.create({ data: { actorType: 'SYSTEM', actorName: 'atrium-cli', action: 'user.password_reset', resourceType: 'user', resourceId: user.id, summary: 'Password reset via CLI' } }).catch(() => undefined);
        log.success(`Password updated for ${color.cyan(email)}`);
      });
    });

  program
    .command('new-org <name>')
    .description('Create an organization with the default roles and an owner')
    .requiredOption('--owner <email>', 'owner email (must exist)')
    .option('--slug <slug>', 'organization slug (default: from name)')
    .option('--plan <key>', 'plan key', 'starter')
    .option('--db', 'force direct database mode')
    .action(async function (this: Command, name: string, opts: { owner: string; slug?: string; plan: string; db?: boolean }) {
      const ctx = context(this);
      const owner = opts.owner.toLowerCase();
      const slug = opts.slug ?? slugify(name);
      const api = ctx.api();
      if (!opts.db && (await api.isUp()) && api.hasAuth()) {
        const me = await getMe(api).catch(() => null);
        if (me?.user.email.toLowerCase() === owner) {
          const org = await task(`Creating ${name} via the API`, () => api.post<{ id: string; slug: string }>('/organizations', { name, slug }));
          return log.success(`Created organization ${color.cyan(org.slug)} (${org.id}) owned by ${owner}`);
        }
      }
      log.info(`Creating directly in the database ${color.dim('(admin operation)')}`);
      const schema = loadWorkspacePackage<{ DEFAULT_ROLES: DefaultRole[] }>(ctx.root, 'packages/schema');
      await withPrisma(ctx, async (prisma) => {
        const user = await prisma.user.findUnique({ where: { email: owner } });
        if (!user) throw new CliError(`User ${owner} not found`, 'Create it first: atrium create-user --email … --name …');
        if (await prisma.organization.findUnique({ where: { slug } })) throw new CliError(`Organization slug "${slug}" is taken`, 'Pass --slug.');
        if (!(await prisma.plan.findUnique({ where: { key: opts.plan } }))) throw new CliError(`Plan "${opts.plan}" does not exist`, 'Run `atrium seed` to create the default plans.');
        const known = new Set<string>((await prisma.permission.findMany({ select: { key: true } })).map((p: { key: string }) => p.key));
        const org = await prisma.$transaction(async (tx) => {
          const o = await tx.organization.create({ data: { name, slug, planKey: opts.plan } });
          let ownerRoleId = '';
          for (const r of schema.DEFAULT_ROLES) {
            const role = await tx.role.create({ data: { organizationId: o.id, key: r.key, name: r.name, description: r.description, isSystem: true } });
            const perms = r.permissions.filter((k) => known.has(k));
            if (perms.length) await tx.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
            if (r.key === 'owner') ownerRoleId = role.id;
          }
          await tx.organizationMember.create({ data: { organizationId: o.id, userId: user.id, roleId: ownerRoleId } });
          await tx.auditLog.create({ data: { organizationId: o.id, actorType: 'SYSTEM', actorName: 'atrium-cli', action: 'organization.create', resourceType: 'organization', resourceId: o.id, summary: `Created via CLI, owner ${owner}` } });
          return o;
        });
        if (!known.size) log.warn('The permissions table is empty — run `atrium seed` so roles get their permissions.');
        log.success(`Created organization ${color.cyan(org.slug)} (${org.id}) owned by ${owner}`);
      });
    });
}
