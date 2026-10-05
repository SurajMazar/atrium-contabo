import { Module } from '@nestjs/common';
import { PublishingModule } from '../publishing/publishing.module';
import { SchedulerService } from './scheduler.service';

@Module({ imports: [PublishingModule], providers: [SchedulerService] })
export class SchedulerModule {}
