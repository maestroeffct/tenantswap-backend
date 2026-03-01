import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { CurrentUserPayload } from '../decorators/current-user.decorator';
import { ReliabilityService } from '../services/reliability.service';

@Injectable()
export class ReliabilityGuard implements CanActivate {
  constructor(private readonly reliabilityService: ReliabilityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserPayload }>();

    if (!request.user) {
      throw new UnauthorizedException('Invalid user context');
    }

    if (request.user.role === 'ADMIN') {
      return true;
    }

    const restriction = await this.reliabilityService.getRestrictionState(
      request.user.id,
    );

    if (restriction.blocked) {
      throw new HttpException(
        {
          message: 'Your account is temporarily blocked due to reliability rules',
          meta: {
            blockedUntil: restriction.blockedUntil,
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (restriction.cooldown) {
      throw new HttpException(
        {
          message: 'You are in cooldown due to repeated cancellations',
          meta: {
            cooldownUntil: restriction.cooldownUntil,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
