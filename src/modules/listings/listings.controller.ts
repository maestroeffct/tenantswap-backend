import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
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
  @Patch(':listingId')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingsService.updateListing(user.id, listingId, dto);
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

  @UseGuards(JwtAuthGuard)
  @Post(':listingId/view')
  trackView(@Param('listingId') listingId: string) {
    return this.listingsService.trackView(listingId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':listingId/near-misses')
  getNearMisses(@Param('listingId') listingId: string) {
    return this.listingsService.getNearMisses(listingId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('demand')
  getDemand(@Query('city') city: string) {
    if (!city) throw new BadRequestException('city is required');
    return this.listingsService.getDemandByCity(city);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':listingId/verification-document')
  @UseInterceptors(
    FileInterceptor('document', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/^(image\/(jpeg|png)|application\/pdf)$/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, or PDF files are allowed'), false);
        }
      },
    }),
  )
  async uploadVerificationDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No document provided');
    return this.listingsService.uploadVerificationDoc(user.id, listingId, file.buffer);
  }
}
