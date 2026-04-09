import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { PrismaService } from '../../common/prisma.service';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';
import { TermiiService } from '../../common/services/termii.service';
import { AiService } from './ai.service';
import { MatchingController } from './matching.controller';
import { MatchingQueueService } from './matching-queue.service';
import { MatchingLifecycleService } from './matching-lifecycle.service';
import { MatchingService } from './matching.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [EventsModule],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchingLifecycleService,
    MatchingQueueService,
    NotificationService,
    PrismaService,
    AiService,
    SubscriptionGuard,
    ReliabilityGuard,
    ReliabilityService,
    SystemSettingsService,
    TermiiService,
  ],
  exports: [MatchingService, MatchingQueueService, NotificationService],
})
export class MatchingModule {}
