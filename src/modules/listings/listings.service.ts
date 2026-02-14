import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

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
      },
    });

    return {
      message: 'Listing created successfully',
      listing,
    };
  }

  async getMyListings(userId: string) {
    return this.prisma.swapListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
