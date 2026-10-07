import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetThrottles } from './reset-throttle';

/** Super admin organization controls: the analytics switch, suspension taking sites offline, and permanent deletion. */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let ready = true;
const RUN = Date.now().toString(36);
const PASSWORD = 'S3cure!Passw0rd#';
const RENDERER_SECRET = process.env.RENDERER_SECRET ?? 'change-me-renderer-secret';

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
async function register(label: string) {
  const email = `life-${label}-${RUN}@example.test`;
  const r = await app.get(AuthService).register({ name: label, email, password: PASSWORD }, {});
  return { token: r.accessToken, id: r.user.id, email };
}

describe('organization lifecycle (super admin)', () => {
  it('collects analytics only once turned on, takes suspended sites offline, and deletes only after suspension', async () => {
    if (!ready) return;
    const admin = await register('super');
    await db.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const a = bearer(admin.token);
    const org = await http.post('/v1/admin/organizations').set(a).send({ name: `Lifecycle ${RUN}` }).expect(201);
    const orgId: string = org.body.id;
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(a).send({ name: `Life Site ${RUN}`, source: { type: 'blank' } }).expect(201);
    await http.post(`/v1/websites/${site.body.id}/publish`).set(a).send({}).expect(200);
    const resolve = () => http.get(`/v1/public/sites/resolve?host=${site.body.slug}`).set('X-Renderer-Secret', RENDERER_SECRET);
    const beacon = () => http.post('/v1/public/analytics/collect').set('User-Agent', 'Mozilla/5.0 (Macintosh) Chrome/130.0').send({ websiteId: site.body.id, type: 'pageview', path: '/' }).expect(204);
    const events = () => db.analyticsEvent.count({ where: { websiteId: site.body.id } });

    // Analytics: off by default — the page gets no beacon and anything sent is dropped.
    expect((await resolve().expect(200)).body.runtime.analytics).toBe(false);
    await beacon();
    expect(await events()).toBe(0);
    expect((await http.get(`/v1/websites/${site.body.id}/analytics`).set(a).expect(200)).body.enabled).toBe(false);

    const on = await http.patch(`/v1/admin/organizations/${orgId}`).set(a).send({ analyticsEnabled: true }).expect(200);
    expect(on.body.analyticsEnabled).toBe(true);
    expect((await resolve().expect(200)).body.runtime.analytics).toBe(true);
    await beacon();
    expect(await events()).toBe(1);
    expect((await http.get(`/v1/websites/${site.body.id}/analytics`).set(a).expect(200)).body.enabled).toBe(true);
    const listed = await http.get('/v1/admin/organizations').set(a).query({ search: `Lifecycle ${RUN}` }).expect(200);
    expect(listed.body.items[0].analyticsEnabled).toBe(true);

    // A member (non-owner role) and a pending invitation, so deletion has to clear role references.
    const member = await register('member');
    const viewer = await db.role.findFirstOrThrow({ where: { organizationId: orgId, key: 'viewer' } });
    await db.organizationMember.create({ data: { organizationId: orgId, userId: member.id, roleId: viewer.id } });
    await db.invitation.create({ data: { organizationId: orgId, email: `invitee-${RUN}@example.test`, roleId: viewer.id, tokenHash: `hash-${RUN}`, expiresAt: new Date(Date.now() + 86_400_000), invitedById: admin.id } });

    // Deleting needs a super admin, a suspended organization and the slug typed back.
    await http.delete(`/v1/admin/organizations/${orgId}`).set(bearer(member.token)).send({ confirmSlug: org.body.slug }).expect(403);
    const early = await http.delete(`/v1/admin/organizations/${orgId}`).set(a).send({ confirmSlug: org.body.slug }).expect(409);
    expect(early.body.error.details.reason).toBe('NOT_SUSPENDED');

    // Suspension takes the website offline (and stops analytics).
    await http.patch(`/v1/admin/organizations/${orgId}`).set(a).send({ suspended: true }).expect(200);
    await resolve().expect(404);
    await beacon();
    expect(await events()).toBe(1);

    await http.delete(`/v1/admin/organizations/${orgId}`).set(a).send({ confirmSlug: 'wrong-slug' }).expect(400);
    await http.delete(`/v1/admin/organizations/${orgId}`).set(a).send({ confirmSlug: org.body.slug }).expect(204);

    expect(await db.organization.findUnique({ where: { id: orgId } })).toBeNull();
    expect(await db.website.findUnique({ where: { id: site.body.id } })).toBeNull();
    expect(await db.role.count({ where: { organizationId: orgId } })).toBe(0);
    expect(await events()).toBe(0);
    // People keep their accounts; the deletion is on the platform audit trail.
    expect(await db.user.findUnique({ where: { id: member.id } })).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: 'platform.organization_deleted', resourceId: orgId } })).toBe(1);
    await http.delete(`/v1/admin/organizations/${orgId}`).set(a).send({ confirmSlug: org.body.slug }).expect(404);
  });
});
