import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listNotifications(userId: string, limit = 20) {
    const notifications = await this.prisma.userNotification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.max(1, Math.min(limit, 50)),
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    });

    return {
      message: 'Notifications fetched successfully',
      notifications,
    };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await this.prisma.userNotification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return {
      message: 'Unread notification count fetched successfully',
      unreadCount,
    };
  }


  async cleanupExpiredNotifications(input: {
    readRetentionHours: number;
    unreadRetentionHours: number;
  }) {
    const now = Date.now();
    const readCutoff = new Date(now - input.readRetentionHours * 60 * 60 * 1000);
    const unreadCutoff = new Date(
      now - input.unreadRetentionHours * 60 * 60 * 1000,
    );

    const [readResult, unreadResult] = await Promise.all([
      this.prisma.userNotification.deleteMany({
        where: {
          readAt: {
            lt: readCutoff,
          },
        },
      }),
      this.prisma.userNotification.deleteMany({
        where: {
          readAt: null,
          createdAt: {
            lt: unreadCutoff,
          },
        },
      }),
    ]);

    return {
      deletedReadCount: readResult.count,
      deletedUnreadCount: unreadResult.count,
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.userNotification.updateMany({
      where: {
        id: notificationId,
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      message: notification.count > 0 ? 'Notification marked as read' : 'Notification already marked as read',
    };
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.userNotification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      message: 'Notifications marked as read',
      updatedCount: result.count,
    };
  }
}
