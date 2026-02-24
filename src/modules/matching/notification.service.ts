import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';

type NotificationInput = {
  userId: string;
  chainId?: string;
  type: string;
  title: string;
  message: string;
  payload?: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyMany(notifications: NotificationInput[]): Promise<void> {
    if (notifications.length === 0) {
      return;
    }

    await this.prisma.userNotification.createMany({
      data: notifications.map((notification) => ({
        userId: notification.userId,
        chainId: notification.chainId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        payload: notification.payload,
      })),
    });

    for (const notification of notifications) {
      this.logger.log(
        `[NOTIFY] type=${notification.type} userId=${notification.userId} chainId=${notification.chainId ?? 'n/a'} message="${notification.message}"`,
      );
    }
  }
}
