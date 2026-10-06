import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AdminController } from './admin.controller';

@Module({ imports: [OrganizationsModule], controllers: [AdminController] })
export class AdminModule {}
