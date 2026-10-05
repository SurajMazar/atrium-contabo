import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * Integration suite against real Postgres + Redis (podman compose / CI services).
 * Skips automatically when the database is unreachable.
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let ready = true;
const secret = process.env.RENDERER_SECRET ?? 'change-me-renderer-secret';

beforeAll(async () => {
  process.env.DISABLE_QUEUES ??= 'false';
  try {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1');
    await app.init();
    http = request(app.getHttpServer());
    await http.get('/v1/health/ready').expect(200);
  } catch (err) {
    if (process.env.REQUIRE_DB === '1') throw err;
    ready = false;
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('Atrium API', () => {
  const state: Record<string, string> = {};
  const auth = () => ({ Authorization: `Bearer ${state.token}` });

  it('registers, signs in and refreshes with cookie rotation', async () => {
    if (!ready) return;
    const email = `e2e+${Date.now()}@atrium.test`;
    const reg = await http.post('/v1/auth/register').send({ name: 'E2E', email, password: 'E2e!Password#1', organizationName: 'E2E Org' }).expect(201);
    state.token = reg.body.accessToken;
    const cookie = reg.headers['set-cookie']![0]!.split(';')[0]!;
    const refreshed = await http.post('/v1/auth/refresh').set('Cookie', cookie).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // the rotated-out refresh token is now invalid and its reuse revokes the session family
    await http.post('/v1/auth/refresh').set('Cookie', cookie).expect(401);
    const login = await http.post('/v1/auth/login').send({ email, password: 'E2e!Password#1' }).expect(200);
    state.token = login.body.accessToken;
    const me = await http.get('/v1/auth/me').set(auth()).expect(200);
    state.org = me.body.memberships[0].organization.id;
    await http.post('/v1/auth/login').send({ email, password: 'wrong' }).expect(401);
  });

  it('creates, edits, publishes and serves a website', async () => {
    if (!ready) return;
    const site = await http.post(`/v1/organizations/${state.org}/websites`).set(auth()).send({ name: 'E2E Site', source: { type: 'blank' } }).expect(201);
    state.site = site.body.id;
    const draft = await http.get(`/v1/websites/${state.site}/draft`).set(auth()).expect(200);
    const home = draft.body.definition.pages.find((p: { isHomepage: boolean }) => p.isHomepage);
    home.sections[0].props.heading = 'Edited';
    await http.patch(`/v1/pages/${home.id}`).set(auth()).send({ document: home, revision: draft.body.revisions.pages[home.id] }).expect(200);
    await http.patch(`/v1/pages/${home.id}`).set(auth()).send({ document: home, revision: draft.body.revisions.pages[home.id] }).expect(409);
    await http.post(`/v1/websites/${state.site}/operations`).set(auth()).send({ operations: [{ op: 'addNode', pageId: home.id, parentId: null, node: { type: 'button', props: {} } }] }).expect(422);
    const pub = await http.post(`/v1/websites/${state.site}/publish`).set(auth()).send({}).expect(200);
    expect(pub.body.version.number).toBe(1);
    const resolved = await http.get(`/v1/public/sites/resolve?host=${site.body.slug}`).set('X-Renderer-Secret', secret).expect(200);
    expect(resolved.body.definition.pages[0].sections[0].props.heading).toBe('Edited');
    await http.get(`/v1/public/sites/resolve?host=${site.body.slug}`).expect(403);
  });

  it('accepts validated public form submissions', async () => {
    if (!ready) return;
    const form = await http.post(`/v1/websites/${state.site}/forms`).set(auth()).send({ name: 'Contact', fields: [{ type: 'email', name: 'email', label: 'Email', required: true }] }).expect(201);
    await http.post(`/v1/public/forms/${form.body.id}/submit`).send({ values: { email: 'nope' } }).expect(422);
    await http.post(`/v1/public/forms/${form.body.id}/submit`).send({ values: { email: 'a@b.co' } }).expect(200);
    const inbox = await http.get(`/v1/websites/${state.site}/submissions`).set(auth()).expect(200);
    expect(inbox.body.total).toBe(1);
  });

  it('isolates tenants', async () => {
    if (!ready) return;
    const other = await http.post('/v1/auth/register').send({ name: 'Other', email: `other+${Date.now()}@atrium.test`, password: 'Oth3r!Person#2', organizationName: 'Other' }).expect(201);
    await http.get(`/v1/websites/${state.site}/draft`).set({ Authorization: `Bearer ${other.body.accessToken}` }).expect(404);
    await http.get(`/v1/organizations/${state.org}/members`).set({ Authorization: `Bearer ${other.body.accessToken}` }).expect(404);
  });
});
