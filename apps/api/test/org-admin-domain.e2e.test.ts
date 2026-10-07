import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { env } from '../src/config/env';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetThrottles } from './reset-throttle';

/** Organization admin domains: branded sign-in by hostname, trusted sign-in origin, super-admin only. */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let ready = true;
const RUN = Date.now().toString(36);
const PASSWORD = 'S3cure!Passw0rd#';

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
  const email = `oad-${label}-${RUN}@example.test`;
  const r = await app.get(AuthService).register({ name: label, email, password: PASSWORD }, {});
  return { token: r.accessToken, id: r.user.id, email };
}
const scheme = () => new URL(env().ADMIN_URL).protocol;
/** A sign-in attempt from a browser on `host`: 403 when the origin is not trusted, 401 for the wrong password. */
const loginFrom = (host: string) => http.post('/v1/auth/login').set('Origin', `${scheme()}//${host}`).send({ email: `nobody-${RUN}@example.test`, password: 'wrong-password' });

describe('organization admin domains', () => {
  it('brands the sign-in page by hostname and trusts it as a sign-in origin', async () => {
    if (!ready) return;
    const admin = await register('super');
    await db.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const a = bearer(admin.token);
    const org = await http.post('/v1/admin/organizations').set(a).send({ name: `Client ${RUN}` }).expect(201);
    await db.organization.update({ where: { id: org.body.id }, data: { branding: { productName: `Client Brand ${RUN}` } } });
    const host = `admin.client-${RUN}.example.test`;

    // Unknown hostname: platform branding, and the origin is not trusted.
    expect((await http.get('/v1/branding').query({ host }).expect(200)).body.hostOrganization).toBeNull();
    expect((await loginFrom(host)).status).toBe(403);

    // Normalized on save (case, scheme, path).
    const saved = await http.patch(`/v1/admin/organizations/${org.body.id}`).set(a).send({ adminHostname: `HTTPS://${host.toUpperCase()}/login` }).expect(200);
    expect(saved.body.adminHostname).toBe(host);

    const b = await http.get('/v1/branding').query({ host }).expect(200);
    expect(b.body.hostOrganization).toEqual({ id: org.body.id, name: `Client ${RUN}` });
    expect(b.body.resolved.productName).toBe(`Client Brand ${RUN}`);
    expect((await loginFrom(host)).status).toBe(401);
    expect((await loginFrom(`evil-${RUN}.example.test`)).status).toBe(403);
    const list = await http.get('/v1/admin/organizations').set(a).query({ search: `Client ${RUN}` }).expect(200);
    expect(list.body.items[0].adminHostname).toBe(host);

    // Platform hosts, another organization's hostname and garbage are refused.
    await http.patch(`/v1/admin/organizations/${org.body.id}`).set(a).send({ adminHostname: new URL(env().ADMIN_URL).hostname }).expect((r) => expect([400, 409]).toContain(r.status));
    const second = await http.post('/v1/admin/organizations').set(a).send({ name: `Second ${RUN}` }).expect(201);
    await http.patch(`/v1/admin/organizations/${second.body.id}`).set(a).send({ adminHostname: host }).expect(409);
    await http.patch(`/v1/admin/organizations/${second.body.id}`).set(a).send({ adminHostname: 'not a host' }).expect(400);

    // Only super admins can set it.
    const member = await register('member');
    await http.patch(`/v1/admin/organizations/${org.body.id}`).set(bearer(member.token)).send({ adminHostname: `x-${RUN}.example.test` }).expect(403);

    // Clearing it removes the branding and the trust at once.
    await http.patch(`/v1/admin/organizations/${org.body.id}`).set(a).send({ adminHostname: null }).expect(200);
    expect((await http.get('/v1/branding').query({ host }).expect(200)).body.hostOrganization).toBeNull();
    expect((await loginFrom(host)).status).toBe(403);
  });
});
