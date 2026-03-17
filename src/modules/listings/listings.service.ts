import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';


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

  private async attachMatchesToListing<T extends { id: string }>(listing: T) {
    const matchCandidates = await this.prisma.matchCandidate.findMany({
      where: { fromListingId: listing.id },
      orderBy: [{ totalScore: 'desc' }, { createdAt: 'desc' }],
    });

    const targetListingIds = matchCandidates.map(
      (candidate) => candidate.toListingId,
    );

    const targetListings =
      targetListingIds.length === 0
        ? []
        : await this.prisma.swapListing.findMany({
            where: {
              id: {
                in: targetListingIds,
              },
            },
            select: {
              id: true,
              userId: true,
              status: true,
              desiredType: true,
              desiredCity: true,
              maxBudget: true,
              timeline: true,
              currentType: true,
              currentCity: true,
              currentRent: true,
              currentAvailable: true,
              currentAvailableOn: true,
              features: true,
              createdAt: true,
              expiresAt: true,
            },
          });

    const targetListingById = new Map(
      targetListings.map((targetListing) => [targetListing.id, targetListing] as const),
    );

    const matches = matchCandidates
      .map((candidate) => {
        const targetListing = targetListingById.get(candidate.toListingId);
        if (!targetListing) {
          return null;
        }

        return {
          id: candidate.id,
          fromListingId: candidate.fromListingId,
          toListingId: candidate.toListingId,
          cityScore: candidate.cityScore,
          typeScore: candidate.typeScore,
          budgetScore: candidate.budgetScore,
          timelineScore: candidate.timelineScore,
          totalScore: candidate.totalScore,
          createdAt: candidate.createdAt,
          targetListing,
        };
      })
      .filter((match): match is NonNullable<typeof match> => match !== null);

    return {
      ...listing,
      matchCount: matches.length,
      matches,
    };
  }

  private async attachMatchesToListings<T extends { id: string }>(listings: T[]) {
    return Promise.all(
      listings.map((listing) => this.attachMatchesToListing(listing)),
    );
  }

  async createListing(userId: string, dto: CreateListingDto) {
    const listing = await this.prisma.$transaction(async (tx) => {
      const createdListing = await tx.swapListing.create({
        data: {
          userId,
          desiredType: dto.desiredType,
          desiredCity: dto.desiredCity,
          maxBudget: dto.maxBudget,
          timeline: dto.timeline,
          currentType: dto.currentType,
          currentCity: dto.currentCity,
          currentRent: dto.currentRent,
          currentAvailable: dto.currentAvailable,
          currentAvailableOn: new Date(dto.currentAvailableOn),
          features: dto.features,
          status: 'ACTIVE',
          expiresAt: this.computeListingExpiresAt(),
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { onboardingComplete: true },
      });

      return createdListing;
    });

    return {
      message: 'Listing created successfully',
      listing: await this.attachMatchesToListing(listing),
    };
  }

  async updateListing(userId: string, listingId: string, dto: UpdateListingDto) {
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
      throw new BadRequestException('Matched listings cannot be edited');
    }

    const data = {
      ...(dto.desiredType !== undefined ? { desiredType: dto.desiredType } : {}),
      ...(dto.desiredCity !== undefined ? { desiredCity: dto.desiredCity } : {}),
      ...(dto.maxBudget !== undefined ? { maxBudget: dto.maxBudget } : {}),
      ...(dto.timeline !== undefined ? { timeline: dto.timeline } : {}),
      ...(dto.currentType !== undefined ? { currentType: dto.currentType } : {}),
      ...(dto.currentCity !== undefined ? { currentCity: dto.currentCity } : {}),
      ...(dto.currentRent !== undefined ? { currentRent: dto.currentRent } : {}),
      ...(dto.currentAvailable !== undefined
        ? { currentAvailable: dto.currentAvailable }
        : {}),
      ...(dto.currentAvailableOn !== undefined
        ? { currentAvailableOn: new Date(dto.currentAvailableOn) }
        : {}),
      ...(dto.features !== undefined ? { features: dto.features } : {}),
    };

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No listing fields provided for update');
    }

    const updated = await this.prisma.swapListing.update({
      where: {
        id: listingId,
      },
      data,
    });

    return {
      message: 'Listing updated successfully',
      listing: await this.attachMatchesToListing(updated),
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
      listing: await this.attachMatchesToListing(renewed),
    };
  }

  async getMyListings(userId: string) {
    const listings = await this.prisma.swapListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return this.attachMatchesToListings(listings);
  }
}
