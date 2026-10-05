import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProvidersModule } from '../providers/providers.module';
import { WebsitesModule } from '../websites/websites.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({ imports: [OrganizationsModule, ProvidersModule, WebsitesModule], controllers: [AiController], providers: [AiService] })
export class AiModule {}
