import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { PublishingModule } from '../publishing/publishing.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({ imports: [PublishingModule, ProvidersModule], controllers: [PublicController], providers: [PublicService] })
export class PublicModule {}
