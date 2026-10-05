import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { PlatformProvidersController, PlatformProvidersService } from './platform-providers';
import { ProvidersService } from './providers.service';
import { ResolverService } from './resolver.service';

@Module({ controllers: [ProvidersController, PlatformProvidersController], providers: [ProvidersService, ResolverService, PlatformProvidersService], exports: [ProvidersService, ResolverService] })
export class ProvidersModule {}
