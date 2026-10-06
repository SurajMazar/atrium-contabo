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

    // They can sign in with it and see only their website.
    const login = await http.post('/v1/auth/login').send({ email, password: res.body.password }).expect(200);
    const list = await http.get(`/v1/organizations/${orgId}/websites`).set(bearer(login.body.accessToken)).expect(200);
    expect((list.body as Array<{ id: string }>).map((w) => w.id)).toEqual([site.body.id]);

    // A chosen password is used as-is and never echoed back; weak ones are refused.
    const chosen = await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email: `chosen-${RUN}@example.test`, name: 'Chosen', roleId: wm.id, websiteIds: [site.body.id], password: 'Chosen-Passw0rd!' }).expect(201);
    expect(chosen.body.password).toBeUndefined();
    await http.post('/v1/auth/login').send({ email: `chosen-${RUN}@example.test`, password: 'Chosen-Passw0rd!' }).expect(200);
    await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email: `weak-${RUN}@example.test`, name: 'Weak', roleId: wm.id, password: 'short' }).expect(422);

    // Existing accounts are never pulled in without an invitation.
    const existing = await http.post(`/v1/organizations/${orgId}/members`).set(t).send({ email: owner.email, name: 'X', roleId: wm.id }).expect(409);
    expect(existing.body.error.details.reason).toBe('ACCOUNT_EXISTS');
    // Only people who may invite can add, and the role ceiling applies.
    await http.post(`/v1/organizations/${orgId}/members`).set(bearer(login.body.accessToken)).send({ email: `nope-${RUN}@example.test`, name: 'Nope', roleId: wm.id }).expect(403);
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
