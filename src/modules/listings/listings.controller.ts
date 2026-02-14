import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { CreateListingDto } from './dto/create-listing.dto';

@Controller('listings')
export class ListingsController {
  constructor(private listingsService: ListingsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateListingDto,
  ) {
    return this.listingsService.createListing(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMine(@CurrentUser() user: CurrentUserPayload) {
    return this.listingsService.getMyListings(user.id);
  }
}
