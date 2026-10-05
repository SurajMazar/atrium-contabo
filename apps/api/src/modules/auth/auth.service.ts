import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { badRequest, conflict, unauthorized, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { hashToken, randomToken } from '../../common/tokens';
import { SecretsService } from '../../common/secrets.service';
import { QueueService } from '../../common/queue.service';
import { OrganizationsService } from '../organizations/organizations.service';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

const PASSWORD_MIN = 10;

export function assertPasswordStrength(password: string) {
  if (password.length < PASSWORD_MIN) throw validation(`Password must be at least ${PASSWORD_MIN} characters`);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) throw validation('Use a mix of upper and lower case letters, numbers and symbols');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly orgs: OrganizationsService,
    private readonly secrets: SecretsService,
    private readonly queues: QueueService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  publicUser(u: { id: string; email: string; name: string; avatarUrl: string | null; isSuperAdmin: boolean; mfaEnabled: boolean; locale: string }) {
    return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, isSuperAdmin: u.isSuperAdmin, mfaEnabled: u.mfaEnabled, locale: u.locale };
  }

  async register(input: { name: string; email: string; password: string; organizationName?: string }, meta: SessionMeta) {
    const email = input.email.trim().toLowerCase();
    assertPasswordStrength(input.password);
    if (await this.db.user.findUnique({ where: { email } })) throw conflict('An account with this email already exists');
    const user = await this.db.user.create({ data: { email, name: input.name.trim(), passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) } });
    if (input.organizationName?.trim()) await this.orgs.createWithOwner(input.organizationName.trim(), user.id);
    return this.issue(user.id, meta, true);
  }

  async login(input: { email: string; password: string }, meta: SessionMeta) {
    const user = await this.db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    // constant-ish time: always run a verify
    const ok = user?.passwordHash ? await argon2.verify(user.passwordHash, input.password).catch(() => false) : await argon2.verify('$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG', input.password).catch(() => false);
    if (!user || !ok || user.disabledAt) throw unauthorized('Incorrect email or password');
    if (user.mfaEnabled) {
      const challengeToken = randomToken();
      await this.db.userToken.create({ data: { userId: user.id, type: 'MFA_CHALLENGE', tokenHash: hashToken(challengeToken), expiresAt: new Date(Date.now() + 5 * 60_000) } });
      return { mfaRequired: true as const, challengeToken };
    }
    return this.issue(user.id, meta, false);
  }

  async verifyMfa(input: { challengeToken: string; code: string }, meta: SessionMeta) {
    const token = await this.db.userToken.findUnique({ where: { tokenHash: hashToken(input.challengeToken) }, include: { user: true } });
    if (!token || token.type !== 'MFA_CHALLENGE' || token.usedAt || token.expiresAt < new Date()) throw unauthorized('Verification expired, sign in again');
    if (!(await this.checkMfaCode(token.user, input.code))) throw unauthorized('Invalid verification code');
    await this.db.userToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return this.issue(token.userId, meta, true);
  }

  private async checkMfaCode(user: { id: string; mfaSecretEnc: string | null; mfaRecoveryEnc: string | null }, code: string): Promise<boolean> {
    if (!user.mfaSecretEnc) return false;
    const clean = code.replace(/\s/g, '');
    const secret = this.secrets.decrypt<string>(user.mfaSecretEnc);
    if (/^\d{6}$/.test(clean) && authenticator.verify({ token: clean, secret })) return true;
    if (user.mfaRecoveryEnc) {
      const codes = this.secrets.decrypt<string[]>(user.mfaRecoveryEnc);
      const hashed = hashToken(clean.toLowerCase());
      if (codes.includes(hashed)) {
        await this.db.user.update({ where: { id: user.id }, data: { mfaRecoveryEnc: this.secrets.encrypt(codes.filter((c) => c !== hashed)) } });
        return true;
      }
    }
    return false;
  }

  /** Create a session, returning access token + refresh token (set as cookie by controller). */
  async issue(userId: string, meta: SessionMeta, mfaVerified: boolean) {
    const refreshToken = randomToken(48);
    const session = await this.db.session.create({
      data: { userId, refreshTokenHash: hashToken(refreshToken), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 400), mfaVerified, expiresAt: new Date(Date.now() + env().REFRESH_TTL_DAYS * 86_400_000) },
    });
    const user = await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    const accessToken = await this.accessToken(userId, session.id);
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  private accessToken(userId: string, sessionId: string) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId }, { secret: env().JWT_ACCESS_SECRET, expiresIn: env().JWT_ACCESS_TTL });
  }

  /** Rotate the refresh token. Reuse of a rotated token revokes every session of the user. */
  async refresh(refreshToken: string | undefined, meta: SessionMeta) {
    if (!refreshToken) throw unauthorized('Not signed in');
    const session = await this.db.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) }, include: { user: true } });
    if (!session) throw unauthorized('Not signed in');
    if (session.revokedAt) {
      await this.db.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthorized('Session revoked');
    }
    if (session.expiresAt < new Date() || session.user.disabledAt) throw unauthorized('Session expired');
    const next = randomToken(48);
    await this.db.session.update({ where: { id: session.id }, data: { refreshTokenHash: hashToken(next), lastUsedAt: new Date(), ip: meta.ip ?? session.ip, userAgent: meta.userAgent?.slice(0, 400) ?? session.userAgent } });
    return { accessToken: await this.accessToken(session.userId, session.id), refreshToken: next, user: this.publicUser(session.user) };
  }

  async logout(sessionId: string) {
    await this.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async forgotPassword(email: string) {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.disabledAt) return;
    const token = randomToken();
    await this.db.userToken.create({ data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const url = `${env().ADMIN_URL}/reset-password?token=${token}`;
    await this.queues.platformEmail({
      to: [{ email: user.email, name: user.name }],
      subject: 'Reset your Atrium password',
      text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>Hi ${escape(user.name)},</p><p>Use the button below to choose a new password. The link is valid for 1 hour.</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1b1b19;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p><p style="color:#666">If you didn't request this, you can ignore this email.</p>`,
    });
  }

  async resetPassword(token: string, password: string) {
    assertPasswordStrength(password);
    const row = await this.db.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.type !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
    await this.db.$transaction([
      this.db.user.update({ where: { id: row.userId }, data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } }),
      this.db.userToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.db.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string) {
    assertPasswordStrength(next);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current))) throw validation('Current password is incorrect');
    await this.db.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, { type: argon2.argon2id }) } });
    await this.db.session.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.db.organizationMember.findMany({
      where: { userId, organization: { suspendedAt: null } },
      include: { organization: true, role: { include: { permissions: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      user: this.publicUser(user),
      memberships: memberships.map((m) => ({
        organization: { id: m.organization.id, name: m.organization.name, slug: m.organization.slug, planKey: m.organization.planKey },
        role: { id: m.role.id, key: m.role.key, name: m.role.name },
        permissions: m.role.permissions.map((p) => p.permissionKey),
        websiteIds: m.websiteIds,
      })),
    };
  }

  async updateMe(userId: string, body: { name?: string; avatarUrl?: string | null; locale?: string }) {
    return this.publicUser(await this.db.user.update({ where: { id: userId }, data: body }));
  }

  async sessions(userId: string, currentId: string) {
    const rows = await this.db.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' } });
    return { items: rows.map((s) => ({ id: s.id, userAgent: s.userAgent, ip: s.ip, lastUsedAt: s.lastUsedAt.toISOString(), createdAt: s.createdAt.toISOString(), current: s.id === currentId })) };
  }

  async revokeSession(userId: string, id: string) {
    await this.db.session.updateMany({ where: { id, userId }, data: { revokedAt: new Date() } });
  }

  async setupMfa(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw conflict('Two-factor authentication is already enabled');
    const secret = authenticator.generateSecret();
    await this.db.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.secrets.encrypt(secret) } });
    const otpauthUrl = authenticator.keyuri(user.email, 'Atrium', secret);
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
  }

  async enableMfa(userId: string, code: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEnc) throw badRequest('Start setup first');
    if (!authenticator.verify({ token: code.replace(/\s/g, ''), secret: this.secrets.decrypt<string>(user.mfaSecretEnc) })) throw validation('Invalid code');
    const recovery = Array.from({ length: 10 }, () => randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8));
    await this.db.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaRecoveryEnc: this.secrets.encrypt(recovery.map((c) => hashToken(c))) } });
    return { recoveryCodes: recovery };
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled || !(await this.checkMfaCode(user, code))) throw validation('Invalid code');
    await this.db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryEnc: null } });
  }
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
