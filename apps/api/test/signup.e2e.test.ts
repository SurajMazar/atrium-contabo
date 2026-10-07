import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { env } from '../src/config/env';
import { PrismaService } from '../src/common/prisma.service';
import { createHash } from 'node:crypto';
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { resetThrottles } from './reset-throttle';

/** Sign-up with OPEN_SIGNUP off (the production default): accounts only through an invitation. */
let app: INestApplication;
let http: ReturnType<typeof request>;
let db: PrismaService['client'];
let ready = true;
const RUN = Date.now().toString(36);
const PASSWORD = 'S3cure!Passw0rd#';
let previous: boolean;

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
    previous = env().OPEN_SIGNUP;
    (env() as { OPEN_SIGNUP: boolean }).OPEN_SIGNUP = false;
  } catch (err) {
    if (process.env.REQUIRE_DB === '1') throw err;
    ready = false;
  }
}, 60_000);

afterAll(async () => {
  if (ready) (env() as { OPEN_SIGNUP: boolean }).OPEN_SIGNUP = previous;
  await app?.close();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('invitation-only sign-up', () => {
  it('refuses open sign-up, accepts it through a matching invitation and starts verified', async () => {
    if (!ready) return;
    expect((await http.get('/v1/branding').expect(200)).body.signup).toBe('invitation');

    const email = `invitee-${RUN}@example.test`;
    const open = await http.post('/v1/auth/register').send({ name: 'Nobody', email, password: PASSWORD }).expect(403);
    expect(open.body.error.details.reason).toBe('SIGNUP_DISABLED');

    // An organization (with its built-in roles) invites the address.
    const ownerUser = await db.user.create({ data: { email: `owner-${RUN}@example.test`, name: 'Owner', passwordHash: 'x' } });
    const org = await app.get(OrganizationsService).createWithOwner(`Invite Org ${RUN}`, ownerUser.id);
    const role = await db.role.findFirstOrThrow({ where: { organizationId: org.id, key: 'viewer' } });
    const token = `tok-${RUN}-${'x'.repeat(24)}`;
    await db.invitation.create({ data: { organizationId: org.id, email, roleId: role.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86_400_000), invitedById: ownerUser.id } });

    // Wrong address or a bogus token: refused.
    const mismatch = await http.post('/v1/auth/register').send({ name: 'Other', email: `other-${RUN}@example.test`, password: PASSWORD, invitationToken: token }).expect(403);
    expect(mismatch.body.error.details.reason).toBe('INVITATION_EMAIL_MISMATCH');
    await http.post('/v1/auth/register').send({ name: 'Invitee', email, password: PASSWORD, invitationToken: `bogus-${'y'.repeat(24)}` }).expect(400);

    // The invited address: account created, already verified, and it can accept right away.
    const ok = await http.post('/v1/auth/register').send({ name: 'Invitee', email, password: PASSWORD, invitationToken: token }).expect(201);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
    await http.post('/v1/invitations/accept').set(bearer(ok.body.accessToken)).send({ token }).expect(200);
    expect(await db.organizationMember.count({ where: { organizationId: org.id, user: { email } } })).toBe(1);
  });
});
