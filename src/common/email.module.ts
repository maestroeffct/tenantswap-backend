import { Global, Module } from '@nestjs/common';

import { EmailQueueService } from './services/email-queue.service';
import { EmailService } from './services/email.service';

@Global()
@Module({
  providers: [EmailService, EmailQueueService],
  exports: [EmailService, EmailQueueService],
})
export class EmailModule {}
