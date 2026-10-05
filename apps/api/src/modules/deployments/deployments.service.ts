import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { deploymentDto } from '../websites/websites.service';

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueService, private readonly audit: AuditService) {}

  private get db() {
    return this.prisma.client;
  }

  async list(websiteId: string) {
    const rows = await this.db.deployment.findMany({ where: { websiteId }, orderBy: { createdAt: 'desc' }, take: 100, include: { version: { select: { number: true } } } });
    const users = new Map((await this.db.user.findMany({ where: { id: { in: rows.map((r) => r.triggeredById).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...deploymentDto(r), versionNumber: r.version?.number ?? null, triggeredBy: r.triggeredById ? (users.get(r.triggeredById) ?? null) : null }));
  }

  async get(id: string) {
    const r = await this.db.deployment.findUniqueOrThrow({ where: { id }, include: { version: { select: { number: true } } } });
    return { ...deploymentDto(r, true), versionNumber: r.version?.number ?? null };
  }

  /** Queue a deployment of a published snapshot (or the current published version). */
  async create(websiteId: string, body: { target: 'preview' | 'production'; versionId?: string }, user: AuthUser | null, meta: Record<string, unknown> = {}) {
    const site = await this.db.website.findUniqueOrThrow({ where: { id: websiteId } });
    const versionId = body.versionId ?? site.publishedVersionId;
    if (!versionId) throw badRequest('Publish the website before deploying');
    const version = await this.db.websiteVersion.findFirst({ where: { id: versionId, websiteId } });
    if (!version) throw notFound('Version');
    const provider = site.deploymentMode === 'INDEPENDENT' ? (site.deploymentProvider ?? 'vercel') : 'self-hosted';
    if (site.deploymentMode === 'INDEPENDENT' && !site.deploymentIntegrationId) throw badRequest('Connect a deployment integration (e.g. Vercel) in website settings first');
    const d = await this.db.deployment.create({
      data: { websiteId, versionId, provider, target: body.target === 'production' ? 'PRODUCTION' : 'PREVIEW', status: 'QUEUED', triggeredById: user?.id ?? null, meta: { integrationId: site.deploymentIntegrationId, ...meta } as object },
    });
    await this.queues.add('deployment', 'deployment.run', { deploymentId: d.id }, { attempts: 1, jobId: `deploy-${d.id}` });
    await this.audit.log({ organizationId: site.organizationId, websiteId, actor: user, action: 'deployment.created', resourceType: 'deployment', resourceId: d.id, summary: `${user?.name ?? 'System'} started a ${body.target} deployment of v${version.number}` });
    await this.queues.emit(site.organizationId, websiteId, 'deployment.created', { deploymentId: d.id, target: body.target, version: version.number });
    return this.get(d.id);
  }

  async redeploy(id: string, user: AuthUser) {
    const d = await this.db.deployment.findUniqueOrThrow({ where: { id } });
    return this.create(d.websiteId, { target: d.target === 'PRODUCTION' ? 'production' : 'preview', versionId: d.versionId ?? undefined }, user, { action: 'redeploy', redeployOf: d.id, redeployExternalId: d.externalId });
  }

  async rollback(id: string, user: AuthUser) {
    const d = await this.db.deployment.findUniqueOrThrow({ where: { id } });
    if (d.status !== 'READY' || d.target !== 'PRODUCTION') throw badRequest('Only successful production deployments can be rolled back to');
    const created = await this.create(d.websiteId, { target: 'production', versionId: d.versionId ?? undefined }, user, { action: 'rollback', rollbackTo: d.id, rollbackExternalId: d.externalId });
    await this.db.deployment.update({ where: { id: created.id }, data: { rollbackOfId: d.id } });
    if (d.versionId) await this.db.website.update({ where: { id: d.websiteId }, data: { publishedVersionId: d.versionId } });
    return this.get(created.id);
  }

  async cancel(id: string, user: AuthUser) {
    const d = await this.db.deployment.findUniqueOrThrow({ where: { id } });
    if (!['QUEUED', 'BUILDING'].includes(d.status)) throw badRequest('This deployment already finished');
    const job = await this.queues.queue('deployment').getJob(`deploy-${d.id}`);
    if (job && (await job.isWaiting())) await job.remove();
    await this.db.deployment.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date(), meta: { ...(d.meta as object), cancelRequestedBy: user.id } } });
    return this.get(id);
  }
}
