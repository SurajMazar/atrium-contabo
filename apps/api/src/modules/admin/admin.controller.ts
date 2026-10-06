import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { AuditService } from '../../common/audit.service';
import { assertPasswordStrength, generatePassword } from '../../common/passwords';
import { OrganizationsService } from '../organizations/organizations.service';
import { CurrentUser, SuperAdminOnly, type AppRequest, type AuthUser } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { limitOf } from '../../common/http';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { ZodBody } from '../../common/zod.pipe';

/** Platform administration. Every route requires isSuperAdmin and is audited. */
@SuperAdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueService, private readonly audit: AuditService, private readonly orgs: OrganizationsService) {}

  private get db() {
    return this.prisma.client;
  }

  @Get('overview')
  async overview() {
    const [orgs, users, websites, published, submissions, media, deployments, failedDeployments, ai] = await Promise.all([
      this.db.organization.count(), this.db.user.count(), this.db.website.count({ where: { deletedAt: null } }), this.db.website.count({ where: { status: 'PUBLISHED' } }),
      this.db.formSubmission.count(), this.db.media.aggregate({ _sum: { size: true }, _count: true }), this.db.deployment.count(), this.db.deployment.count({ where: { status: 'FAILED' } }),
      this.db.aiUsage.aggregate({ _sum: { requests: true, inputTokens: true, outputTokens: true, costUsd: true } }),
    ]);
    const queues = await Promise.all(this.queues.all().map(async (q) => ({ queue: q.name, counts: await q.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed').catch(() => ({})) })));
    let dbOk = true;
    await this.db.$queryRaw`SELECT 1`.catch(() => (dbOk = false));
    return {
      counts: { organizations: orgs, users, websites, publishedWebsites: published, submissions, mediaFiles: media._count, storageMb: Math.round((media._sum.size ?? 0) / 1_048_576), deployments, failedDeployments },
      ai: { requests: ai._sum.requests ?? 0, inputTokens: ai._sum.inputTokens ?? 0, outputTokens: ai._sum.outputTokens ?? 0, costUsd: Number(ai._sum.costUsd ?? 0) },
      health: { database: dbOk ? 'ok' : 'down', queues },
    };
  }

  @Get('organizations')
  async organizations(@Query() q: Record<string, string>) {
    const limit = limitOf(q.limit);
    const rows = await this.db.organization.findMany({
      where: q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search } }] } : {},
      include: { _count: { select: { members: true, websites: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit).map((o) => ({ id: o.id, name: o.name, slug: o.slug, planKey: o.planKey, suspended: !!o.suspendedAt, featureFlags: o.featureFlags, members: o._count.members, websites: o._count.websites, createdAt: o.createdAt.toISOString() }));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
  }

  /**
   * Create an organization for a client. With `owner`, that person owns it (an existing account,
   * or a new one with a chosen or generated password, returned once) and the super admin is not
   * added as a member; without it, the super admin is the owner.
   */
  @Post('organizations')
  async createOrganization(
    @Req() req: AppRequest,
    @Body(new ZodBody(z.object({ name: z.string().trim().min(1).max(120), planKey: z.string().optional(), owner: z.object({ email: z.string().trim().email().max(254), name: z.string().trim().min(1).max(120), password: z.string().min(1).max(200).optional() }).optional() })))
    b: { name: string; planKey?: string; owner?: { email: string; name: string; password?: string } },
    @CurrentUser() user: AuthUser,
  ) {
    if (b.planKey && !(await this.db.plan.findUnique({ where: { key: b.planKey } }))) throw badRequest('Unknown plan');
    let ownerId = user.id;
    let password: string | undefined;
    let createdOwner = false;
    if (b.owner) {
      const email = b.owner.email.toLowerCase();
      const existing = await this.db.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) ownerId = existing.id;
      else {
        password = b.owner.password ?? generatePassword();
        assertPasswordStrength(password);
        const u = await this.db.user.create({ data: { email, name: b.owner.name, passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } });
        ownerId = u.id;
        createdOwner = true;
        if (b.owner.password) password = undefined; // never echo a password the admin typed
      }
    }
    const org = await this.orgs.createWithOwner(b.name, ownerId, b.planKey ?? 'starter');
    await this.audit.log({ organizationId: org.id, actor: user, action: 'platform.organization_created', resourceType: 'organization', resourceId: org.id, summary: `Super admin ${user.name} created organization ${org.name}${b.owner ? ` owned by ${b.owner.email}` : ''}`, req });
    return { id: org.id, name: org.name, slug: org.slug, planKey: org.planKey, owner: b.owner ? { email: b.owner.email.toLowerCase(), created: createdOwner, ...(password ? { password } : {}) } : null };
  }

  @Patch('organizations/:id')
  async updateOrganization(@Req() req: AppRequest, @Param('id') id: string, @Body(new ZodBody(z.object({ planKey: z.string().optional(), suspended: z.boolean().optional(), featureFlags: z.record(z.string(), z.boolean()).optional(), limits: z.record(z.string(), z.number()).nullable().optional() }))) b: { planKey?: string; suspended?: boolean; featureFlags?: Record<string, boolean>; limits?: Record<string, number> | null }, @CurrentUser() user: AuthUser) {
    if (b.planKey && !(await this.db.plan.findUnique({ where: { key: b.planKey } }))) throw badRequest('Unknown plan');
    const o = await this.db.organization.update({ where: { id }, data: { planKey: b.planKey, featureFlags: b.featureFlags, limits: b.limits === null ? undefined : b.limits, suspendedAt: b.suspended === undefined ? undefined : b.suspended ? new Date() : null } });
    await this.audit.log({ organizationId: id, actor: user, action: 'platform.organization_updated', resourceType: 'organization', resourceId: id, summary: `Super admin ${user.name} updated organization`, metadata: b, req });
    return { id: o.id, planKey: o.planKey, suspended: !!o.suspendedAt, featureFlags: o.featureFlags };
  }

  @Get('users')
  async users(@Query() q: Record<string, string>) {
    const limit = limitOf(q.limit);
    const rows = await this.db.user.findMany({
      where: q.search ? { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] } : {},
      include: { _count: { select: { memberships: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit).map((u) => ({ id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin, mfaEnabled: u.mfaEnabled, disabled: !!u.disabledAt, organizations: u._count.memberships, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
  }

  @Patch('users/:id')
  async updateUser(@Req() req: AppRequest, @Param('id') id: string, @Body(new ZodBody(z.object({ disabled: z.boolean().optional(), isSuperAdmin: z.boolean().optional() }))) b: { disabled?: boolean; isSuperAdmin?: boolean }, @CurrentUser() user: AuthUser) {
    if (id === user.id && (b.disabled || b.isSuperAdmin === false)) throw badRequest('You cannot remove your own access');
    const u = await this.db.user.update({ where: { id }, data: { disabledAt: b.disabled === undefined ? undefined : b.disabled ? new Date() : null, isSuperAdmin: b.isSuperAdmin } });
    if (b.disabled) await this.db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actor: user, action: 'platform.user_updated', resourceType: 'user', resourceId: id, summary: `Super admin ${user.name} updated ${u.email}`, metadata: b, req });
    return { id: u.id, disabled: !!u.disabledAt, isSuperAdmin: u.isSuperAdmin };
  }

  @Get('websites')
  async websites(@Query() q: Record<string, string>) {
    const limit = limitOf(q.limit);
    const rows = await this.db.website.findMany({
      where: { deletedAt: null, ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search } }] } : {}) },
      include: { organization: { select: { name: true } }, _count: { select: { pages: true, domains: true, submissions: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit).map((w) => ({ id: w.id, name: w.name, slug: w.slug, status: w.status, organization: w.organization.name, organizationId: w.organizationId, pages: w._count.pages, domains: w._count.domains, submissions: w._count.submissions, updatedAt: w.updatedAt.toISOString() }));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
  }

  @Get('jobs')
  async jobs() {
    return Promise.all(this.queues.all().map(async (q) => ({
      queue: q.name,
      counts: await q.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed').catch(() => ({})),
      failed: (await q.getFailed(0, 24).catch(() => [])).map((j) => ({ id: String(j.id), name: j.name, failedReason: j.failedReason, attemptsMade: j.attemptsMade, timestamp: j.timestamp })),
    })));
  }

  @HttpCode(204)
  @Post('jobs/:queue/:jobId/retry')
  async retry(@Param('queue') queue: string, @Param('jobId') jobId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    const q = this.queues.all().find((x) => x.name === queue);
    if (!q) throw notFound('Queue');
    const job = await q.getJob(jobId);
    if (!job) throw notFound('Job');
    await job.retry();
    await this.audit.log({ actor: user, action: 'platform.job_retried', resourceType: 'job', resourceId: `${queue}:${jobId}`, summary: `Super admin ${user.name} retried ${queue} job ${jobId}`, req });
  }

  @Get('feature-flags')
  async flags() {
    return (await this.db.featureFlag.findMany({ orderBy: { key: 'asc' } })).map((f) => ({ key: f.key, description: f.description, enabled: f.enabled, rules: f.rules }));
  }

  @HttpCode(204)
  @Put('feature-flags')
  async saveFlags(@Req() req: AppRequest, @Body(new ZodBody(z.object({ flags: z.array(z.object({ key: z.string(), enabled: z.boolean(), rules: z.record(z.string(), z.unknown()).optional() })) }))) b: { flags: Array<{ key: string; enabled: boolean; rules?: Record<string, unknown> }> }, @CurrentUser() user: AuthUser) {
    await this.db.$transaction(b.flags.map((f) => this.db.featureFlag.update({ where: { key: f.key }, data: { enabled: f.enabled, rules: (f.rules ?? undefined) as object | undefined } })));
    await this.audit.log({ actor: user, action: 'platform.flags_updated', resourceType: 'feature_flag', summary: `Super admin ${user.name} updated feature flags`, metadata: { flags: b.flags }, req });
  }

  @Get('plans')
  async plans() {
    return (await this.db.plan.findMany({ orderBy: { priceMonthly: 'asc' } })).map((p) => ({ key: p.key, name: p.name, limits: p.limits, features: p.features, priceMonthly: p.priceMonthly, active: p.active }));
  }

  @HttpCode(204)
  @Put('plans')
  async savePlans(@Body(new ZodBody(z.object({ plans: z.array(z.object({ key: z.string().regex(/^[a-z0-9_-]{1,40}$/), name: z.string().max(80), limits: z.record(z.string().max(40), z.number()), features: z.array(z.string().max(60)).max(100), priceMonthly: z.number().int().default(0), active: z.boolean().default(true) })).max(50) }))) b: { plans: Array<{ key: string; name: string; limits: Record<string, number>; features: string[]; priceMonthly: number; active: boolean }> }, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    await this.db.$transaction(b.plans.map((p) => this.db.plan.upsert({ where: { key: p.key }, create: p, update: p })));
    await this.audit.log({ actor: user, action: 'platform.plans_updated', resourceType: 'plan', summary: `Super admin ${user.name} updated plans`, metadata: { plans: b.plans.map((p) => p.key) }, req });
  }

  @Get('audit-logs')
  async auditLogs(@Query() q: Record<string, string>) {
    const limit = limitOf(q.limit);
    const rows = await this.db.auditLog.findMany({ where: q.action ? { action: { startsWith: q.action } } : {}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    const items = rows.slice(0, limit).map((a) => ({ id: a.id, action: a.action, summary: a.summary, actorType: a.actorType, actorName: a.actorName, resourceType: a.resourceType, resourceId: a.resourceId, ip: a.ip, websiteId: a.websiteId, organizationId: a.organizationId, createdAt: a.createdAt.toISOString() }));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
  }

  @Get('abuse-reports')
  async abuse() {
    return (await this.db.abuseReport.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })).map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null }));
  }

  @HttpCode(204)
  @Patch('abuse-reports/:id')
  async updateAbuse(@Param('id') id: string, @Body(new ZodBody(z.object({ status: z.enum(['open', 'investigating', 'resolved', 'dismissed']) }))) b: { status: string }, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    await this.db.abuseReport.update({ where: { id }, data: { status: b.status, resolvedAt: ['resolved', 'dismissed'].includes(b.status) ? new Date() : null } });
    await this.audit.log({ actor: user, action: 'platform.abuse_report_updated', resourceType: 'abuse_report', resourceId: id, summary: `Super admin ${user.name} marked an abuse report ${b.status}`, req });
  }

  @Get('ai-usage')
  async aiUsage() {
    const rows = await this.db.aiUsage.findMany({ orderBy: [{ period: 'desc' }, { costUsd: 'desc' }], take: 200, include: { organization: { select: { name: true } } } });
    return rows.map((r) => ({ organization: r.organization.name, organizationId: r.organizationId, period: r.period, requests: r.requests, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: Number(r.costUsd), imageGenerations: r.imageGenerations }));
  }
}
