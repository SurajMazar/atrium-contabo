import { Controller, Get, HttpException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get()
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch (e) {
      checks.database = (e as Error).message;
    }
    try {
      checks.redis = (await this.redis.client.ping()) === 'PONG' ? 'ok' : 'unexpected';
    } catch (e) {
      checks.redis = (e as Error).message;
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    if (!ok) throw new HttpException({ status: 'degraded', checks }, 503);
    return { status: 'ok', checks };
  }
}
