import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { BootstrapService } from './bootstrap.service';
import { PrismaService } from './prisma.service';
import { QueueService } from './queue.service';
import { RedisService } from './redis.service';
import { SecretsService } from './secrets.service';
import { RedisThrottlerStorage } from './throttler.storage';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PrismaService, RedisService, QueueService, SecretsService, AccessService, AuditService, BootstrapService, RedisThrottlerStorage],
  exports: [PrismaService, RedisService, QueueService, SecretsService, AccessService, AuditService, RedisThrottlerStorage, JwtModule],
})
export class CommonModule {}
