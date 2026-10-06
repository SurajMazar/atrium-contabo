import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { assertPublicUrl, outboundAllowPrivate } from '@atrium/providers';
import { WEBHOOK_EVENTS } from '@atrium/schema';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AuthUser } from '../../common/decorators';
import { badRequest, forbidden } from '../../common/errors';
import { limitOf } from '../../common/http';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { SecretsService } from '../../common/secrets.service';
import { randomToken } from '../../common/tokens';
import { ZodBody } from '../../common/zod.pipe';

const Events = z.array(z.enum([...WEBHOOK_EVENTS, '*'] as [string, ...string[]])).min(1);
const Create = z.object({ name: z.string().trim().min(1).max(120), url: z.string().url().max(2000), events: Events, websiteId: z.string().optional() });

/**
 * Create/update-time check with the shared outbound guard (syntax + DNS: every resolved address
 * must be public unless OUTBOUND_ALLOW_PRIVATE). HTTPS only in production. The worker re-checks
 * at delivery time with connect-time validation — that check is authoritative (DNS can change).
 */
async function assertSafeUrl(url: string) {
  const production = process.env.NODE_ENV === 'production';
  try {
    await assertPublicUrl(url, { allowPrivate: outboundAllowPrivate(), protocols: production ? ['https:'] : ['https:', 'http:'] });
  } catch (err) {
    const message = (err as Error).message;
    if (/scheme/i.test(message)) throw badRequest('Webhook URLs must use HTTPS');
    throw badRequest(`Webhook URL must be publicly reachable: ${message}`);
  }
}

/** Webhooks per organization: each subscription multiplies every event into deliveries on a shared queue. */
const MAX_WEBHOOKS_PER_ORG = 50;
/** Form submissions carry visitor data: subscribing to them (or reading their payloads) needs submission.read. */
const carriesSubmissions = (events: string[] | undefined) => !!events?.some((e) => e === '*' || e.startsWith('form.'));
const canReadSubmissions = (access: AccessContext) => access.permissions.has('*') || access.permissions.has('submission.read');
function assertMaySubscribe(access: AccessContext, events: string[] | undefined) {
  if (carriesSubmissions(events) && !canReadSubmissions(access)) throw forbidden('Subscribing to form submissions requires the submission.read permission');
}

@Controller()
export class WebhooksController {
  constructor(private readonly prisma: PrismaService, private readonly secrets: SecretsService, private readonly queues: QueueService, private readonly audit: AuditService) {}

  private dto(w: { id: string; name: string; url: string; events: string[]; enabled: boolean; websiteId: string | null; createdAt: Date }, secret?: string) {
    return { id: w.id, name: w.name, url: w.url, events: w.events, enabled: w.enabled, websiteId: w.websiteId, createdAt: w.createdAt.toISOString(), ...(secret ? { secret } : {}) };
  }

  @Access('webhook.manage', 'organization', 'orgId') @Get('organizations/:orgId/webhooks')
  async list(@Param('orgId') orgId: string, @Query('websiteId') websiteId?: string) {
    return (await this.prisma.client.webhook.findMany({ where: { organizationId: orgId, ...(websiteId ? { websiteId } : {}) }, orderBy: { createdAt: 'asc' } })).map((w) => this.dto(w));
  }

  @Access('webhook.manage', 'organization', 'orgId') @Post('organizations/:orgId/webhooks')
  async create(@Param('orgId') orgId: string, @Body(new ZodBody(Create)) b: z.infer<typeof Create>, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    assertMaySubscribe(access, b.events);
    if ((await this.prisma.client.webhook.count({ where: { organizationId: orgId } })) >= MAX_WEBHOOKS_PER_ORG) throw badRequest(`An organization can have at most ${MAX_WEBHOOKS_PER_ORG} webhooks`);
    await assertSafeUrl(b.url);
    if (b.websiteId && !(await this.prisma.client.website.findFirst({ where: { id: b.websiteId, organizationId: orgId } }))) throw badRequest('Unknown website');
    const secret = `whsec_${randomToken(24)}`;
    const w = await this.prisma.client.webhook.create({ data: { organizationId: orgId, websiteId: b.websiteId ?? null, name: b.name, url: b.url, events: b.events, secretEnc: this.secrets.encrypt(secret) } });
    await this.audit.log({ organizationId: orgId, websiteId: b.websiteId, actor: user, action: 'webhook.created', resourceType: 'webhook', resourceId: w.id, summary: `${user.name} added webhook ${b.name}` });
    return this.dto(w, secret);
  }

  @Access('webhook.manage', 'webhook', 'id') @Patch('webhooks/:id')
  async update(@Param('id') id: string, @Body(new ZodBody(Create.partial().extend({ enabled: z.boolean().optional() }))) b: Partial<z.infer<typeof Create>> & { enabled?: boolean }, @CurrentAccess() access: AccessContext) {
    assertMaySubscribe(access, b.events);
    if (b.url) await assertSafeUrl(b.url);
    return this.dto(await this.prisma.client.webhook.update({ where: { id }, data: { name: b.name, url: b.url, events: b.events, enabled: b.enabled } }));
  }

  @Access('webhook.manage', 'webhook', 'id') @HttpCode(204) @Delete('webhooks/:id')
  async remove(@Param('id') id: string) {
    await this.prisma.client.webhook.delete({ where: { id } });
  }

  @Access('webhook.manage', 'webhook', 'id') @Post('webhooks/:id/test')
  async test(@Param('id') id: string) {
    const d = await this.prisma.client.webhookDelivery.create({ data: { webhookId: id, event: 'ping', payload: { event: 'ping', message: 'Webhook connected', at: new Date().toISOString() } } });
    await this.queues.add('webhook', 'webhook.deliver', { deliveryId: d.id }, { attempts: 1 });
    return this.delivery(d);
  }

  private delivery(d: { id: string; event: string; status: string; attempts: number; responseStatus: number | null; durationMs: number | null; error: string | null; createdAt: Date; payload?: unknown; responseBody?: string | null }) {
    return { id: d.id, event: d.event, status: d.status, attempts: d.attempts, responseStatus: d.responseStatus, durationMs: d.durationMs, error: d.error, createdAt: d.createdAt.toISOString(), payload: d.payload, responseBody: d.responseBody };
  }

  @Access('webhook.manage', 'webhook', 'id') @Get('webhooks/:id/deliveries')
  async deliveries(@Param('id') id: string, @Query() q: Record<string, string>, @CurrentAccess() access: AccessContext) {
    const limit = limitOf(q.limit);
    const rows = await this.prisma.client.webhookDelivery.findMany({ where: { webhookId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
    const redact = !canReadSubmissions(access);
    const items = rows.slice(0, limit).map((d) => this.delivery(redact && d.event.startsWith('form.') ? { ...d, payload: { redacted: 'Requires submission.read' } } : d));
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
  }

  @Access('webhook.manage', 'webhookDelivery', 'id') @Post('webhook-deliveries/:id/retry')
  async retry(@Param('id') id: string) {
    const d = await this.prisma.client.webhookDelivery.update({ where: { id }, data: { status: 'RETRYING', nextAttemptAt: new Date() } });
    await this.queues.add('webhook', 'webhook.deliver', { deliveryId: id, manual: true }, { attempts: 1 });
    return this.delivery(d);
  }
}
