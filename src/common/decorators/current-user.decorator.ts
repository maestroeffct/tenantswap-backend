import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export type CurrentUserPayload = {
  id: string;
  fullName: string;
  phone: string;
  role: 'USER' | 'ADMIN';
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
