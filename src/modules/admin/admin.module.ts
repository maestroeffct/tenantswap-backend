import { Module } from '@nestjs/common';

import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { PushService } from '../../common/services/push.service';
import { MatchingModule } from '../matching/matching.module';
import { ListingsModule } from '../listings/listings.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [MatchingModule, ListingsModule],
  controllers: [AdminController],
  providers: [AdminGuard, PrismaService, ReliabilityService, PushService, AdminService],
})
export class AdminModule {}
