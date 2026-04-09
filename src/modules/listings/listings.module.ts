import { Module } from '@nestjs/common';

import { MatchingModule } from '../matching/matching.module';
import { EventsModule } from '../events/events.module';

import { PrismaService } from '../../common/prisma.service';
import { UploadService } from '../../common/services/upload.service';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [MatchingModule, EventsModule],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    PrismaService,
    UploadService,
    SubscriptionGuard,
    ReliabilityGuard,
    ReliabilityService,
    SystemSettingsService,
  ],
  exports: [ListingsService],
})
export class ListingsModule {}
