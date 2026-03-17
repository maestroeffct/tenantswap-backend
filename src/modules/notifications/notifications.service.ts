import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
