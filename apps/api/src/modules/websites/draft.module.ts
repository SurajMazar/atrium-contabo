import { Global, Module } from '@nestjs/common';
import { DraftService } from './draft.service';

@Global()
@Module({ providers: [DraftService], exports: [DraftService] })
export class DraftModule {}
