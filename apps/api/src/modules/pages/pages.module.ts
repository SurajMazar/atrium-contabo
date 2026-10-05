import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({ imports: [TemplatesModule], controllers: [PagesController], providers: [PagesService], exports: [PagesService] })
export class PagesModule {}
