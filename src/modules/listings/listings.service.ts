import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma.service';
import { UploadService } from '../../common/services/upload.service';
import { EventsService } from '../events/events.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationService } from '../matching/notification.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { VerifyListingDto } from './dto/verify-listing.dto';

// Document-based seeker categories that require admin review
const DOCUMENT_SEEKER_CATEGORIES = ['NYSC', 'WORK', 'SCHOOL'] as const;

@Injectable()
export class ListingsService {
  private readonly listingActiveTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly matchingService: MatchingService,
    private readonly eventsService: EventsService,
    private readonly uploadService: UploadService,
    private readonly notificationService: NotificationService,
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
              id: { in: targetListingIds },
              status: 'ACTIVE',
              listingType: 'SWAP',       // seekers can never be a match target
              currentAvailable: true,
              OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
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
    listingType?: string;
    currentAvailable: boolean;
    userId?: string;
  }) {
    if (listing.status !== 'ACTIVE') {
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

    // For SWAP listings, also require currentAvailable
    if (listing.listingType !== 'SEEKING' && !listing.currentAvailable) {
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

  async createListing(userId: string, dto: CreateListingDto) {
    const listingType = dto.listingType ?? 'SWAP';
    const isSeeking = listingType === 'SEEKING';

    const currentAvailable = isSeeking ? false : (dto.currentAvailable ?? false);
    const currentAvailableOn = isSeeking
      ? null
      : this.mapCurrentAvailableOn(currentAvailable, dto.currentAvailableOn);

    // Determine initial status and verification state
    const needsDocumentVerification =
      isSeeking &&
      dto.seekerCategory &&
      (DOCUMENT_SEEKER_CATEGORIES as readonly string[]).includes(dto.seekerCategory);

    const initialStatus = needsDocumentVerification ? 'DRAFT' : 'ACTIVE';
    const verificationStatus = isSeeking
      ? needsDocumentVerification
        ? 'PENDING'
        : 'NOT_REQUIRED'
      : null;

    const listingResult = await this.prisma.$transaction(async (tx) => {
      const createdListing = await tx.swapListing.create({
        data: {
          userId,
          listingType,
          seekerCategory: dto.seekerCategory ?? null,
          verificationStatus,
          desiredType: dto.desiredType,
          desiredState: dto.desiredState,
          desiredCity: dto.desiredCity,
          desiredArea: this.normalizeNullableString(dto.desiredArea),
          maxBudget: dto.maxBudget,
          timeline: dto.timeline,
          currentType: isSeeking ? '' : (dto.currentType ?? ''),
          currentState: isSeeking ? '' : (dto.currentState ?? ''),
          currentCity: isSeeking ? '' : (dto.currentCity ?? ''),
          currentArea: isSeeking ? null : this.normalizeNullableString(dto.currentArea),
          currentRent: isSeeking ? 0 : (dto.currentRent ?? 0),
          currentAvailable,
          currentAvailableOn,
          features: isSeeking ? [] : (dto.features ?? []),
          status: initialStatus,
          expiresAt: needsDocumentVerification ? null : this.computeListingExpiresAt(),
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { onboardingComplete: true },
      });

      return { listing: createdListing };
    });

    // Only run matching for listings that are immediately active
    if (!needsDocumentVerification) {
      await this.refreshMatchesForListing({
        id: listingResult.listing.id,
        status: listingResult.listing.status,
        listingType,
        currentAvailable: listingResult.listing.currentAvailable,
        userId,
      });
      this.emitListingEvents(userId, listingResult.listing.id, 'listing_created');
    }

    return {
      message: 'Listing created successfully',
      listing: await this.attachMatchesToListing(listingResult.listing),
    };
  }

  async updateListing(userId: string, listingId: string, dto: UpdateListingDto) {
    const listing = await this.prisma.swapListing.findFirst({
      where: { id: listingId, userId },
      select: { id: true, status: true, listingType: true },
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

    const updatedListing = await this.prisma.swapListing.update({
      where: { id: listingId },
      data,
    });

    await this.refreshMatchesForListing({
      id: updatedListing.id,
      status: updatedListing.status,
      listingType: updatedListing.listingType,
      currentAvailable: updatedListing.currentAvailable,
      userId,
    });
    this.emitListingEvents(userId, updatedListing.id, 'listing_updated');

    return {
      message: 'Listing updated successfully',
      listing: await this.attachMatchesToListing(updatedListing),
    };
  }

  async renewListing(userId: string, listingId: string) {
    const listing = await this.prisma.swapListing.findFirst({
      where: { id: listingId, userId },
      select: { id: true, status: true, listingType: true },
    });

    if (!listing) {
      throw new BadRequestException('Listing not found');
    }

    if (listing.status === 'MATCHED') {
      throw new BadRequestException('Matched listings cannot be renewed');
    }

    const expiresAt = this.computeListingExpiresAt();

    const renewed = await this.prisma.swapListing.update({
      where: { id: listingId },
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
      listingType: renewed.listingType,
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

  async uploadVerificationDoc(userId: string, listingId: string, buffer: Buffer) {
    const listing = await this.prisma.swapListing.findFirst({
      where: { id: listingId, userId },
      select: { id: true, listingType: true, verificationStatus: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.listingType !== 'SEEKING') {
      throw new BadRequestException('Only seeker listings require verification documents');
    }

    if (listing.verificationStatus !== 'PENDING') {
      throw new BadRequestException('This listing does not require a document upload');
    }

    const url = await this.uploadService.uploadVerificationDocument(buffer, listingId);

    const updated = await this.prisma.swapListing.update({
      where: { id: listingId },
      data: { verificationDocumentUrl: url },
    });

    return {
      message: 'Document uploaded successfully. Your listing is under review.',
      listing: updated,
    };
  }

  async verifyListing(_adminUserId: string, listingId: string, dto: VerifyListingDto) {
    const listing = await this.prisma.swapListing.findFirst({
      where: { id: listingId },
      select: {
        id: true,
        userId: true,
        listingType: true,
        verificationStatus: true,
        user: { select: { fullName: true } },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.listingType !== 'SEEKING') {
      throw new BadRequestException('Only seeker listings can be verified');
    }

    if (listing.verificationStatus !== 'PENDING') {
      throw new BadRequestException('Listing is not pending verification');
    }

    if (dto.action === 'APPROVE') {
      const approved = await this.prisma.swapListing.update({
        where: { id: listingId },
        data: {
          verificationStatus: 'APPROVED',
          verificationNote: null,
          status: 'ACTIVE',
          expiresAt: this.computeListingExpiresAt(),
        },
      });

      await this.refreshMatchesForListing({
        id: approved.id,
        status: approved.status,
        listingType: approved.listingType,
        currentAvailable: approved.currentAvailable,
        userId: listing.userId,
      });

      await this.notificationService.notifyMany([{
        userId: listing.userId,
        type: 'VERIFICATION_APPROVED',
        title: 'Listing Approved',
        message: 'Your listing has been verified. You can now connect with matches.',
        channels: ['IN_APP', 'EMAIL', 'SMS'],
        payload: { listingId },
      }]);

      this.emitListingEvents(listing.userId, listingId, 'verification_approved');

      return { message: 'Listing approved', listing: approved };
    }

    // REJECT
    const rejected = await this.prisma.swapListing.update({
      where: { id: listingId },
      data: {
        verificationStatus: 'REJECTED',
        verificationNote: dto.rejectionNote ?? null,
        status: 'DRAFT',
      },
    });

    await this.notificationService.notifyMany([{
      userId: listing.userId,
      type: 'VERIFICATION_REJECTED',
      title: 'Listing Not Approved',
      message: dto.rejectionNote
        ? `Your listing was not approved: ${dto.rejectionNote}`
        : 'Your listing was not approved. Please re-submit with a valid document.',
      channels: ['IN_APP', 'EMAIL', 'SMS'],
      payload: { listingId, rejectionNote: dto.rejectionNote },
    }]);

    return { message: 'Listing rejected', listing: rejected };
  }

  async getOverviewStats() {
    const [totalUsers, listingsByStatus, pendingVerifications, viewAgg, demandByCity] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.swapListing.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.swapListing.count({
        where: { listingType: 'SEEKING', verificationStatus: 'PENDING' },
      }),
      this.prisma.swapListing.aggregate({ _sum: { viewCount: true } }),
      this.prisma.swapListing.groupBy({
        by: ['desiredCity'],
        where: { status: 'ACTIVE', desiredCity: { not: '' } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),
    ]);

    const byStatus = Object.fromEntries(
      ['DRAFT', 'ACTIVE', 'MATCHED', 'CLOSED', 'EXPIRED'].map((s) => [s, 0])
    ) as Record<string, number>;

    for (const row of listingsByStatus) {
      byStatus[row.status] = row._count.id;
    }

    const totalListings = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return {
      totalUsers,
      totalListings,
      activeListings: byStatus['ACTIVE'],
      matchedListings: byStatus['MATCHED'],
      pendingVerifications,
      listingsByStatus: byStatus,
      totalViews: viewAgg._sum.viewCount ?? 0,
      topCities: demandByCity.map((r) => ({ city: r.desiredCity, count: r._count.id })),
    };
  }

  async getPendingVerifications() {
    const rows = await this.prisma.swapListing.findMany({
      where: {
        listingType: 'SEEKING',
        verificationStatus: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        seekerCategory: true,
        verificationStatus: true,
        verificationDocumentUrl: true,
        desiredType: true,
        desiredState: true,
        desiredCity: true,
        desiredArea: true,
        maxBudget: true,
        timeline: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    return rows.map((r) => ({ ...r, listingId: r.id }));
  }

  async getNearMisses(listingId: string): Promise<{
    id: string;
    currentType: string;
    currentCity: string;
    currentState: string;
    currentRent: number;
    desiredType: string;
    missReason: 'wrong_type' | 'over_budget' | 'not_available';
  }[]> {
    const listing = await this.prisma.swapListing.findUnique({
      where: { id: listingId },
      select: {
        desiredState: true,
        desiredType: true,
        maxBudget: true,
        listingType: true,
        status: true,
      },
    });

    if (!listing || listing.status !== 'ACTIVE') return [];
    // Seekers with no apartment can't have near-misses in the SWAP sense
    if (listing.listingType === 'SEEKING') return [];

    const now = new Date();
    const budgetCeiling = Math.round(listing.maxBudget * 1.3); // within 30% over budget

    const candidates = await this.prisma.swapListing.findMany({
      where: {
        id: { not: listingId },
        status: 'ACTIVE',
        listingType: 'SWAP',
        currentState: { equals: listing.desiredState, mode: 'insensitive' },
        currentRent: { lte: budgetCeiling },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        AND: [
          {
            OR: [
              { currentAvailableOn: null },
              { currentAvailableOn: { gte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        currentType: true,
        currentCity: true,
        currentState: true,
        currentRent: true,
        currentAvailable: true,
        desiredType: true,
        maxBudget: true,
      },
      take: 5,
      orderBy: { currentRent: 'asc' },
    });

    const desiredNorm = listing.desiredType.trim().toLowerCase();
    const results: {
      id: string;
      currentType: string;
      currentCity: string;
      currentState: string;
      currentRent: number;
      desiredType: string;
      missReason: 'wrong_type' | 'over_budget' | 'not_available';
    }[] = [];

    for (const c of candidates) {
      const typeMatch = c.currentType.trim().toLowerCase() === desiredNorm ||
        c.currentType.trim().toLowerCase().includes(desiredNorm) ||
        desiredNorm.includes(c.currentType.trim().toLowerCase());
      const withinBudget = c.currentRent <= listing.maxBudget;
      const isAvailable = c.currentAvailable;

      // Must fail at least one criterion to be a near-miss (not a full match)
      if (typeMatch && withinBudget && isAvailable) continue;

      // Determine the primary miss reason
      let missReason: 'wrong_type' | 'over_budget' | 'not_available';
      if (!typeMatch) missReason = 'wrong_type';
      else if (!withinBudget) missReason = 'over_budget';
      else missReason = 'not_available';

      results.push({
        id: c.id,
        currentType: c.currentType,
        currentCity: c.currentCity,
        currentState: c.currentState,
        currentRent: c.currentRent,
        desiredType: c.desiredType,
        missReason,
      });

      if (results.length >= 3) break;
    }

    return results;
  }

  async getMyListings(userId: string) {
    const listings = await this.prisma.swapListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return this.attachMatchesToListings(listings);
  }

  async trackView(listingId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "SwapListing"
      SET "viewCount" = "viewCount" + 1
      WHERE id = ${listingId} AND status = 'ACTIVE'
    `;
  }

  async getDemandByCity(city: string): Promise<{ count: number }> {
    const count = await this.prisma.swapListing.count({
      where: {
        status: 'ACTIVE',
        desiredCity: { equals: city, mode: 'insensitive' },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
    });
    return { count };
  }
}
