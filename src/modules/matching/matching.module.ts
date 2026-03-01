import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { AiService } from './ai.service';
import { MatchingController } from './matching.controller';
import { MatchingLifecycleService } from './matching-lifecycle.service';
import { MatchingService } from './matching.service';
import { NotificationService } from './notification.service';

@Module({
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchingLifecycleService,
    NotificationService,
    PrismaService,
    AiService,
    SubscriptionGuard,
    ReliabilityGuard,
    ReliabilityService,
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
