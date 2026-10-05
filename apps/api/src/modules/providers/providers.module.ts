import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { ResolverService } from './resolver.service';

@Module({ controllers: [ProvidersController], providers: [ProvidersService, ResolverService], exports: [ProvidersService, ResolverService] })
export class ProvidersModule {}
