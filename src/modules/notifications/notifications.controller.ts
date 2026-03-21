import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  listNotifications(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;

    return this.notificationsService.listNotifications(
      user.id,
      parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('read-all')
  markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':notificationId/read')
  markAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(user.id, notificationId);
  }
}
