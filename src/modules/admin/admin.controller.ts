import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { MatchingService } from '../matching/matching.service';
import { ApplyPenaltyDto } from './dto/apply-penalty.dto';
import { BreakChainDto } from './dto/break-chain.dto';
import { UnblockUserDto } from './dto/unblock-user.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly matchingService: MatchingService,
    private readonly reliabilityService: ReliabilityService,
  ) {}

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
      dto.offenderUserId,
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

  @Get('users/:userId/reliability')
  getUserReliability(@Param('userId') userId: string) {
    return this.reliabilityService.getStatus(userId);
  }

  @Post('users/:userId/penalty')
  applyUserPenalty(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
    @Body() dto: ApplyPenaltyDto,
  ) {
    return this.reliabilityService.applyManualPenalty(user.id, userId, {
      reason: dto.reason,
      scorePenalty: dto.scorePenalty,
      cooldownHours: dto.cooldownHours,
      blockHours: dto.blockHours,
      metadata: dto.metadata,
    });
  }

  @Post('users/:userId/unblock')
  unblockUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
    @Body() dto: UnblockUserDto,
  ) {
    return this.reliabilityService.clearRestrictions(user.id, userId, dto.reason);
  }
}
