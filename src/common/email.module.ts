import { Global, Module } from '@nestjs/common';

import { EmailQueueService } from './services/email-queue.service';
import { EmailService } from './services/email.service';
import { PushService } from './services/push.service';

@Global()
@Module({
  providers: [EmailService, EmailQueueService, PushService],
  exports: [EmailService, EmailQueueService, PushService],
})
export class EmailModule {}
