import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({ imports: [ProvidersModule], controllers: [FormsController], providers: [FormsService], exports: [FormsService] })
export class FormsModule {}
