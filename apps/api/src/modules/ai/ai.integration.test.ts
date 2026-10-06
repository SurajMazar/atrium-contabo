import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { reserveAiRequests } from '@atrium/agent';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

/**
 * AI routes against real Postgres + Redis with the offline demo provider (never a real model).
 * Skips automatically when the database is unreachable (REQUIRE_DB=1 makes it fail instead).
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService['client'];
let ready = true;
const prevDemo = process.env.AI_DEMO;

beforeAll(async () => {
  process.env.AI_DEMO = '1';
  process.env.DISABLE_QUEUES ??= 'false';
  try {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService).client;
    await http.get('/v1/health/ready').expect(200);
  } catch (err) {
    if (process.env.REQUIRE_DB === '1') throw err;
    ready = false;
  }
}, 60_000);

afterAll(async () => {
  process.env.AI_DEMO = prevDemo;
  await app?.close();
});

describe('AI module (demo provider)', () => {
  const s: Record<string, string> = {};
  const auth = () => ({ Authorization: `Bearer ${s.token}` });

  it('sets up an organization and website', async () => {
    if (!ready) return;
    const reg = await http.post('/v1/auth/register').send({ name: 'AI Sec', email: `ai-sec+${Date.now()}@atrium.test`, password: 'Ai!Security#Test1', organizationName: 'AI Sec Org' }).expect(201);
    s.token = reg.body.accessToken;
    // Organizations are created by platform administrators, not by signing up.
    await app.get(OrganizationsService).createWithOwner('AI Sec Org', reg.body.user.id);
    const me = await http.get('/v1/auth/me').set(auth()).expect(200);
    s.org = me.body.memberships[0].organization.id;
    const site = await http.post(`/v1/organizations/${s.org}/websites`).set(auth()).send({ name: 'AI Sec Site', source: { type: 'blank' } }).expect(201);
    s.site = site.body.id;
    const draft = await http.get(`/v1/websites/${s.site}/draft`).set(auth()).expect(200);
    s.home = draft.body.definition.pages[0].id;
  });

  it('reserves quota atomically under parallel load', async () => {
    if (!ready) return;
    const period = new Date().toISOString().slice(0, 7);
    await prisma.aiUsage.deleteMany({ where: { organizationId: s.org!, period } });
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => reserveAiRequests(prisma, s.org!, { aiRequestsPerMonth: 10 })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const row = await prisma.aiUsage.findUnique({ where: { organizationId_period: { organizationId: s.org!, period } } });
    expect(row?.requests).toBe(10);
    await prisma.aiUsage.deleteMany({ where: { organizationId: s.org!, period } });
  });

  it('refuses AI routes when the plan / feature flags lack aiBuilder', async () => {
    if (!ready) return;
    await prisma.organization.update({ where: { id: s.org! }, data: { featureFlags: { aiBuilder: false } } });
    try {
      const res = await http.post(`/v1/websites/${s.site}/ai/edit`).set(auth()).send({ prompt: 'make it darker', pageId: s.home }).expect(403);
      expect(res.body.error.message).toMatch(/AI builder/);
    } finally {
      await prisma.organization.update({ where: { id: s.org! }, data: { featureFlags: {} } });
    }
  });

  it('requires explicit confirmation, streams progress with single-use tickets, and refuses stale reverts', async () => {
    if (!ready) return;
    const proposal = await http.post(`/v1/websites/${s.site}/ai/edit`).set(auth()).send({ prompt: 'Change this site to a darker color palette and squared buttons', pageId: s.home }).expect(200);
    expect(proposal.body.operations.length).toBeGreaterThan(0);
    expect(proposal.body.requiresConfirmation).toBe(true);
    expect(proposal.body.confirmationReasons).toContain('Changes the site theme');
    const id = proposal.body.generationId as string;

    // apply without confirmation → 409 CONFIRMATION_REQUIRED (current admin client sends no body)
    const unconfirmed = await http.post(`/v1/ai/generations/${id}/apply`).set(auth()).expect(409);
    expect(unconfirmed.body.error.code).toBe('CONFIRMATION_REQUIRED');
    expect(unconfirmed.body.error.details.reasons).toContain('Changes the site theme');
    await http.post(`/v1/ai/generations/${id}/apply`).set(auth()).send({ confirm: true }).expect(200);
    await http.post(`/v1/ai/generations/${id}/apply`).set(auth()).send({ confirm: true }).expect(400);

    // SSE: ticket auth, single use; no credentials → 401; legacy bearer still accepted
    const t = await http.post(`/v1/ai/generations/${id}/stream-ticket`).set(auth()).expect(200);
    expect(t.body.expiresIn).toBe(60);
    const sse = await http.get(`/v1/ai/generations/${id}/events?ticket=${t.body.ticket}`).expect(200);
    expect(sse.text).toContain('event: done');
    await http.get(`/v1/ai/generations/${id}/events?ticket=${t.body.ticket}`).expect(401);
    await http.get(`/v1/ai/generations/${id}/events`).expect(401);
    await http.get(`/v1/ai/generations/${id}/events`).set(auth()).expect(200);

    // a later manual theme edit makes a blind revert unsafe
    await http.post(`/v1/websites/${s.site}/operations`).set(auth()).send({ operations: [{ op: 'updateTheme', patch: { buttons: { radius: '9px' } } }] }).expect((r) => expect(r.status).toBeLessThan(300));
    const stale = await http.post(`/v1/ai/generations/${id}/revert`).set(auth()).expect(409);
    expect(stale.body.error.details.code).toBe('AI_REVERT_STALE');
    await http.post(`/v1/ai/generations/${id}/revert`).set(auth()).send({ force: true }).expect(200);
    const gen = await http.get(`/v1/ai/generations/${id}`).set(auth()).expect(200);
    expect(gen.body.status).toBe('REVERTED');
  }, 60_000);

  it('limits concurrent AI requests per user', async () => {
    if (!ready) return;
    const calls = await Promise.all(Array.from({ length: 4 }, () => http.post(`/v1/websites/${s.site}/ai/rewrite`).set(auth()).send({ text: 'A good place to stay', mode: 'luxurious' })));
    const codes = calls.map((c) => c.status).sort();
    expect(codes.filter((c) => c === 200).length).toBeGreaterThanOrEqual(1);
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(2);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
