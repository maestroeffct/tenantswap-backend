import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { MatchingService } from '../matching/matching.service';
import { BreakChainDto } from './dto/break-chain.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('chains/expire-overdue')
  expireOverdueChains(@CurrentUser() user: CurrentUserPayload) {
    return this.matchingService.expirePendingChains('ADMIN_SWEEP', user.id);
  }

  @Post('chains/:chainId/break')
  breakChain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
    @Body() dto: BreakChainDto,
  ) {
    return this.matchingService.breakChainByAdmin(
      chainId,
      user.id,
      dto.reason ?? 'ADMIN_FORCE',
    );
  }

  @Post('chains/:chainId/expire')
  expireChain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.breakChainByAdmin(chainId, user.id, 'EXPIRED');
  }

  @Post('chains/:chainId/rerun')
  rerunChain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.rerunChainMembersByAdmin(chainId, user.id);
  }
}
