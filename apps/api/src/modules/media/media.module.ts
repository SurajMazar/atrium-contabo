import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProvidersModule } from '../providers/providers.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ imports: [OrganizationsModule, ProvidersModule], controllers: [MediaController], providers: [MediaService], exports: [MediaService] })
export class MediaModule {}
