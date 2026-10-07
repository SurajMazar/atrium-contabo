import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { BootstrapService } from '../src/common/bootstrap.service';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetThrottles } from './reset-throttle';

/** Website Manager role, website-scoped invitations and per-website dashboard branding. */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let ready = true;
const RUN = Date.now().toString(36);
const PASSWORD = 'S3cure!Passw0rd#';
// 1×1 PNG with a run-specific chunk so the checksum is unique per run.
const png = () => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d', 'hex'), Buffer.from(`0000000474455874${Buffer.from(RUN.slice(-4).padEnd(4, 'x')).toString('hex')}00000000`, 'hex'), Buffer.from('0000000049454e44ae426082', 'hex')]);

beforeAll(async () => {
  try {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1');
    await app.init();
    http = request(app.getHttpServer());
    db = app.get(PrismaService).client;
    await http.get('/v1/health/ready').expect(200);
    await resetThrottles(app);
  } catch (err) {
    if (process.env.REQUIRE_DB === '1') throw err;
    ready = false;
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
async function register(label: string, organizationName?: string) {
  const r = await app.get(AuthService).register({ name: label, email: `wm-${label}-${RUN}@example.test`, password: PASSWORD, organizationName }, {});
  return { token: r.accessToken, id: r.user.id, email: `wm-${label}-${RUN}@example.test` };
}

describe('website manager', () => {
  it('only manages the websites it was invited to and never sees organization-wide pages', async () => {
    if (!ready) return;
    const owner = await register('owner', `WM Org ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    await db.organization.update({ where: { id: orgId }, data: { limits: { websites: 10, members: 10 } } });
    const t = bearer(owner.token);
    const mine = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `Client ${RUN}`, source: { type: 'blank' } }).expect(201);
    const other = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `Other ${RUN}`, source: { type: 'blank' } }).expect(201);

    const roles = await http.get(`/v1/organizations/${orgId}/roles`).set(t).expect(200);
    const role = (roles.body as Array<{ id: string; key: string }>).find((r) => r.key === 'website_manager');
    expect(role).toBeTruthy();

    // Invite scoped to one website; accepting carries the scope over.
    const manager = await register('manager');
    const inv = await http.post(`/v1/organizations/${orgId}/invitations`).set(t).send({ email: manager.email, roleId: role!.id, websiteIds: [mine.body.id] }).expect(201);
    expect(inv.body.websiteIds).toEqual([mine.body.id]);
    await http.post('/v1/invitations/accept').set(bearer(manager.token)).send({ token: String(inv.body.devAcceptUrl).split('/invite/')[1] }).expect(200);
    const member = await db.organizationMember.findFirstOrThrow({ where: { organizationId: orgId, userId: manager.id } });
    expect(member.websiteIds).toEqual([mine.body.id]);

    const m = bearer(manager.token);
    // Their website: full day-to-day control.
    await http.get(`/v1/websites/${mine.body.id}`).set(m).expect(200);
    await http.patch(`/v1/websites/${mine.body.id}`).set(m).send({ name: `Client renamed ${RUN}` }).expect(200);
    const list = await http.get(`/v1/organizations/${orgId}/websites`).set(m).expect(200);
    expect((list.body as Array<{ id: string }>).map((w) => w.id)).toEqual([mine.body.id]);
    // Any other website of the organization: no access.
    await http.get(`/v1/websites/${other.body.id}`).set(m).expect(403);
    // Organization-wide pages and actions: none.
    await http.get(`/v1/organizations/${orgId}/members`).set(m).expect(403);
    await http.get(`/v1/organizations/${orgId}/usage`).set(m).expect(403);
    await http.get(`/v1/organizations/${orgId}/branding`).set(m).expect(403);
    await http.get(`/v1/organizations/${orgId}/audit-logs`).set(m).expect(403);
    await http.patch(`/v1/organizations/${orgId}`).set(m).send({ name: 'Hijacked' }).expect(403);
    await http.post(`/v1/organizations/${orgId}/websites`).set(m).send({ name: 'Nope', source: { type: 'blank' } }).expect(403);
    await http.post(`/v1/organizations/${orgId}/invitations`).set(m).send({ email: `x-${RUN}@example.test`, roleId: role!.id }).expect(403);
    await http.get('/v1/admin/providers').set(m).expect(403);
    // The organization's name stays readable (shell header / switcher).
    await http.get(`/v1/organizations/${orgId}`).set(m).expect(200);

    // Media: uploads are filed under their website; the other website's media is invisible.
    const up = await http.post(`/v1/organizations/${orgId}/media/upload`).set(m).attach('file', png(), 'logo.png').expect(201);
    expect((await db.media.findUniqueOrThrow({ where: { id: up.body.id } })).websiteId).toBe(mine.body.id);
    const otherMedia = await db.media.create({ data: { organizationId: orgId, websiteId: other.body.id, key: `t/${RUN}.png`, filename: 'other.png', mimeType: 'image/png', size: 1, checksum: `other-${RUN}` } });
    const media = await http.get(`/v1/organizations/${orgId}/media`).set(m).expect(200);
    const ids = (media.body.items as Array<{ id: string }>).map((x) => x.id);
    expect(ids).toContain(up.body.id);
    expect(ids).not.toContain(otherMedia.id);
    await http.delete(`/v1/media/${otherMedia.id}`).set(m).expect(403);
  });

  it('cannot be granted beyond the inviter and owners are never scoped', async () => {
    if (!ready) return;
    const owner = await register('owner2', `WM Org2 ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    const t = bearer(owner.token);
    const roles = (await http.get(`/v1/organizations/${orgId}/roles`).set(t).expect(200)).body as Array<{ id: string; key: string }>;
    const ownerRole = roles.find((r) => r.key === 'owner')!;
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `S ${RUN}`, source: { type: 'blank' } }).expect(201);
    await http.post(`/v1/organizations/${orgId}/invitations`).set(t).send({ email: `own-${RUN}@example.test`, roleId: ownerRole.id, websiteIds: [site.body.id] }).expect(400);
    const foreign = await register('foreign', `WM Foreign ${RUN}`);
    const foreignOrg = (await db.organizationMember.findFirstOrThrow({ where: { userId: foreign.id } })).organizationId;
    const foreignSite = await http.post(`/v1/organizations/${foreignOrg}/websites`).set(bearer(foreign.token)).send({ name: `F ${RUN}`, source: { type: 'blank' } }).expect(201);
    const editor = roles.find((r) => r.key === 'editor')!;
    await http.post(`/v1/organizations/${orgId}/invitations`).set(t).send({ email: `x2-${RUN}@example.test`, roleId: editor.id, websiteIds: [foreignSite.body.id] }).expect(400);
  });
});

describe('add member without an invitation', () => {
  it('creates the account, adds it with role and website access, and returns a generated password once', async () => {
    if (!ready) return;
    const owner = await register('adder', `WM Add ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    await db.organization.update({ where: { id: orgId }, data: { limits: { websites: 10, members: 10 } } });
    const t = bearer(owner.token);
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `A ${RUN}`, source: { type: 'blank' } }).expect(201);
    const roles = (await http.get(`/v1/organizations/${orgId}/roles`).set(t).expect(200)).body as Array<{ id: string; key: string }>;
    const wm = roles.find((r) => r.key === 'website_manager')!;

    const email = `added-${RUN}@example.test`;
    const res = await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email, name: 'Added Person', roleId: wm.id, websiteIds: [site.body.id] }).expect(201);
    expect(res.body.password).toMatch(/.{12,}/);
    expect(res.body.member.websiteIds).toEqual([site.body.id]);
    expect(JSON.stringify(await db.user.findUniqueOrThrow({ where: { email } }))).not.toContain(res.body.password); // only the hash is stored

    // They can sign in with it, but must choose their own password before anything else works.
    const login = await http.post('/v1/auth/login').send({ email, password: res.body.password }).expect(200);
    expect(login.body.user.passwordChangeRequired).toBe(true);
    const blocked = await http.get(`/v1/organizations/${orgId}/websites`).set(bearer(login.body.accessToken)).expect(403);
    expect(blocked.body.error.details.reason).toBe('PASSWORD_CHANGE_REQUIRED');
    await http.post('/v1/auth/password/change').set(bearer(login.body.accessToken)).send({ currentPassword: res.body.password, newPassword: 'Own-Passw0rd!2026' }).expect(204);
    // …then they see only their website.
    const list = await http.get(`/v1/organizations/${orgId}/websites`).set(bearer(login.body.accessToken)).expect(200);
    expect((list.body as Array<{ id: string }>).map((w) => w.id)).toEqual([site.body.id]);

    // A chosen password is used as-is and never echoed back; weak ones are refused.
    const chosen = await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email: `chosen-${RUN}@example.test`, name: 'Chosen', roleId: wm.id, websiteIds: [site.body.id], password: 'Chosen-Passw0rd!' }).expect(201);
    expect(chosen.body.password).toBeUndefined();
    const chosenLogin = await http.post('/v1/auth/login').send({ email: `chosen-${RUN}@example.test`, password: 'Chosen-Passw0rd!' }).expect(200);
    expect(chosenLogin.body.user.passwordChangeRequired).toBe(true); // the admin knows it too
    await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email: `weak-${RUN}@example.test`, name: 'Weak', roleId: wm.id, password: 'short' }).expect(422);

    // Existing accounts are never pulled in without an invitation.
    const existing = await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email: owner.email, name: 'X', roleId: wm.id }).expect(409);
    expect(existing.body.error.details.reason).toBe('ACCOUNT_EXISTS');
    // Only people who may invite can add, and the role ceiling applies.
    await http.post(`/v1/organizations/${orgId}/members`).set(bearer(login.body.accessToken)).send({ email: `nope-${RUN}@example.test`, name: 'Nope', roleId: wm.id }).expect(403);
  });
});

describe('organizations are created by super admins only', () => {
  it('lets a super admin create an organization for a new owner, and nobody else', async () => {
    if (!ready) return;
    const admin = await register('platform');
    await db.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const res = await http.post('/v1/admin/organizations').set(bearer(admin.token)).send({ name: `Client Co ${RUN}`, owner: { email: `client-owner-${RUN}@example.test`, name: 'Client Owner' } }).expect(201);
    expect(res.body.owner.created).toBe(true);
    expect(res.body.owner.password).toBeTruthy();
    // The super admin is not added as a member; the client is the owner.
    const members = await db.organizationMember.findMany({ where: { organizationId: res.body.id }, include: { role: true, user: true } });
    expect(members.map((m) => [m.user.email, m.role.key])).toEqual([[`client-owner-${RUN}@example.test`, 'owner']]);

    const login = await http.post('/v1/auth/login').send({ email: `client-owner-${RUN}@example.test`, password: res.body.owner.password }).expect(200);
    const o = bearer(login.body.accessToken);
    await http.post('/v1/auth/password/change').set(o).send({ currentPassword: res.body.owner.password, newPassword: 'Owner-Passw0rd!2026' }).expect(204);
    await http.get(`/v1/organizations/${res.body.id}/members`).set(o).expect(200); // manages their own organization
    await http.post('/v1/organizations').set(o).send({ name: 'Second org' }).expect(403); // but cannot create another
    await http.post('/v1/admin/organizations').set(o).send({ name: 'Sneaky' }).expect(403);
    await http.post('/v1/auth/register').send({ name: 'Signup', email: `signup-${RUN}@example.test`, password: PASSWORD, organizationName: 'Self serve' }).expect(201);
    expect(await db.organizationMember.count({ where: { user: { email: `signup-${RUN}@example.test` } } })).toBe(0);

    // A pre-registered (possibly squatted) account is never made owner directly: it gets an invitation.
    const squat = await register('squatter');
    const forExisting = await http.post('/v1/admin/organizations').set(bearer(admin.token)).send({ name: `Client Two ${RUN}`, owner: { email: squat.email, name: 'Whoever' } }).expect(201);
    expect(forExisting.body.owner).toMatchObject({ created: false, invited: true });
    expect(await db.organizationMember.count({ where: { organizationId: forExisting.body.id } })).toBe(0);
    expect(await db.invitation.count({ where: { organizationId: forExisting.body.id, email: squat.email, acceptedAt: null } })).toBe(1);
  });
});

describe('dashboard branding per website', () => {
  it('layers website overrides over the organization branding', async () => {
    if (!ready) return;
    const owner = await register('brand', `WM Brand ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    const t = bearer(owner.token);
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `B ${RUN}`, source: { type: 'blank' } }).expect(201);
    await http.put(`/v1/organizations/${orgId}/branding`).set(t).send({ productName: 'Agency Studio', accent: '#112233' }).expect(200);
    await http.put(`/v1/websites/${site.body.id}/branding`).set(t).send({ productName: 'Client Portal' }).expect(200);

    const resolved = await http.get(`/v1/branding?organizationId=${orgId}&websiteId=${site.body.id}`).expect(200);
    expect(resolved.body.resolved.productName).toBe('Client Portal');
    expect(resolved.body.resolved.accent).toBe('#112233'); // inherited from the organization
    const org = await http.get(`/v1/branding?organizationId=${orgId}`).expect(200);
    expect(org.body.resolved.productName).toBe('Agency Studio');

    const editorView = await http.get(`/v1/websites/${site.body.id}/branding`).set(t).expect(200);
    expect(editorView.body.website.productName).toBe('Client Portal');
    expect(editorView.body.inherited.productName).toBe('Agency Studio');

    // A website id never pulls in another organization's branding.
    const other = await register('brand2', `WM Brand2 ${RUN}`);
    const otherOrg = (await db.organizationMember.findFirstOrThrow({ where: { userId: other.id } })).organizationId;
    const mixed = await http.get(`/v1/branding?organizationId=${otherOrg}&websiteId=${site.body.id}`).expect(200);
    expect(mixed.body.website).toBeNull();
  });
});

describe('startup bootstrap', () => {
  it('adds built-in roles missing from existing organizations without touching existing ones', async () => {
    if (!ready) return;
    const owner = await register('boot', `WM Boot ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    await db.role.deleteMany({ where: { organizationId: orgId, key: 'website_manager' } });
    const editor = await db.role.findFirstOrThrow({ where: { organizationId: orgId, key: 'editor' }, include: { permissions: true } });
    await db.rolePermission.deleteMany({ where: { roleId: editor.id, permissionKey: 'page.publish' } }); // an org's own edit

    await app.get(BootstrapService).onApplicationBootstrap();

    expect(await db.role.findFirst({ where: { organizationId: orgId, key: 'website_manager' } })).not.toBeNull();
    const after = await db.rolePermission.findMany({ where: { roleId: editor.id } });
    expect(after.some((p) => p.permissionKey === 'page.publish')).toBe(false);
    expect(after.length).toBe(editor.permissions.length - 1);
  });
});

describe('audit fixes (2026-10-06)', () => {
  const RENDERER_SECRET = process.env.RENDERER_SECRET ?? 'change-me-renderer-secret';

  it('bootstrap never promotes an account it cannot prove belongs to the operator', async () => {
    if (!ready) return;
    const email = `seed-squat-${RUN}@example.test`;
    await register('seedsquat-' + RUN); // unrelated account
    const squatter = await app.get(AuthService).register({ name: 'Squatter', email, password: 'Squatter-Passw0rd!', organizationName: undefined }, {});
    const supers = await db.user.findMany({ where: { isSuperAdmin: true }, select: { id: true } });
    await db.user.updateMany({ where: { id: { in: supers.map((u) => u.id) } }, data: { isSuperAdmin: false } });
    const env = { email: process.env.SEED_ADMIN_EMAIL, pw: process.env.SEED_ADMIN_PASSWORD };
    try {
      process.env.SEED_ADMIN_EMAIL = email;
      process.env.SEED_ADMIN_PASSWORD = 'Operator-Secret-2026!';
      await app.get(BootstrapService).onApplicationBootstrap();
      expect((await db.user.findUniqueOrThrow({ where: { id: squatter.user.id } })).isSuperAdmin).toBe(false);
      // With the operator's password it is promoted (and signed out).
      process.env.SEED_ADMIN_PASSWORD = 'Squatter-Passw0rd!';
      await app.get(BootstrapService).onApplicationBootstrap();
      expect((await db.user.findUniqueOrThrow({ where: { id: squatter.user.id } })).isSuperAdmin).toBe(true);
    } finally {
      process.env.SEED_ADMIN_EMAIL = env.email;
      process.env.SEED_ADMIN_PASSWORD = env.pw;
      await db.user.update({ where: { id: squatter.user.id }, data: { isSuperAdmin: false } });
      await db.user.updateMany({ where: { id: { in: supers.map((u) => u.id) } }, data: { isSuperAdmin: true } });
    }
  });

  it('website managers cannot clone, owners cannot be scoped, previews resist guessing, forms refuse unwanted uploads', async () => {
    if (!ready) return;
    const owner = await register('fix-owner', `Fix Org ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    await db.organization.update({ where: { id: orgId }, data: { limits: { websites: 10, members: 10 } } });
    const t = bearer(owner.token);
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `Fix ${RUN}`, source: { type: 'blank' } }).expect(201);
    const roles = (await http.get(`/v1/organizations/${orgId}/roles`).set(t).expect(200)).body as Array<{ id: string; key: string }>;
    const wm = roles.find((r) => r.key === 'website_manager')!;
    const ownerRole = roles.find((r) => r.key === 'owner')!;

    // Website Manager: no clone (it would create websites without website.create).
    const mgr = await register('fix-mgr');
    const inv = await http.post(`/v1/organizations/${orgId}/invitations`).set(t).send({ email: mgr.email, roleId: wm.id, websiteIds: [site.body.id] }).expect(201);
    await http.post('/v1/invitations/accept').set(bearer(mgr.token)).send({ token: String(inv.body.devAcceptUrl).split('/invite/')[1] }).expect(200);
    await http.post(`/v1/websites/${site.body.id}/clone`).set(bearer(mgr.token)).send({ name: 'Clone' }).expect(403);
    await http.get(`/v1/organizations/${orgId}/roles`).set(bearer(mgr.token)).expect(403);

    // Owners always see every website.
    const member = await db.organizationMember.findFirstOrThrow({ where: { organizationId: orgId, user: { email: mgr.email } } });
    await http.patch(`/v1/organizations/${orgId}/members/${member.id}`).set(t).send({ roleId: ownerRole.id, websiteIds: [site.body.id] }).expect(400);
    await http.patch(`/v1/organizations/${orgId}/members/${member.id}`).set(t).send({ roleId: ownerRole.id }).expect(200);
    expect((await db.organizationMember.findUniqueOrThrow({ where: { id: member.id } })).websiteIds).toEqual([]);

    // Preview passwords: at least 8 characters, and locked after repeated wrong guesses.
    await http.post(`/v1/websites/${site.body.id}/preview-tokens`).set(t).send({ password: 'short' }).expect(422);
    const preview = await http.post(`/v1/websites/${site.body.id}/preview-tokens`).set(t).send({ password: 'Preview-Pass-1' }).expect(201);
    const resolve = (password: string) => http.get(`/v1/public/preview?token=${preview.body.token}&password=${encodeURIComponent(password)}`).set('X-Renderer-Secret', RENDERER_SECRET);
    for (let i = 0; i < 10; i++) await resolve(`wrong-${i}`).expect(401);
    await resolve('Preview-Pass-1').expect(429);

    // Public form submit: unknown forms and file uploads to forms without file fields are refused before parsing.
    await http.post('/v1/public/forms/does-not-exist/submit').attach('file', Buffer.from('x'), 'x.txt').expect(404);
    const form = await http.post(`/v1/websites/${site.body.id}/forms`).set(t).send({ name: 'No files', fields: [{ type: 'email', name: 'email', label: 'Email' }] }).expect(201);
    await http.post(`/v1/public/forms/${form.body.id}/submit`).field('email', 'a@b.co').attach('file', Buffer.from('x'), 'x.txt').expect(400);
  });

  it('webhooks carrying form submissions need submission.read', async () => {
    if (!ready) return;
    const owner = await register('hook-owner', `Hook Org ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    await db.organization.update({ where: { id: orgId }, data: { limits: { members: 10 } } });
    const roles = (await http.get(`/v1/organizations/${orgId}/roles`).set(bearer(owner.token)).expect(200)).body as Array<{ id: string; key: string }>;
    const dev = await register('hook-dev');
    const inv = await http.post(`/v1/organizations/${orgId}/invitations`).set(bearer(owner.token)).send({ email: dev.email, roleId: roles.find((r) => r.key === 'developer')!.id }).expect(201);
    await http.post('/v1/invitations/accept').set(bearer(dev.token)).send({ token: String(inv.body.devAcceptUrl).split('/invite/')[1] }).expect(200);
    const d = bearer(dev.token);
    await http.post(`/v1/organizations/${orgId}/webhooks`).set(d).send({ name: 'All', url: 'https://hooks.example.com/x', events: ['*'] }).expect(403);
    await http.post(`/v1/organizations/${orgId}/webhooks`).set(d).send({ name: 'Forms', url: 'https://hooks.example.com/x', events: ['form.submitted'] }).expect(403);
    await http.post(`/v1/organizations/${orgId}/webhooks`).set(d).send({ name: 'Deploys', url: 'https://hooks.example.com/x', events: ['deployment.completed'] }).expect(201);
  });
});

describe('captcha: page and API agree', () => {
  const RENDERER_SECRET = process.env.RENDERER_SECRET ?? 'change-me-renderer-secret';

  it('enforces captcha as published and serves site keys live', async () => {
    if (!ready) return;
    const owner = await register('cap-owner', `Cap Org ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    const t = bearer(owner.token);
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `Cap ${RUN}`, source: { type: 'blank' } }).expect(201);
    const form = await http.post(`/v1/websites/${site.body.id}/forms`).set(t).send({ name: 'Contact', fields: [{ type: 'email', name: 'email', label: 'Email' }] }).expect(201);
    await http.post(`/v1/websites/${site.body.id}/publish`).set(t).send({ message: 'v1' }).expect(201);
    const host = `${site.body.slug}.${(process.env.PLATFORM_SITES_DOMAIN ?? 'sites.localhost:3001').split(':')[0]}`;

    // Turn captcha on in the draft only: the live page has no widget, so the live form keeps working.
    const full = await http.get(`/v1/forms/${form.body.id}`).set(t).expect(200);
    await http.put(`/v1/forms/${form.body.id}`).set(t).send({ ...full.body, settings: { ...full.body.settings, captcha: { provider: 'recaptcha-v2', minScore: 0.5, action: 'submit' } } }).expect(200);
    await http.post(`/v1/public/forms/${form.body.id}/submit`).send({ values: { email: 'visitor@example.com' } }).expect(200);

    // Publish it: now the API requires a token…
    await http.post(`/v1/websites/${site.body.id}/publish`).set(t).send({ message: 'captcha' }).expect(201);
    await http.post(`/v1/public/forms/${form.body.id}/submit`).send({ values: { email: 'visitor@example.com' } }).expect(424);

    // …and a captcha integration added afterwards reaches the live page without republishing.
    const before = await http.get(`/v1/public/sites/resolve?host=${host}`).set('X-Renderer-Secret', RENDERER_SECRET).expect(200);
    expect(before.body.runtime.captcha[form.body.id]).toBeUndefined();
    await http.post(`/v1/organizations/${orgId}/integrations`).set(t).send({ kind: 'CAPTCHA', name: 'reCAPTCHA', driver: 'recaptcha-v2', config: { siteKey: `site-key-${RUN}` }, secrets: { secretKey: 'secret-key-value' }, isDefault: true }).expect(201);
    const after = await http.get(`/v1/public/sites/resolve?host=${host}`).set('X-Renderer-Secret', RENDERER_SECRET).expect(200);
    expect(after.body.runtime.captcha[form.body.id]).toEqual({ provider: 'recaptcha-v2', siteKey: `site-key-${RUN}` });
    expect(after.headers.etag).not.toBe(before.headers.etag);
    expect(JSON.stringify(after.body)).not.toContain('secret-key-value');
    // With the integration in place, a submission without a token is a validation error, not "unavailable".
    await http.post(`/v1/public/forms/${form.body.id}/submit`).send({ values: { email: 'visitor@example.com' } }).expect(422);
  });
});

describe('super admin: rename organizations, delete users permanently', () => {
  it('renames, refuses unsafe deletions, then deletes permanently', async () => {
    if (!ready) return;
    const admin = await register('del-admin');
    await db.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const a = bearer(admin.token);
    const owner = await register('del-owner', `Del Org ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;

    // Owners rename their organization; super admins can too.
    await http.patch(`/v1/organizations/${orgId}`).set(bearer(owner.token)).send({ name: `Renamed ${RUN}` }).expect(200);
    await http.patch(`/v1/admin/organizations/${orgId}`).set(a).send({ name: `Admin Renamed ${RUN}` }).expect(200);
    expect((await db.organization.findUniqueOrThrow({ where: { id: orgId } })).name).toBe(`Admin Renamed ${RUN}`);

    // Deleting: confirmation must match, sole owners are refused, yourself is refused.
    await http.delete(`/v1/admin/users/${owner.id}`).set(a).send({ confirmEmail: 'wrong@example.test' }).expect(400);
    const sole = await http.delete(`/v1/admin/users/${owner.id}`).set(a).send({ confirmEmail: owner.email }).expect(409);
    expect(sole.body.error.details.reason).toBe('SOLE_OWNER');
    await http.delete(`/v1/admin/users/${admin.id}`).set(a).send({ confirmEmail: admin.email }).expect(400);

    // A plain member is deleted with their sessions and memberships; they cannot sign in again.
    const member = await register('del-member');
    const roles = (await http.get(`/v1/organizations/${orgId}/roles`).set(bearer(owner.token)).expect(200)).body as Array<{ id: string; key: string }>;
    const inv = await http.post(`/v1/organizations/${orgId}/invitations`).set(bearer(owner.token)).send({ email: member.email, roleId: roles.find((r) => r.key === 'editor')!.id }).expect(201);
    await http.post('/v1/invitations/accept').set(bearer(member.token)).send({ token: String(inv.body.devAcceptUrl).split('/invite/')[1] }).expect(200);
    await http.delete(`/v1/admin/users/${member.id}`).set(a).send({ confirmEmail: member.email }).expect(204);
    expect(await db.user.findUnique({ where: { id: member.id } })).toBeNull();
    expect(await db.organizationMember.count({ where: { userId: member.id } })).toBe(0);
    await http.get('/v1/auth/me').set(bearer(member.token)).expect(401);
    await http.post('/v1/auth/login').send({ email: member.email, password: PASSWORD }).expect(401);
    // Non-super-admins cannot delete anyone.
    await http.delete(`/v1/admin/users/${owner.id}`).set(bearer(owner.token)).send({ confirmEmail: owner.email }).expect(403);
  });
});
