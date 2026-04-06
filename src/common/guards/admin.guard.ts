import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import type { CurrentUserPayload } from '../decorators/current-user.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserPayload }>();

    if (!request.user) {
      throw new ForbiddenException('Admin access required');
    }

    const adminRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'MODERATOR', 'SUPPORT']);
    if (!adminRoles.has(request.user.role)) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
