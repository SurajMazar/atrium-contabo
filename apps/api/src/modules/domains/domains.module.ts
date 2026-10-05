import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProvidersModule } from '../providers/providers.module';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

@Module({ imports: [OrganizationsModule, ProvidersModule], controllers: [DomainsController], providers: [DomainsService], exports: [DomainsService] })
export class DomainsModule {}
