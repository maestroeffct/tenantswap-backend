import { Module } from '@nestjs/common';

import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { PushService } from '../../common/services/push.service';
import { UploadService } from '../../common/services/upload.service';
import { SystemSettingsService } from '../../common/services/system-settings.service';
import { EmailService } from '../../common/services/email.service';
import { MatchingModule } from '../matching/matching.module';
import { ListingsModule } from '../listings/listings.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminEmailService } from './admin-email.service';

@Module({
  imports: [MatchingModule, ListingsModule],
  controllers: [AdminController],
  providers: [AdminGuard, PrismaService, ReliabilityService, PushService, UploadService, AdminService, SystemSettingsService, EmailService, AdminEmailService],
  exports: [SystemSettingsService],
})
export class AdminModule {}
