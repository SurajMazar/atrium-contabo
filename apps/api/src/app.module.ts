import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { AuthGuard } from './common/auth.guard';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/exception.filter';
import { RedisThrottlerStorage } from './common/throttler.storage';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandingModule } from './modules/branding/branding.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { DomainsModule } from './modules/domains/domains.module';
import { FormsModule } from './modules/forms/forms.module';
import { GlobalSectionsModule } from './modules/global-sections/global-sections.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PagesModule } from './modules/pages/pages.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { PublicModule } from './modules/public/public.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { RegistryModule } from './modules/registry/registry.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SeoModule } from './modules/seo/seo.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { DraftModule } from './modules/websites/draft.module';
import { WebsitesModule } from './modules/websites/websites.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env().NODE_ENV === 'production' ? 'info' : 'debug',
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
        redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-renderer-secret"]', 'res.headers["set-cookie"]', '*.password', '*.secrets', '*.token'], censor: '[redacted]' },
        autoLogging: { ignore: (req) => req.url?.startsWith('/v1/health') ?? false },
        transport: env().NODE_ENV === 'development' ? { target: 'pino/file', options: { destination: 1 } } : undefined,
        customProps: () => ({ service: 'api' }),
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }], storage }),
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    DraftModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    TemplatesModule,
    WebsitesModule,
    PagesModule,
    PublishingModule,
    DeploymentsModule,
    DomainsModule,
    ProvidersModule,
    FormsModule,
    PublicModule,
    MediaModule,
    CollectionsModule,
    GlobalSectionsModule,
    WebhooksModule,
    SeoModule,
    AnalyticsModule,
    RegistryModule,
    AiModule,
    AdminModule,
    BrandingModule,
    SchedulerModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
