import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { RequestInterestDto } from './dto/request-interest.dto';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('run')
  run(@CurrentUser() user: CurrentUserPayload) {
    return this.matchingService.runForUser(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('run/:listingId')
  runForListing(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
  ) {
    return this.matchingService.runForListing(listingId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('interests/:targetListingId/request')
  requestInterest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetListingId') targetListingId: string,
    @Body() dto: RequestInterestDto,
  ) {
    return this.matchingService.requestInterest(
      targetListingId,
      user.id,
      dto.requesterListingId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('interests/incoming')
  incomingInterests(@CurrentUser() user: CurrentUserPayload) {
    return this.matchingService.getIncomingInterests(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('interests/outgoing')
  outgoingInterests(@CurrentUser() user: CurrentUserPayload) {
    return this.matchingService.getOutgoingInterests(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('interests/:interestId/approve')
  approveInterest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('interestId') interestId: string,
  ) {
    return this.matchingService.approveInterest(interestId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('interests/:interestId/decline')
  declineInterest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('interestId') interestId: string,
  ) {
    return this.matchingService.declineInterest(interestId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('interests/:interestId/confirm-renter')
  confirmRenter(
    @CurrentUser() user: CurrentUserPayload,
    @Param('interestId') interestId: string,
  ) {
    return this.matchingService.confirmRenter(interestId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('chains/me')
  myChains(@CurrentUser() user: CurrentUserPayload) {
    return this.matchingService.getMyChains(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('chains/:chainId')
  getDetail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.getChainDetail(chainId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chains/:chainId/accept')
  accept(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.acceptChain(chainId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chains/:chainId/decline')
  decline(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.declineChain(chainId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chains/:chainId/connect')
  requestConnect(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.requestContactUnlock(chainId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect/:unlockId/approve')
  approveConnect(
    @CurrentUser() user: CurrentUserPayload,
    @Param('unlockId') unlockId: string,
  ) {
    return this.matchingService.approveContactUnlock(unlockId, user.id);
  }
}
