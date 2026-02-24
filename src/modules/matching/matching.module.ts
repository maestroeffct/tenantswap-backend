import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
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
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
