import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { PublishingService } from '../publishing/publishing.service';

/** API-owned cron: scheduled page publishing (single-runner via Redis lock). */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('Scheduler');
  constructor(private readonly prisma: PrismaService, private readonly publishing: PublishingService, private readonly redis: RedisService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduled() {
    const lock = await this.redis.client.set('lock:scheduled-publish', String(process.pid), 'EX', 55, 'NX').catch(() => null);
    if (lock !== 'OK') return;
    const due = await this.prisma.client.page.findMany({ where: { status: 'SCHEDULED', publishAt: { lte: new Date() } }, select: { websiteId: true }, distinct: ['websiteId'] });
    for (const { websiteId } of due) {
      try {
        await this.prisma.client.page.updateMany({ where: { websiteId, status: 'SCHEDULED', publishAt: { lte: new Date() } }, data: { status: 'DRAFT' } });
        await this.publishing.publish(websiteId, { message: 'Scheduled publish' }, null);
        this.logger.log(`published scheduled pages for ${websiteId}`);
      } catch (err) {
        this.logger.warn(`scheduled publish failed for ${websiteId}: ${(err as Error).message}`);
      }
    }
  }
}
