import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma.service';
import { EventsService } from '../events/events.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationService } from '../matching/notification.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

@Injectable()
export class ListingsService {
  private readonly listingActiveTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly matchingService: MatchingService,
    private readonly notificationService: NotificationService,
    private readonly eventsService: EventsService,
  ) {
    this.listingActiveTtlHours =
      this.config.get<number>('LISTING_ACTIVE_TTL_HOURS') ?? 336;
  }

  private computeListingExpiresAt(from = new Date()) {
    const durationMs = this.listingActiveTtlHours * 60 * 60 * 1000;
    return new Date(from.getTime() + durationMs);
  }

  private normalizeNullableString(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private mapCurrentAvailableOn(
    currentAvailable: boolean,
    currentAvailableOn?: string | null,
  ) {
    if (!currentAvailable || !currentAvailableOn) {
      return null;
    }

    return new Date(currentAvailableOn);
  }


  private emitListingEvents(userId: string, listingId: string, reason: string) {
    this.eventsService.emitToUser(userId, 'matches.updated', {
      listingId,
      reason,
      emittedAt: new Date().toISOString(),
    });
    this.eventsService.emitToUser(userId, 'user.refresh', {
      reason,
      listingId,
      emittedAt: new Date().toISOString(),
    });
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
              desiredState: true,
              desiredCity: true,
              desiredArea: true,
              maxBudget: true,
              timeline: true,
              currentType: true,
              currentState: true,
              currentCity: true,
              currentArea: true,
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

  private async refreshMatchesForListing(listing: {
    id: string;
    status: string;
    currentAvailable: boolean;
    userId?: string;
  }) {
    if (listing.status !== 'ACTIVE' || !listing.currentAvailable) {
      await this.prisma.matchCandidate.deleteMany({
        where: {
          OR: [{ fromListingId: listing.id }, { toListingId: listing.id }],
        },
      });
      if (listing.userId) {
        this.emitListingEvents(listing.userId, listing.id, 'listing_unavailable');
      }
      return null;
    }

    return this.matchingService.runForListing(listing.id, listing.userId, {
      skipExpireSweep: true,
    });
  }

  private async notifyVacancyAlertRecipients(input: {
    userId: string;
    listingId: string;
    vacancyAlertId: string;
    apartmentType: string;
    state: string;
    city: string;
    area: string | null;
    features: string[];
  }) {
    const desiredLocationFilter = input.area
      ? {
          desiredState: input.state,
          desiredCity: input.city,
          desiredArea: input.area,
        }
      : {
          desiredState: input.state,
          desiredCity: input.city,
        };

    const currentLocationFilter = input.area
      ? {
          currentState: input.state,
          currentCity: input.city,
          currentArea: input.area,
        }
      : {
          currentState: input.state,
          currentCity: input.city,
        };

    const matchingListings = await this.prisma.swapListing.findMany({
      where: {
        status: 'ACTIVE',
        userId: { not: input.userId },
        OR: [desiredLocationFilter, currentLocationFilter],
      },
      select: {
        userId: true,
      },
      distinct: ['userId'],
    });

    if (matchingListings.length === 0) {
      return;
    }

    const locationLabel = input.area ?? input.city;
    await this.notificationService.notifyMany(
      matchingListings.map((listing) => ({
        userId: listing.userId,
        type: 'VACANCY_ALERT_SHARED',
        title: `Possible vacancy in ${locationLabel}`,
        message: `A tenant in ${locationLabel} just reported a possible ${input.apartmentType} vacancy.`,
        payload: {
          vacancyAlertId: input.vacancyAlertId,
          listingId: input.listingId,
          apartmentType: input.apartmentType,
          state: input.state,
          city: input.city,
          area: input.area,
          features: input.features,
        },
        channels: ['IN_APP'],
      })),
    );
  }

  async createListing(userId: string, dto: CreateListingDto) {
    const currentAvailableOn = this.mapCurrentAvailableOn(
      dto.currentAvailable,
      dto.currentAvailableOn,
    );

    const listingResult = await this.prisma.$transaction(async (tx) => {
      const createdListing = await tx.swapListing.create({
        data: {
          userId,
          desiredType: dto.desiredType,
          desiredState: dto.desiredState,
          desiredCity: dto.desiredCity,
          desiredArea: this.normalizeNullableString(dto.desiredArea),
          maxBudget: dto.maxBudget,
          timeline: dto.timeline,
          currentType: dto.currentType,
          currentState: dto.currentState,
          currentCity: dto.currentCity,
          currentArea: this.normalizeNullableString(dto.currentArea),
          currentRent: dto.currentRent,
          currentAvailable: dto.currentAvailable,
          currentAvailableOn,
          features: dto.features,
          status: 'ACTIVE',
          expiresAt: this.computeListingExpiresAt(),
        },
      });

      const createdVacancyAlert = dto.vacancyAlert
        ? await tx.vacancyAlert.create({
            data: {
              userId,
              listingId: createdListing.id,
              apartmentType: dto.vacancyAlert.apartmentType,
              state: dto.vacancyAlert.state,
              city: dto.vacancyAlert.city,
              area: this.normalizeNullableString(dto.vacancyAlert.area),
              features: dto.vacancyAlert.features,
            },
          })
        : null;

      await tx.user.update({
        where: { id: userId },
        data: { onboardingComplete: true },
      });

      return {
        listing: createdListing,
        vacancyAlert: createdVacancyAlert,
      };
    });

    await this.refreshMatchesForListing(listingResult.listing);
    this.emitListingEvents(userId, listingResult.listing.id, 'listing_created');

    if (listingResult.vacancyAlert) {
      await this.notifyVacancyAlertRecipients({
        userId,
        listingId: listingResult.listing.id,
        vacancyAlertId: listingResult.vacancyAlert.id,
        apartmentType: listingResult.vacancyAlert.apartmentType,
        state: listingResult.vacancyAlert.state,
        city: listingResult.vacancyAlert.city,
        area: listingResult.vacancyAlert.area,
        features: listingResult.vacancyAlert.features,
      });
    }

    return {
      message: 'Listing created successfully',
      listing: await this.attachMatchesToListing(listingResult.listing),
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
      ...(dto.desiredState !== undefined ? { desiredState: dto.desiredState } : {}),
      ...(dto.desiredCity !== undefined ? { desiredCity: dto.desiredCity } : {}),
      ...(dto.desiredArea !== undefined
        ? { desiredArea: this.normalizeNullableString(dto.desiredArea) }
        : {}),
      ...(dto.maxBudget !== undefined ? { maxBudget: dto.maxBudget } : {}),
      ...(dto.timeline !== undefined ? { timeline: dto.timeline } : {}),
      ...(dto.currentType !== undefined ? { currentType: dto.currentType } : {}),
      ...(dto.currentState !== undefined ? { currentState: dto.currentState } : {}),
      ...(dto.currentCity !== undefined ? { currentCity: dto.currentCity } : {}),
      ...(dto.currentArea !== undefined
        ? { currentArea: this.normalizeNullableString(dto.currentArea) }
        : {}),
      ...(dto.currentRent !== undefined ? { currentRent: dto.currentRent } : {}),
      ...(dto.currentAvailable !== undefined
        ? { currentAvailable: dto.currentAvailable }
        : {}),
      ...(dto.currentAvailable === false ? { currentAvailableOn: null } : {}),
      ...(dto.currentAvailableOn !== undefined && dto.currentAvailable !== false
        ? {
            currentAvailableOn: dto.currentAvailableOn
              ? new Date(dto.currentAvailableOn)
              : null,
          }
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

    await this.refreshMatchesForListing({
      id: updated.id,
      status: updated.status,
      currentAvailable: updated.currentAvailable,
      userId,
    });
    this.emitListingEvents(userId, updated.id, 'listing_updated');

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

    await this.refreshMatchesForListing({
      id: renewed.id,
      status: renewed.status,
      currentAvailable: renewed.currentAvailable,
      userId,
    });
    this.emitListingEvents(userId, renewed.id, 'listing_renewed');

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
