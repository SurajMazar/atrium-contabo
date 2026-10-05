import type { JobPayload } from '@atrium/server-kit';
import type { JobInfo, WorkerContext } from '../context';

export const RETENTION = {
  /** Raw analytics events (daily rollups are kept forever). */
  analyticsEventsDays: 395, // ≈ 13 months
  webhookDeliveriesDays: 90,
  /** Expired/revoked preview tokens are kept briefly for audit, then removed. */
  previewTokensGraceDays: 7,
  userTokensGraceDays: 7,
  sessionsGraceDays: 30,
};

const days = (n: number) => n * 86_400_000;

/**
 * `maintenance.cleanup` (daily) — expire preview tokens, delete analytics events older than
 * 13 months, prune webhook deliveries older than 90 days, drop expired one-time user tokens and
 * long-dead sessions. Scheduled page publishing is owned by the API (not the worker).
 */
export async function processMaintenanceCleanup(ctx: WorkerContext, _data: JobPayload<'maintenance.cleanup'>, _job: JobInfo) {
  const now = ctx.now().getTime();
  const before = (d: number) => new Date(now - days(d));
  const [previewTokens, analyticsEvents, webhookDeliveries, userTokens, sessions] = await Promise.all([
    ctx.prisma.previewToken.deleteMany({ where: { OR: [{ expiresAt: { lt: before(RETENTION.previewTokensGraceDays) } }, { revokedAt: { lt: before(RETENTION.previewTokensGraceDays) } }] } }),
    ctx.prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: before(RETENTION.analyticsEventsDays) } } }),
    ctx.prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: before(RETENTION.webhookDeliveriesDays) } } }),
    ctx.prisma.userToken.deleteMany({ where: { OR: [{ expiresAt: { lt: before(RETENTION.userTokensGraceDays) } }, { usedAt: { lt: before(RETENTION.userTokensGraceDays) } }] } }),
    ctx.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: before(RETENTION.sessionsGraceDays) } }, { revokedAt: { lt: before(RETENTION.sessionsGraceDays) } }] } }),
  ]);
  const result = { previewTokens: previewTokens.count, analyticsEvents: analyticsEvents.count, webhookDeliveries: webhookDeliveries.count, userTokens: userTokens.count, sessions: sessions.count };
  ctx.logger.info(result, 'maintenance cleanup done');
  return result;
}
