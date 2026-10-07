import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProvidersModule } from '../providers/providers.module';
import { AdminController } from './admin.controller';
import { OrganizationDeletionService } from './organization-deletion.service';

@Module({ imports: [OrganizationsModule, ProvidersModule], controllers: [AdminController], providers: [OrganizationDeletionService] })
export class AdminModule {}
