import { Module } from '@nestjs/common';
import { DeploymentsModule } from '../deployments/deployments.module';
import { PublishingController } from './publishing.controller';
import { PublishingService } from './publishing.service';

@Module({ imports: [DeploymentsModule], controllers: [PublishingController], providers: [PublishingService], exports: [PublishingService] })
export class PublishingModule {}
