import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import { ApiError, badRequest, conflict, unauthorized, validation } from '../../common/errors';
import { escapeHtml } from '../../common/html';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { assertPasswordStrength } from '../../common/passwords';
import { hashToken, randomToken } from '../../common/tokens';
import { SecretsService } from '../../common/secrets.service';
import { QueueService } from '../../common/queue.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { JWT_AUDIENCE, JWT_ISSUER } from './jwt';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

/** Per-account brute-force protection (independent of client IP, which can be spoofed or rotated). */
const LOGIN_FREE_ATTEMPTS = 8;
const LOGIN_WINDOW_S = 15 * 60;
const LOGIN_MAX_LOCK_S = 15 * 60;
/** MFA: each challenge allows a few guesses; each user a bounded number per window. */
const MFA_ATTEMPTS_PER_CHALLENGE = 5;
const MFA_FAILS_PER_WINDOW = 10;
/** Concurrent refreshes from several tabs: a just-rotated token is "stale", not "stolen". */
const REFRESH_REUSE_GRACE_MS = 30_000;
/** Step-up: sensitive account changes need a fresh sign-in or the current password. */
const RECENT_AUTH_MS = 10 * 60_000;
const TOTP_STEP_S = 30;

export { assertPasswordStrength };

const tooMany = () => new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.');

/** Exponential lock after the free attempts: 30s, 60s, 120s … capped. */
export function loginLockSeconds(failures: number): number {
  if (failures < LOGIN_FREE_ATTEMPTS) return 0;
  return Math.min(LOGIN_MAX_LOCK_S, 30 * 2 ** (failures - LOGIN_FREE_ATTEMPTS));
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly orgs: OrganizationsService,
    private readonly secrets: SecretsService,
    private readonly queues: QueueService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  publicUser(u: { id: string; email: string; name: string; avatarUrl: string | null; isSuperAdmin: boolean; mfaEnabled: boolean; locale: string; emailVerifiedAt?: Date | null }) {
    return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, isSuperAdmin: u.isSuperAdmin, mfaEnabled: u.mfaEnabled, locale: u.locale, emailVerified: !!u.emailVerifiedAt };
  }

  // ── brute-force counters ──
  private loginKey(email: string) {
    return `auth:login-fail:${hashToken(email)}`;
  }

  private async assertNotLocked(key: string) {
    const until = Number(await this.redis.client.get(`${key}:lock`).catch(() => null));
    if (until && until > Date.now()) throw tooMany();
  }

  private async recordFailure(key: string): Promise<number> {
    try {
      const n = await this.redis.client.incr(key);
      if (n === 1) await this.redis.client.expire(key, LOGIN_WINDOW_S);
      const lock = loginLockSeconds(n);
      if (lock) await this.redis.client.set(`${key}:lock`, String(Date.now() + lock * 1000), 'EX', lock);
      return n;
    } catch {
      return 0; // Redis down: fall back to the per-IP throttler only
    }
  }

  private async clearFailures(key: string) {
    await this.redis.client.del(key, `${key}:lock`).catch(() => undefined);
  }

  // ── registration / login ──
  async register(input: { name: string; email: string; password: string; organizationName?: string }, meta: SessionMeta) {
    const email = input.email.trim().toLowerCase();
    assertPasswordStrength(input.password);
    if (await this.db.user.findUnique({ where: { email } })) throw conflict('An account with this email already exists');
    const user = await this.db.user.create({ data: { email, name: input.name.trim(), passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) } });
    if (input.organizationName?.trim()) await this.orgs.createWithOwner(input.organizationName.trim(), user.id);
    await this.sendVerification(user).catch((err: Error) => this.logger.warn(`verification email failed: ${err.message}`));
    await this.audit.log({ actor: user, action: 'auth.registered', resourceType: 'user', resourceId: user.id, summary: `${user.name} created an account`, ip: meta.ip, userAgent: meta.userAgent });
    return this.issue(user.id, meta, false);
  }

  async login(input: { email: string; password: string }, meta: SessionMeta) {
    const email = input.email.trim().toLowerCase();
    const key = this.loginKey(email);
    await this.assertNotLocked(key);
    const user = await this.db.user.findUnique({ where: { email } });
    // Always run a verify so unknown accounts take as long as known ones.
    const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, input.password).catch(() => false);
    if (!user || !user.passwordHash || !ok || user.disabledAt) {
      await this.recordFailure(key);
      if (user) await this.audit.log({ actor: user, action: 'auth.login_failed', resourceType: 'user', resourceId: user.id, summary: 'Failed sign-in attempt', ip: meta.ip, userAgent: meta.userAgent });
      throw unauthorized('Incorrect email or password');
    }
    await this.clearFailures(key);
    if (user.mfaEnabled) {
      const challengeToken = randomToken();
      await this.db.userToken.create({ data: { userId: user.id, type: 'MFA_CHALLENGE', tokenHash: hashToken(challengeToken), expiresAt: new Date(Date.now() + 5 * 60_000) } });
      return { mfaRequired: true as const, challengeToken };
    }
    await this.audit.log({ actor: user, action: 'auth.login', resourceType: 'user', resourceId: user.id, summary: `${user.name} signed in`, ip: meta.ip, userAgent: meta.userAgent });
    return this.issue(user.id, meta, false);
  }

  async verifyMfa(input: { challengeToken: string; code: string }, meta: SessionMeta) {
    const token = await this.db.userToken.findUnique({ where: { tokenHash: hashToken(input.challengeToken) }, include: { user: true } });
    if (!token || token.type !== 'MFA_CHALLENGE' || token.usedAt || token.expiresAt < new Date() || token.user.disabledAt) throw unauthorized('Verification expired, sign in again');
    const key = `auth:mfa-fail:${token.userId}`;
    await this.assertNotLocked(key);
    if (!(await this.checkMfaCode(token.user, input.code))) {
      // Count against the challenge (burned after N) and the user (locked after M in a window).
      const t = await this.db.userToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      if (t.attempts >= MFA_ATTEMPTS_PER_CHALLENGE) await this.db.userToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      const n = await this.recordFailure(key);
      if (n >= MFA_FAILS_PER_WINDOW) await this.redis.client.set(`${key}:lock`, String(Date.now() + LOGIN_MAX_LOCK_S * 1000), 'EX', LOGIN_MAX_LOCK_S).catch(() => undefined);
      await this.audit.log({ actor: token.user, action: 'auth.mfa_failed', resourceType: 'user', resourceId: token.userId, summary: 'Failed two-factor code', ip: meta.ip, userAgent: meta.userAgent });
      throw unauthorized('Invalid verification code');
    }
    const consumed = await this.db.userToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw unauthorized('Verification expired, sign in again');
    await this.clearFailures(key);
    await this.audit.log({ actor: token.user, action: 'auth.login', resourceType: 'user', resourceId: token.userId, summary: `${token.user.name} signed in with two-factor authentication`, ip: meta.ip, userAgent: meta.userAgent });
    return this.issue(token.userId, meta, true);
  }

  /** TOTP (single use per time-step) or a one-time recovery code. */
  private async checkMfaCode(user: { id: string; mfaSecretEnc: string | null; mfaRecoveryEnc: string | null; mfaLastStep?: number | null }, code: string): Promise<boolean> {
    if (!user.mfaSecretEnc) return false;
    const clean = code.replace(/[\s-]/g, '');
    const secret = this.secrets.decrypt<string>(user.mfaSecretEnc);
    if (/^\d{6}$/.test(clean)) {
      const delta = authenticator.checkDelta(clean, secret);
      if (delta === null) return false;
      const step = Math.floor(Date.now() / 1000 / TOTP_STEP_S) + delta;
      // Atomic "last step" bump: a replayed or concurrent code for the same step fails.
      const res = await this.db.user.updateMany({ where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } });
      return res.count === 1;
    }
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
    return this.jwt.signAsync({ sub: userId, sid: sessionId }, { secret: env().JWT_ACCESS_SECRET, expiresIn: env().JWT_ACCESS_TTL, algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  }

  /**
   * Rotate the refresh token. Presenting a token that was already rotated away
   * (outside a short multi-tab grace window) is treated as theft: the session is
   * revoked and the event audited.
   */
  async refresh(refreshToken: string | undefined, meta: SessionMeta) {
    if (!refreshToken) throw unauthorized('Not signed in');
    const hash = hashToken(refreshToken);
    const session = await this.db.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
    if (!session) {
      const stale = await this.db.session.findUnique({ where: { previousRefreshTokenHash: hash }, include: { user: true } });
      if (stale && !stale.revokedAt) {
        if (stale.rotatedAt && Date.now() - stale.rotatedAt.getTime() < REFRESH_REUSE_GRACE_MS) throw unauthorized('Session refreshed in another tab');
        await this.db.session.update({ where: { id: stale.id }, data: { revokedAt: new Date() } });
        await this.audit.log({ actor: stale.user, action: 'auth.refresh_reuse_detected', resourceType: 'session', resourceId: stale.id, summary: 'A previously used sign-in token was presented again; the session was revoked', ip: meta.ip, userAgent: meta.userAgent });
      }
      throw unauthorized('Not signed in');
    }
    if (session.revokedAt) throw unauthorized('Session revoked');
    if (session.expiresAt < new Date() || session.user.disabledAt) throw unauthorized('Session expired');
    const next = randomToken(48);
    // Compare-and-swap so two concurrent refreshes cannot both succeed with the same token.
    const swapped = await this.db.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: { refreshTokenHash: hashToken(next), previousRefreshTokenHash: hash, rotatedAt: new Date(), lastUsedAt: new Date(), ip: meta.ip ?? session.ip, userAgent: meta.userAgent?.slice(0, 400) ?? session.userAgent },
    });
    if (swapped.count !== 1) throw unauthorized('Session refreshed in another tab');
    return { accessToken: await this.accessToken(session.userId, session.id), refreshToken: next, user: this.publicUser(session.user) };
  }

  async logout(sessionId: string) {
    await this.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ── password reset ──
  /** Always returns immediately; the lookup and email happen off the request path (no timing oracle). */
  forgotPassword(email: string) {
    setImmediate(() => void this.sendReset(email).catch((err: Error) => this.logger.warn(`password reset failed: ${err.message}`)));
  }

  private async sendReset(rawEmail: string) {
    const user = await this.db.user.findUnique({ where: { email: rawEmail.trim().toLowerCase() } });
    if (!user || user.disabledAt) return;
    // Only the newest link works.
    await this.db.userToken.updateMany({ where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: new Date() } });
    const token = randomToken();
    await this.db.userToken.create({ data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const url = `${env().ADMIN_URL}/reset-password?token=${token}`;
    await this.queues.platformEmail({
      to: [{ email: user.email, name: user.name }],
      subject: 'Reset your Atrium password',
      text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>Use the button below to choose a new password. The link is valid for 1 hour.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#1b1b19;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p><p style="color:#666">If you didn't request this, you can ignore this email.</p>`,
    });
    await this.audit.log({ actor: user, action: 'auth.password_reset_requested', resourceType: 'user', resourceId: user.id, summary: 'Password reset requested' });
  }

  async resetPassword(token: string, password: string, meta: SessionMeta = {}) {
    assertPasswordStrength(password);
    const row = await this.db.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.type !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.db.$transaction(async (tx) => {
      // Single use, even under concurrent requests.
      const consumed = await tx.userToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw badRequest('This reset link is invalid or has expired');
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.userToken.updateMany({ where: { userId: row.userId, type: { in: ['PASSWORD_RESET', 'MFA_CHALLENGE'] }, usedAt: null }, data: { usedAt: new Date() } });
      await tx.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.clearFailures(this.loginKey((await this.db.user.findUniqueOrThrow({ where: { id: row.userId }, select: { email: true } })).email));
    await this.audit.log({ actor: { id: row.userId, name: 'User' }, action: 'auth.password_reset', resourceType: 'user', resourceId: row.userId, summary: 'Password was reset; all sessions signed out', ip: meta.ip, userAgent: meta.userAgent });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, meta: SessionMeta = {}) {
    assertPasswordStrength(next);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current))) throw validation('Current password is incorrect');
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, { type: argon2.argon2id }) } }),
      this.db.userToken.updateMany({ where: { userId, type: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: new Date() } }),
      this.db.session.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actor: user, action: 'auth.password_changed', resourceType: 'user', resourceId: userId, summary: 'Password changed; other sessions signed out', ip: meta.ip, userAgent: meta.userAgent });
  }

  /**
   * Step-up check for sensitive account changes: the current password, or a
   * session created in the last few minutes.
   */
  async assertRecentAuth(userId: string, sessionId: string, password?: string) {
    if (password !== undefined) {
      const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
      if (!user.passwordHash || !(await argon2.verify(user.passwordHash, password).catch(() => false))) throw validation('Current password is incorrect');
      return;
    }
    const s = await this.db.session.findUnique({ where: { id: sessionId }, select: { createdAt: true } });
    if (!s || Date.now() - s.createdAt.getTime() > RECENT_AUTH_MS) throw new ApiError(403, 'FORBIDDEN', 'Confirm your password to continue', { reason: 'REAUTH_REQUIRED' }); // 403, not 401: the session is valid, refreshing it would not help
  }

  // ── email verification ──
  private async sendVerification(user: { id: string; email: string; name: string }) {
    await this.db.userToken.updateMany({ where: { userId: user.id, type: 'EMAIL_VERIFY', usedAt: null }, data: { usedAt: new Date() } });
    const token = randomToken();
    await this.db.userToken.create({ data: { userId: user.id, type: 'EMAIL_VERIFY', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3 * 86_400_000) } });
    const url = `${env().API_URL.replace(/\/$/, '')}/v1/auth/email/verify?token=${token}`;
    await this.queues.platformEmail({
      to: [{ email: user.email, name: user.name }],
      subject: 'Confirm your email for Atrium',
      text: `Hi ${user.name},\n\nConfirm your email address:\n${url}\n\nThe link is valid for 3 days.`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#1b1b19;color:#fff;text-decoration:none;border-radius:6px">Confirm email</a></p><p style="color:#666">The link is valid for 3 days.</p>`,
    });
  }

  async resendVerification(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    const key = `auth:verify-resend:${userId}`;
    const n = await this.redis.client.incr(key).catch(() => 0);
    if (n === 1) await this.redis.client.expire(key, 3600).catch(() => undefined);
    if (n > 5) throw tooMany();
    await this.sendVerification(user);
  }

  async verifyEmail(token: string): Promise<boolean> {
    const row = await this.db.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.type !== 'EMAIL_VERIFY' || row.usedAt || row.expiresAt < new Date()) return false;
    const consumed = await this.db.userToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) return false;
    await this.db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
    await this.audit.log({ actor: { id: row.userId, name: 'User' }, action: 'auth.email_verified', resourceType: 'user', resourceId: row.userId, summary: 'Email address confirmed' });
    return true;
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
    return this.publicUser(await this.db.user.update({ where: { id: userId }, data: { name: body.name, avatarUrl: body.avatarUrl, locale: body.locale } }));
  }

  async sessions(userId: string, currentId: string) {
    const rows = await this.db.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' } });
    return { items: rows.map((s) => ({ id: s.id, userAgent: s.userAgent, ip: s.ip, lastUsedAt: s.lastUsedAt.toISOString(), createdAt: s.createdAt.toISOString(), current: s.id === currentId })) };
  }

  async revokeSession(userId: string, id: string) {
    const res = await this.db.session.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count) await this.audit.log({ actor: { id: userId, name: 'User' }, action: 'auth.session_revoked', resourceType: 'session', resourceId: id, summary: 'A session was signed out' });
  }

  // ── MFA management (step-up required) ──
  async setupMfa(userId: string, sessionId: string, password?: string) {
    await this.assertRecentAuth(userId, sessionId, password);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw conflict('Two-factor authentication is already enabled');
    const secret = authenticator.generateSecret();
    await this.db.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.secrets.encrypt(secret), mfaLastStep: null } });
    const otpauthUrl = authenticator.keyuri(user.email, 'Atrium', secret);
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
  }

  async enableMfa(userId: string, sessionId: string, code: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw conflict('Two-factor authentication is already enabled');
    if (!user.mfaSecretEnc) throw badRequest('Start setup first');
    if (!(await this.checkMfaCode({ ...user, mfaRecoveryEnc: null }, code))) throw validation('Invalid code');
    // 10 codes × 80 bits, shown once, stored hashed.
    const recovery = Array.from({ length: 10 }, () => randomBytes(10).toString('hex').replace(/(.{5})(?=.)/g, '$1-'));
    await this.db.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaRecoveryEnc: this.secrets.encrypt(recovery.map((c) => hashToken(c.replace(/-/g, '')))) } });
    await this.db.session.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.db.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
    await this.audit.log({ actor: user, action: 'auth.mfa_enabled', resourceType: 'user', resourceId: userId, summary: 'Two-factor authentication enabled; other sessions signed out' });
    return { recoveryCodes: recovery };
  }

  async disableMfa(userId: string, sessionId: string, code: string, password?: string) {
    await this.assertRecentAuth(userId, sessionId, password);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled || !(await this.checkMfaCode(user, code))) throw validation('Invalid code');
    await this.db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryEnc: null, mfaLastStep: null } });
    await this.db.session.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actor: user, action: 'auth.mfa_disabled', resourceType: 'user', resourceId: userId, summary: 'Two-factor authentication disabled; other sessions signed out' });
  }
}
