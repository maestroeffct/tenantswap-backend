import { Module } from '@nestjs/common';

import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { MatchingModule } from '../matching/matching.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [MatchingModule],
  controllers: [AdminController],
  providers: [AdminGuard, PrismaService, ReliabilityService],
})
export class AdminModule {}
