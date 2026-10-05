import { Module } from '@nestjs/common';
import { GlobalSectionsController } from './global-sections.controller';

@Module({ controllers: [GlobalSectionsController] })
export class GlobalSectionsModule {}
