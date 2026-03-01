import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { SubscriptionStatus } from '@prisma/client';
import type { Request } from 'express';

export type CurrentUserPayload = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: 'USER' | 'ADMIN';
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: Date | null;
  reliabilityScore: number;
  cancellationCount: number;
  noShowCount: number;
  cooldownUntil: Date | null;
  blockedUntil: Date | null;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserPayload }>();

    if (!request.user || typeof request.user.id !== 'string') {
      throw new UnauthorizedException('Invalid user context');
    }

    return request.user;
  },
);
