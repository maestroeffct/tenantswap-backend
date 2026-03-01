import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';

@Injectable()
export class ListingsService {
  private readonly listingActiveTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.listingActiveTtlHours =
      this.config.get<number>('LISTING_ACTIVE_TTL_HOURS') ?? 336;
  }

  private computeListingExpiresAt(from = new Date()) {
    const durationMs = this.listingActiveTtlHours * 60 * 60 * 1000;
    return new Date(from.getTime() + durationMs);
  }

  async createListing(userId: string, dto: CreateListingDto) {
    const listing = await this.prisma.swapListing.create({
      data: {
        userId,
        desiredType: dto.desiredType,
        desiredCity: dto.desiredCity,
        maxBudget: dto.maxBudget,
        timeline: dto.timeline,
        currentType: dto.currentType,
        currentCity: dto.currentCity,
        currentRent: dto.currentRent,
        availableOn: new Date(dto.availableOn),
        features: dto.features,
        status: 'ACTIVE',
        expiresAt: this.computeListingExpiresAt(),
      },
    });

    return {
      message: 'Listing created successfully',
      listing,
    };
  }

  async renewListing(userId: string, listingId: string) {
    const listing = await this.prisma.swapListing.findFirst({
      where: {
        id: listingId,
        userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!listing) {
      throw new BadRequestException('Listing not found');
    }

    if (listing.status === 'MATCHED') {
      throw new BadRequestException('Matched listings cannot be renewed');
    }

    const expiresAt = this.computeListingExpiresAt();

    const renewed = await this.prisma.swapListing.update({
      where: {
        id: listingId,
      },
      data: {
        status: 'ACTIVE',
        expiresAt,
        closedAt: null,
        closeReason: null,
        closedByUserId: null,
      },
    });

    return {
      success: true,
      message: 'Listing renewed successfully',
      listing: renewed,
    };
  }

  async getMyListings(userId: string) {
    return this.prisma.swapListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
