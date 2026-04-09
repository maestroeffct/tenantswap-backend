import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PrismaService, SystemSettingsService],
  exports: [BillingService],
})
export class BillingModule {}
