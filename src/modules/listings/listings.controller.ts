import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingsService } from './listings.service';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @UseGuards(JwtAuthGuard, SubscriptionGuard, ReliabilityGuard)
  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateListingDto,
  ) {
    return this.listingsService.createListing(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, SubscriptionGuard, ReliabilityGuard)
  @Post(':listingId/renew')
  renew(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
  ) {
    return this.listingsService.renewListing(user.id, listingId);
  }

  @UseGuards(JwtAuthGuard, SubscriptionGuard, ReliabilityGuard)
  @Get('me')
  getMine(@CurrentUser() user: CurrentUserPayload) {
    return this.listingsService.getMyListings(user.id);
  }
}
