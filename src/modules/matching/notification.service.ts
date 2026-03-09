import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { TermiiService } from '../../common/services/termii.service';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';

type NotificationInput = {
  userId: string;
  chainId?: string;
  type: string;
  title: string;
  message: string;
  payload?: Prisma.InputJsonValue;
  channels?: NotificationChannel[];
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly emailEnabled: boolean;
  private readonly smsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly termiiService: TermiiService,
    private readonly config: ConfigService,
  ) {
    this.emailEnabled =
      this.config.get<boolean>('NOTIFICATION_EMAIL_ENABLED') ?? true;
    this.smsEnabled =
      this.config.get<boolean>('NOTIFICATION_SMS_ENABLED') ?? true;
  }

  async notifyMany(notifications: NotificationInput[]): Promise<void> {
    if (notifications.length === 0) {
      return;
    }

    const normalized = notifications.map((notification) => ({
      ...notification,
      channels: this.resolveChannels(notification.channels),
    }));

    const inAppNotifications = normalized.filter((notification) =>
      notification.channels.includes('IN_APP'),
    );

    if (inAppNotifications.length > 0) {
      await this.prisma.userNotification.createMany({
        data: inAppNotifications.map((notification) => ({
          userId: notification.userId,
          chainId: notification.chainId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          payload: notification.payload,
        })),
      });
    }

    for (const notification of normalized) {
      this.logger.log(
        `[NOTIFY] type=${notification.type} userId=${notification.userId} chainId=${notification.chainId ?? 'n/a'} channels=${notification.channels.join(',')} message="${notification.message}"`,
      );
    }

    const shouldSendEmail =
      this.emailEnabled &&
      normalized.some((notification) =>
        notification.channels.includes('EMAIL'),
      );
    const shouldSendSms =
      this.smsEnabled &&
      normalized.some((notification) => notification.channels.includes('SMS'));

    if (!shouldSendEmail && !shouldSendSms) {
      return;
    }

    const targetUserIds = [
      ...new Set(
        normalized
          .filter(
            (notification) =>
              (shouldSendEmail && notification.channels.includes('EMAIL')) ||
              (shouldSendSms && notification.channels.includes('SMS')),
          )
          .map((notification) => notification.userId),
      ),
    ];

    if (targetUserIds.length === 0) {
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: targetUserIds,
        },
      },
      select: {
        id: true,
        email: true,
        phone: true,
      },
    });

    const userById = new Map(users.map((user) => [user.id, user] as const));
    const deliveryTasks: Promise<void>[] = [];

    for (const notification of normalized) {
      const user = userById.get(notification.userId);
      if (!user) {
        continue;
      }

      if (
        shouldSendEmail &&
        notification.channels.includes('EMAIL') &&
        user.email
      ) {
        deliveryTasks.push(
          this.dispatchEmail(user.email, {
            type: notification.type,
            title: notification.title,
            message: notification.message,
            userId: notification.userId,
          }),
        );
      }

      if (
        shouldSendSms &&
        notification.channels.includes('SMS') &&
        user.phone
      ) {
        deliveryTasks.push(
          this.dispatchSms(user.phone, {
            type: notification.type,
            title: notification.title,
            message: notification.message,
            userId: notification.userId,
          }),
        );
      }
    }

    if (deliveryTasks.length > 0) {
      await Promise.allSettled(deliveryTasks);
    }
  }

  private resolveChannels(
    channels?: NotificationChannel[],
  ): NotificationChannel[] {
    if (!channels || channels.length === 0) {
      return ['IN_APP'];
    }

    return [...new Set(channels)];
  }

  private async dispatchEmail(
    email: string,
    input: {
      type: string;
      title: string;
      message: string;
      userId: string;
    },
  ): Promise<void> {
    const result = await this.emailService.sendSystemEmail({
      email,
      subject: `TenantSwap: ${input.title}`,
      title: input.title,
      message: input.message,
    });

    this.logger.log(
      `[NOTIFY_EMAIL] type=${input.type} userId=${input.userId} email=${email} delivered=${result.delivered} provider=${result.provider}`,
    );
  }

  private async dispatchSms(
    phone: string,
    input: {
      type: string;
      title: string;
      message: string;
      userId: string;
    },
  ): Promise<void> {
    const smsText = `TenantSwap: ${input.message}`;

    const result = await this.termiiService.sendSms({
      to: phone,
      text: smsText.slice(0, 320),
    });

    this.logger.log(
      `[NOTIFY_SMS] type=${input.type} userId=${input.userId} phone=${phone} delivered=${result.delivered} status=${result.providerStatus}`,
    );
  }
}
