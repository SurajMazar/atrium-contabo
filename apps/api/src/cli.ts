/**
 * User administration from inside the API container (production images ship no dev tooling, so the
 * `atrium` CLI and the seed cannot run there). Uses the container's DATABASE_URL.
 *
 *   node dist/cli.js create-user --email ops@example.com --name "Ops" --super-admin [--org <slug> --role owner]
 *   node dist/cli.js super-admin --email ops@example.com [--revoke]
 *   node dist/cli.js set-password --email ops@example.com
 *   node dist/cli.js reset-mfa --email ops@example.com
 *   node dist/cli.js list-users
 *   node dist/cli.js list-orgs
 *   node dist/cli.js delete-org --slug <slug> [--confirm <slug>]   (dry run without --confirm)
 *
 * Passwords: typed at a hidden prompt (with a TTY: `podman compose exec api …`), read from stdin with
 * --password-stdin, or generated and printed once. Every change is audited and signs the user out.
 */
import { createPrismaClient } from '@atrium/db';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

type Opts = Record<string, string | boolean>;

const USAGE = `Usage: node dist/cli.js <command> [options]

  create-user   --email <e> --name <n> [--super-admin] [--org <slug|id> [--role <key>]] [--password-stdin]
  super-admin   --email <e> [--revoke]           grant (or revoke) platform super admin
  set-password  --email <e> [--password-stdin]   reset a password and sign the user out everywhere
  reset-mfa     --email <e>                      turn off two-factor (lost authenticator) and sign out
  list-users    [--super-admins]
  list-orgs                                      organizations with their websites and members
  delete-org    --slug <s> [--confirm <s>]       delete an organization and everything in it
                                                 (shows what would go without --confirm)`;

function parse(argv: string[]): { cmd?: string; opts: Opts } {
  const [cmd, ...rest] = argv;
  const opts: Opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      i++;
    }
  }
  return { cmd, opts };
}

const str = (o: Opts, k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
function required(o: Opts, k: string): string {
  const v = str(o, k)?.trim();
  if (!v) throw new Error(`--${k} is required`);
  return v;
}

function weak(pw: string): string | undefined {
  if (pw.length < 10) return 'at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/[^A-Za-z]/.test(pw)) return 'mix letters with digits or symbols';
  return undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** Hidden prompt on a TTY (characters are not echoed). */
function prompt(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const done = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') return done();
        if (c === '\u0003') return done(new Error('Cancelled'));
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

/** Returns the password and whether it was generated (and must be shown once). */
async function obtainPassword(o: Opts): Promise<{ password: string; generated: boolean }> {
  let password: string | undefined;
  if (o['password-stdin']) password = await readStdin();
  else if (process.stdin.isTTY) {
    const first = await prompt('Password (empty = generate one): ');
    if (first) {
      const again = await prompt('Repeat password: ');
      if (first !== again) throw new Error('Passwords do not match');
      password = first;
    }
  }
  if (!password) return { password: `${randomBytes(15).toString('base64url')}-7a`, generated: true };
  const problem = weak(password);
  if (problem) throw new Error(`Password too weak: ${problem}`);
  return { password, generated: false };
}

const hash = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });

async function main() {
  const { cmd, opts } = parse(process.argv.slice(2));
  if (!cmd || cmd === 'help' || opts.help) {
    console.log(USAGE);
    return;
  }
  const db = createPrismaClient({ max: 2 });
  const audit = (action: string, resourceId: string, summary: string) =>
    db.auditLog.create({ data: { actorType: 'SYSTEM', actorName: 'api-cli', action, resourceType: 'user', resourceId, summary } }).catch(() => undefined);
  const signOut = (userId: string) => db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  const findUser = async (email: string) => {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new Error(`No user with email ${email}`);
    return user;
  };
  const showGenerated = (email: string, pw: string) => console.log(`\n  Password for ${email} (shown once — sign in and change it): ${pw}\n`);

  try {
    switch (cmd) {
      case 'create-user': {
        const email = required(opts, 'email').toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`Invalid email "${email}"`);
        const name = required(opts, 'name');
        if (await db.user.findUnique({ where: { email } })) throw new Error(`${email} already exists — use super-admin / set-password instead`);
        const orgRef = str(opts, 'org');
        const org = orgRef ? await db.organization.findFirst({ where: { OR: [{ slug: orgRef }, { id: orgRef }] } }) : null;
        if (orgRef && !org) throw new Error(`Organization "${orgRef}" not found`);
        const roleKey = str(opts, 'role') ?? 'admin';
        const role = org ? await db.role.findFirst({ where: { organizationId: org.id, key: roleKey } }) : null;
        if (org && !role) throw new Error(`Role "${roleKey}" not found in ${org.slug}`);
        const superAdmin = !!opts['super-admin'];
        const { password, generated } = await obtainPassword(opts);
        const user = await db.user.create({ data: { email, name, passwordHash: await hash(password), isSuperAdmin: superAdmin, emailVerifiedAt: new Date() } });
        if (org && role) await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
        await audit('user.create', user.id, `Created ${email}${superAdmin ? ' (super admin)' : ''} from the API container`);
        console.log(`Created ${email}${superAdmin ? ' — super admin' : ''}${org ? ` — ${role!.key} of ${org.slug}` : ''}`);
        if (generated) showGenerated(email, password);
        if (superAdmin) console.log('Super admins must turn on two-factor authentication (Account → Security) before using platform admin pages.');
        break;
      }
      case 'super-admin': {
        const user = await findUser(required(opts, 'email'));
        const grant = !opts.revoke;
        await db.user.update({ where: { id: user.id }, data: { isSuperAdmin: grant } });
        await signOut(user.id);
        await audit(grant ? 'user.super_admin_granted' : 'user.super_admin_revoked', user.id, `${grant ? 'Granted' : 'Revoked'} super admin for ${user.email} from the API container`);
        console.log(`${user.email}: super admin ${grant ? 'granted' : 'revoked'} (signed out — sign in again)`);
        break;
      }
      case 'set-password': {
        const user = await findUser(required(opts, 'email'));
        const { password, generated } = await obtainPassword(opts);
        await db.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password) } });
        await signOut(user.id);
        await audit('user.password_reset', user.id, `Password reset for ${user.email} from the API container`);
        console.log(`${user.email}: password changed, all sessions signed out`);
        if (generated) showGenerated(user.email, password);
        break;
      }
      case 'reset-mfa': {
        const user = await findUser(required(opts, 'email'));
        await db.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryEnc: null, mfaLastStep: null } });
        await signOut(user.id);
        await audit('user.mfa_reset', user.id, `Two-factor reset for ${user.email} from the API container`);
        console.log(`${user.email}: two-factor turned off, all sessions signed out`);
        break;
      }
      case 'list-users': {
        const users = await db.user.findMany({
          where: opts['super-admins'] ? { isSuperAdmin: true } : undefined,
          select: { email: true, name: true, isSuperAdmin: true, mfaEnabled: true, disabledAt: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 500,
        });
        console.table(users.map((u) => ({ email: u.email, name: u.name, superAdmin: u.isSuperAdmin, mfa: u.mfaEnabled, disabled: !!u.disabledAt, created: u.createdAt.toISOString().slice(0, 10) })));
        break;
      }
      case 'list-orgs': {
        const orgs = await db.organization.findMany({
          orderBy: { createdAt: 'asc' },
          select: { slug: true, name: true, planKey: true, createdAt: true, _count: { select: { members: true } }, websites: { where: { deletedAt: null }, select: { slug: true } } },
        });
        console.table(orgs.map((o) => ({ slug: o.slug, name: o.name, plan: o.planKey, members: o._count.members, websites: o.websites.map((w) => w.slug).join(', ') || '—', created: o.createdAt.toISOString().slice(0, 10) })));
        break;
      }
      case 'delete-org': {
        const slug = required(opts, 'slug');
        const org = await db.organization.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
        if (!org) throw new Error(`No organization with slug "${slug}" (see list-orgs)`);
        const [websites, members, media] = await Promise.all([
          db.website.findMany({ where: { organizationId: org.id }, select: { slug: true, name: true, deletedAt: true } }),
          db.organizationMember.findMany({ where: { organizationId: org.id }, select: { user: { select: { email: true } }, role: { select: { key: true } } } }),
          db.media.count({ where: { organizationId: org.id } }),
        ]);
        console.log(`Organization "${org.name}" (${org.slug})`);
        console.log(`  websites (${websites.length}): ${websites.map((w) => `${w.slug}${w.deletedAt ? ' [deleted]' : ''}`).join(', ') || '—'}`);
        console.log(`  members  (${members.length}): ${members.map((m) => `${m.user.email} (${m.role.key})`).join(', ') || '—'}`);
        console.log(`  media files: ${media}`);
        if (str(opts, 'confirm') !== org.slug) {
          console.log(`\nNothing deleted (dry run). To delete all of the above permanently, run again with --confirm ${org.slug}`);
          console.log('Member accounts stay; they only lose access to this organization.');
          break;
        }
        await db.organization.delete({ where: { id: org.id } });
        await db.auditLog.create({ data: { actorType: 'SYSTEM', actorName: 'api-cli', action: 'organization.deleted', resourceType: 'organization', resourceId: org.id, summary: `Deleted organization ${org.name} (${org.slug}) with ${websites.length} website(s) from the API container` } }).catch(() => undefined);
        console.log(`\nDeleted "${org.name}" and its ${websites.length} website(s). Uploaded files on disk/S3 are not removed.`);
        break;
      }
      default:
        throw new Error(`Unknown command "${cmd}"\n\n${USAGE}`);
    }
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

main().catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
