import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { unzip, zipFiles } from '@atrium/exporter';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { resetThrottles } from './reset-throttle';

/** Site bundles that carry their own media (`assets/…` + `asset:` references). */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let ready = true;
const RUN = Date.now().toString(36);
// 1×1 PNG with a run-specific trailing chunk so the checksum is unique per run.
const png = () => Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d', 'hex'), Buffer.from(`0000000474455874${Buffer.from(RUN.slice(0, 4).padEnd(4, 'x')).toString('hex')}00000000`, 'hex'), Buffer.from('0000000049454e44ae426082', 'hex')]);

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

describe('bundle import with media', () => {
  it('uploads bundled assets to the media library and rewrites asset: references', async () => {
    if (!ready) return;
    const r = await app.get(AuthService).register({ name: 'Bundler', email: `bundle-${RUN}@example.test`, password: 'S3cure!Passw0rd#', organizationName: `Bundle Org ${RUN}` }, {});
    const t = { Authorization: `Bearer ${r.accessToken}` };
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: r.user.id } })).organizationId;
    await db.organization.update({ where: { id: orgId }, data: { limits: { websites: 10 } } });

    // Start from a real export, then add a bundled image used by the homepage hero.
    const site = await http.post(`/v1/organizations/${orgId}/websites`).set(t).send({ name: `Source ${RUN}`, source: { type: 'blank' } }).expect(201);
    const zip = await http.get(`/v1/websites/${site.body.id}/export?format=zip`).set(t).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const files = await unzip(zip.body as Buffer);
    const homeName = [...files.keys()].find((k) => k.startsWith('pages/'))!;
    const home = JSON.parse(files.get(homeName)!.toString('utf8'));
    home.sections.unshift({ type: 'hero', variant: 'editorial', props: { heading: 'Bundled', image: { src: 'asset:images/hero.png', alt: 'Hero' } } });
    files.set(homeName, Buffer.from(JSON.stringify(home)));
    files.set('assets/images/hero.png', png());
    files.set('assets/unused.png', png()); // not referenced: ignored
    const bundle = await zipFiles(files);

    const imported = await http.post(`/v1/organizations/${orgId}/websites/import`).set(t).attach('file', bundle, 'site.zip').field('name', `Imported ${RUN}`).expect(201);
    const draft = await http.get(`/v1/websites/${imported.body.id}/draft`).set(t).expect(200);
    const hero = draft.body.definition.pages.flatMap((p: { sections: Array<{ type: string; props: { image?: { src: string; mediaId?: string } } }> }) => p.sections).find((s: { props: { heading?: string } }) => s.props.heading === 'Bundled');
    expect(hero.props.image.src).not.toMatch(/^asset:/);
    expect(hero.props.image.mediaId).toBeTruthy();
    const media = await db.media.findUniqueOrThrow({ where: { id: hero.props.image.mediaId } });
    expect(media.organizationId).toBe(orgId);
    expect(media.mimeType).toBe('image/png');
  });

  it('rejects bundles that reference missing assets', async () => {
    if (!ready) return;
    const r = await app.get(AuthService).register({ name: 'Bundler2', email: `bundle2-${RUN}@example.test`, password: 'S3cure!Passw0rd#', organizationName: `Bundle Org2 ${RUN}` }, {});
    const t = { Authorization: `Bearer ${r.accessToken}` };
    const orgId = (await db.organizationMember.findFirstOrThrow({ where: { userId: r.user.id } })).organizationId;
    const files = new Map<string, Buffer>([
      ['site.json', Buffer.from(JSON.stringify({ settings: { name: 'X', business: { name: 'X' }, logo: { src: 'asset:logo.png' } }, header: { type: 'site-header' }, footer: { type: 'site-footer' } }))],
      ['pages/_home.json', Buffer.from(JSON.stringify({ title: 'Home', slug: '', isHomepage: true, sections: [] }))],
      ['assets/other.png', png()],
    ]);
    const res = await http.post(`/v1/organizations/${orgId}/websites/import`).set(t).attach('file', await zipFiles(files), 'site.zip');
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('logo.png');
  });
});
