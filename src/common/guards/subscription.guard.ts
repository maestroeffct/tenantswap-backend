import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { CurrentUserPayload } from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('00')) {
      return `+${cleaned.slice(2)}`;
    }

    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  private isAllowlisted(email: string | null, phone: string): boolean {
    const allowlist = this.config.get<string[]>('TESTER_ALLOWLIST') ?? [];
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedPhone = this.normalizePhone(phone);

    const set = new Set(allowlist.map((entry) => entry.trim().toLowerCase()));

    return (
      (normalizedEmail ? set.has(normalizedEmail) : false) ||
      set.has(normalizedPhone.toLowerCase())
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enforce = this.config.get<boolean>('SUBSCRIPTION_ENFORCEMENT');
    if (!enforce) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserPayload }>();

    if (!request.user) {
      throw new UnauthorizedException('Invalid user context');
    }

    if (request.user.role === 'ADMIN') {
      return true;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (this.isAllowlisted(user.email, user.phone)) {
      return true;
    }

    const now = new Date();
    const isActive =
      user.subscriptionStatus === 'ACTIVE' &&
      (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > now);

    if (isActive) {
      return true;
    }

    this.logger.warn(
      `[SUBSCRIPTION_BLOCKED] userId=${user.id} status=${user.subscriptionStatus} expiresAt=${
        user.subscriptionExpiresAt?.toISOString() ?? 'null'
      }`,
    );

    throw new HttpException(
      {
        message: 'Subscription required to continue',
        meta: {
          subscriptionStatus: user.subscriptionStatus,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
