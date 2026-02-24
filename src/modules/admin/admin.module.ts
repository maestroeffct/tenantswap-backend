import { Module } from '@nestjs/common';

import { AdminGuard } from '../../common/guards/admin.guard';
import { MatchingModule } from '../matching/matching.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [MatchingModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
