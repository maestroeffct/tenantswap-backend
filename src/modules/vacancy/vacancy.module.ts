import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { MatchingModule } from '../matching/matching.module';
import { VacancyController } from './vacancy.controller';
import { VacancyService } from './vacancy.service';

@Module({
  imports: [MatchingModule],
  controllers: [VacancyController],
  providers: [VacancyService, PrismaService, SubscriptionGuard, ReliabilityGuard, ReliabilityService],
  exports: [VacancyService],
})
export class VacancyModule {}
