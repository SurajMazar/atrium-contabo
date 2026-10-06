import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetThrottles } from './reset-throttle';

/** Platform providers (super-admin panel) and the AI readiness endpoint. Skips without a database. */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let ready = true;
const RUN = Date.now().toString(36);

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
  if (ready) await db.platformProvider.deleteMany({ where: { name: { startsWith: `e2e-${RUN}` } } });
  await app?.close();
});

async function user(label: string, org?: string) {
  const r = await app.get(AuthService).register({ name: label, email: `pp-${label}-${RUN}@example.test`, password: 'S3cure!Passw0rd#', organizationName: org }, {});
  return { token: r.accessToken, id: r.user.id };
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('platform providers', () => {
  it('are super-admin only, store secrets encrypted and masked, and take precedence over env', async () => {
    if (!ready) return;
    const member = await user('member', `PP Org ${RUN}`);
    await http.get('/v1/admin/providers').set(bearer(member.token)).expect(403);
    await http.post('/v1/admin/providers').set(bearer(member.token)).send({ kind: 'ai', name: 'x', driver: 'anthropic', secrets: { apiKey: 'sk-ant-xxxxxxxxxxxx' } }).expect(403);

    const admin = await user('admin');
    await db.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const t = bearer(admin.token);
    // Other admin-configured providers may already exist (a real install): compare against them.
    const before = (await http.get('/v1/admin/providers/status').set(t).expect(200)).body.email;
    const created = await http
      .post('/v1/admin/providers')
      .set(t)
      .send({ kind: 'email', name: `e2e-${RUN} panel smtp`, driver: 'smtp', config: { host: 'localhost', port: 51025 }, secrets: { password: 'super-secret-password' }, fromEmail: 'platform@example.test', fromName: 'Platform' })
      .expect(201);
    expect(JSON.stringify(created.body)).not.toContain('super-secret-password');
    expect(created.body.hasSecrets).toBe(true);
    const stored = await db.platformProvider.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.secretsEnc).not.toContain('super-secret-password');

    const status = await http.get('/v1/admin/providers/status').set(t).expect(200);
    expect(status.body.email.source).toBe('admin');

    // Pointing stored credentials at a different server requires re-entering them.
    await http.patch(`/v1/admin/providers/${created.body.id}`).set(t).send({ config: { host: 'smtp.attacker.example', port: 587 } }).expect(422);
    await http.patch(`/v1/admin/providers/${created.body.id}`).set(t).send({ name: `e2e-${RUN} renamed` }).expect(200);

    const list = await http.get('/v1/admin/providers?kind=email').set(t).expect(200);
    expect((list.body as Array<{ id: string }>).some((p) => p.id === created.body.id)).toBe(true);
    await http.delete(`/v1/admin/providers/${created.body.id}`).set(t).expect(204);
    expect((await http.get('/v1/admin/providers/status').set(t).expect(200)).body.email).toEqual(before);
    const log = await db.auditLog.findFirst({ where: { actorId: admin.id, action: 'platform.provider_created' } });
    expect(log).not.toBeNull();
  });

  it('reports AI readiness and whether the caller may connect a provider', async () => {
    if (!ready) return;
    const owner = await user('owner', `PP AI Org ${RUN}`);
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: owner.id } })).organizationId;
    const res = await http.get(`/v1/organizations/${orgId}/ai/status`).set(bearer(owner.token)).expect(200);
    expect(res.body).toMatchObject({ canConfigure: true, canConfigurePlatform: false });
    expect(typeof res.body.ready).toBe('boolean');
    const stranger = await user('stranger', `PP Other ${RUN}`);
    await http.get(`/v1/organizations/${orgId}/ai/status`).set(bearer(stranger.token)).expect(404);
  });
});
