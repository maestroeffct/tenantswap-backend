import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { ReliabilityService } from '../../common/services/reliability.service';

@Controller('users')
export class UsersController {
  constructor(private readonly reliabilityService: ReliabilityService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return {
      message: 'User profile fetched successfully',
      user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/reliability')
  getMyReliability(@CurrentUser() user: CurrentUserPayload) {
    return this.reliabilityService.getStatus(user.id);
  }
}
