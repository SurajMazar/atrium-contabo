import { Module } from '@nestjs/common';
import { DeploymentsModule } from '../deployments/deployments.module';
import { MediaModule } from '../media/media.module';
import { PublishingController } from './publishing.controller';
import { PublishingService } from './publishing.service';

@Module({ imports: [DeploymentsModule, MediaModule], controllers: [PublishingController], providers: [PublishingService], exports: [PublishingService] })
export class PublishingModule {}
