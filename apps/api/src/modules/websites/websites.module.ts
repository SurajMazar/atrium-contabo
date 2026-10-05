import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PublishingModule } from '../publishing/publishing.module';
import { TemplatesModule } from '../templates/templates.module';
import { DraftModule } from './draft.module';
import { ExportService } from './export.service';
import { WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';

@Module({
  imports: [OrganizationsModule, TemplatesModule, DraftModule, PublishingModule],
  controllers: [WebsitesController],
  providers: [WebsitesService, ExportService],
  exports: [WebsitesService, ExportService],
})
export class WebsitesModule {}
