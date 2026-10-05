import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BundleAssetsService } from './bundle-assets.service';
import { PublishingModule } from '../publishing/publishing.module';
import { TemplatesModule } from '../templates/templates.module';
import { DraftModule } from './draft.module';
import { ExportService } from './export.service';
import { WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';

@Module({
  imports: [OrganizationsModule, TemplatesModule, DraftModule, PublishingModule, MediaModule],
  controllers: [WebsitesController],
  providers: [WebsitesService, ExportService, BundleAssetsService],
  exports: [WebsitesService, ExportService],
})
export class WebsitesModule {}
