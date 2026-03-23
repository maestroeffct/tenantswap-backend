import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsLifecycleService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsLifecycleService.name);
  private readonly cleanupEnabled: boolean;
  private readonly sweepMs: number;
  private readonly readRetentionHours: number;
  private readonly unreadRetentionHours: number;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.cleanupEnabled =
      this.config.get<boolean>('NOTIFICATION_CLEANUP_ENABLED') ?? true;
    this.sweepMs =
      this.config.get<number>('NOTIFICATION_CLEANUP_SWEEP_MS') ?? 3_600_000;
    this.readRetentionHours =
      this.config.get<number>('NOTIFICATION_RETENTION_READ_HOURS') ?? 12;
    this.unreadRetentionHours =
      this.config.get<number>('NOTIFICATION_RETENTION_UNREAD_HOURS') ?? 168;
  }

  onModuleInit() {
    if (!this.cleanupEnabled) {
      this.logger.log('Notification cleanup disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.runSweep();
    }, this.sweepMs);

    this.logger.log(
      `Notification cleanup enabled sweepMs=${this.sweepMs} readRetentionHours=${this.readRetentionHours} unreadRetentionHours=${this.unreadRetentionHours}`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runSweep() {
    const result = await this.notificationsService.cleanupExpiredNotifications({
      readRetentionHours: this.readRetentionHours,
      unreadRetentionHours: this.unreadRetentionHours,
    });

    if (result.deletedReadCount > 0 || result.deletedUnreadCount > 0) {
      this.logger.warn(
        `[NOTIFICATION_CLEANUP] deletedRead=${result.deletedReadCount} deletedUnread=${result.deletedUnreadCount} readRetentionHours=${this.readRetentionHours} unreadRetentionHours=${this.unreadRetentionHours}`,
      );
    }
  }
}
