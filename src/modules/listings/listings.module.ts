import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  controllers: [ListingsController],
  providers: [
    ListingsService,
    PrismaService,
    SubscriptionGuard,
    ReliabilityGuard,
    ReliabilityService,
  ],
})
export class ListingsModule {}
