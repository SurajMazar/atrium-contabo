import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetThrottles } from './reset-throttle';

/** Trash: delete moves a website to the trash; restore brings it back; purge removes it and nothing else. */
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
async function owner(label: string) {
  const r = await app.get(AuthService).register({ name: label, email: `trash-${label}-${RUN}@example.test`, password: PASSWORD, organizationName: `Trash ${label} ${RUN}` }, {});
  const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: r.user.id } })).organizationId;
  await db.organization.update({ where: { id: orgId }, data: { limits: { websites: 10, members: 10 } } });
  return { t: bearer(r.accessToken), orgId };
}
const media = (organizationId: string, websiteId: string, name: string) =>
  db.media.create({ data: { organizationId, websiteId, key: `${organizationId}/trash-test/${RUN}-${name}.png`, filename: `${name}.png`, mimeType: 'image/png', size: 10, checksum: `${RUN}-${name}` } });

describe('website trash', () => {
  it('purges one deleted website and keeps media other websites use, without touching anything else', async () => {
    if (!ready) return;
    const a = await owner('a');
    const gone = (await http.post(`/v1/organizations/${a.orgId}/websites`).set(a.t).send({ name: `Gone ${RUN}`, source: { type: 'blank' } }).expect(201)).body;
    const kept = (await http.post(`/v1/organizations/${a.orgId}/websites`).set(a.t).send({ name: `Kept ${RUN}`, source: { type: 'blank' } }).expect(201)).body;
    const shared = await media(a.orgId, gone.id, 'shared');
    const own = await media(a.orgId, gone.id, 'own');
    // The other website still uses the shared file (as an import that reused it would).
    await db.websiteSettings.update({ where: { websiteId: kept.id }, data: { customCss: `.x{background:url(https://cdn.example.test/${shared.key})}` } });

    const b = await owner('b');
    const foreign = (await http.post(`/v1/organizations/${b.orgId}/websites`).set(b.t).send({ name: `Foreign ${RUN}`, source: { type: 'blank' } }).expect(201)).body;
    const foreignMedia = await media(b.orgId, foreign.id, 'foreign');
    await db.website.update({ where: { id: foreign.id }, data: { deletedAt: new Date(), slug: `deleted-${foreign.id}` } });

    // Delete = trash: the slug is released and the site is listed in the trash.
    await http.delete(`/v1/websites/${gone.id}`).set(a.t).expect(204);
    await http.get(`/v1/websites/${gone.id}`).set(a.t).expect(404);
    const trash = (await http.get(`/v1/organizations/${a.orgId}/trash/websites`).set(a.t).expect(200)).body as Array<{ id: string; media: number }>;
    expect(trash.map((s) => s.id)).toEqual([gone.id]);
    expect(trash[0]!.media).toBe(2);
    expect((await db.website.findUniqueOrThrow({ where: { id: gone.id } })).slug).toBe(`deleted-${gone.id}`);

    // Nobody can purge across organizations, and live websites cannot be purged.
    const cross = await http.delete(`/v1/organizations/${a.orgId}/trash/websites/${gone.id}`).set(b.t);
    expect([403, 404]).toContain(cross.status);
    expect(await db.website.findUnique({ where: { id: gone.id } })).not.toBeNull();
    await http.delete(`/v1/organizations/${a.orgId}/trash/websites/${foreign.id}`).set(a.t).expect(404);
    await http.delete(`/v1/organizations/${a.orgId}/trash/websites/${kept.id}`).set(a.t).expect(404);

    const res = await http.delete(`/v1/organizations/${a.orgId}/trash/websites/${gone.id}`).set(a.t).expect(200);
    expect(res.body).toMatchObject({ mediaDeleted: 1, mediaKept: 1 });

    expect(await db.website.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await db.page.count({ where: { websiteId: gone.id } })).toBe(0);
    expect(await db.websiteVersion.count({ where: { websiteId: gone.id } })).toBe(0);
    expect(await db.media.findUnique({ where: { id: own.id } })).toBeNull();
    expect((await db.media.findUniqueOrThrow({ where: { id: shared.id } })).websiteId).toBe(kept.id);
    // Everything else is untouched.
    expect(await db.page.count({ where: { websiteId: kept.id } })).toBeGreaterThan(0);
    expect(await db.website.findUnique({ where: { id: foreign.id } })).not.toBeNull();
    expect(await db.media.findUnique({ where: { id: foreignMedia.id } })).not.toBeNull();
    expect(((await http.get(`/v1/organizations/${a.orgId}/trash/websites`).set(a.t).expect(200)).body as unknown[]).length).toBe(0);
  });

  it('restores a deleted website under its name', async () => {
    if (!ready) return;
    const c = await owner('c');
    const site = (await http.post(`/v1/organizations/${c.orgId}/websites`).set(c.t).send({ name: `Back ${RUN}`, source: { type: 'blank' } }).expect(201)).body;
    await http.delete(`/v1/websites/${site.id}`).set(c.t).expect(204);
    const res = await http.post(`/v1/organizations/${c.orgId}/trash/websites/${site.id}/restore`).set(c.t).send({}).expect(201);
    expect(res.body.slug).toBe(site.slug);
    await http.get(`/v1/websites/${site.id}`).set(c.t).expect(200);
  });
});
