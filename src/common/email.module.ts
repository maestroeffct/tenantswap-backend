import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { SystemSettingsService } from './services/system-settings.service';
import { EmailQueueService } from './services/email-queue.service';
import { EmailService } from './services/email.service';
import { EmailShellService } from './services/email-shell.service';
import { PushService } from './services/push.service';

@Global()
@Module({
  providers: [PrismaService, SystemSettingsService, EmailShellService, EmailService, EmailQueueService, PushService],
  exports: [SystemSettingsService, EmailShellService, EmailService, EmailQueueService, PushService],
})
export class EmailModule {}
