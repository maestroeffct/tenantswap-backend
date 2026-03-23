import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsLifecycleService } from './notifications-lifecycle.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsLifecycleService, PrismaService, ConfigService],
})
export class NotificationsModule {}
