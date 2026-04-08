import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { PrismaService } from '../../common/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  private readonly emailVerificationTokenTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.emailVerificationTokenTtlMs =
      this.config.get<number>('EMAIL_VERIFICATION_TOKEN_TTL_MS') ?? 86_400_000;
  }


  async getMe(userId: string) {
    const user = await this.getProfile(userId);

    if (!user) {
      throw new UnauthorizedException('Invalid user context');
    }

    const listings = await this.getListingsWithMatches(userId);

    return {
      message: 'User profile fetched successfully',
      user: {
        ...user,
        listings,
      },
    };
  }

  private async getListingsWithMatches(userId: string) {
    const listings = await this.prisma.swapListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      listings.map((listing) => this.attachMatchesToListing(listing)),
    );
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
              status: 'ACTIVE',
              currentAvailable: true,
              OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
              AND: [
                {
                  OR: [
                    { currentAvailableOn: null },
                    { currentAvailableOn: { gte: new Date() } },
                  ],
                },
              ],
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

    // Near-misses: same state, budget within 30%, fails exactly one criterion
    const nearMisses = await this.computeNearMisses(listing);

    return {
      ...listing,
      matchCount: matches.length,
      matches,
      nearMisses,
    };
  }

  private async computeNearMisses(listing: { id: string; [key: string]: unknown }) {
    const full = await this.prisma.swapListing.findUnique({
      where: { id: listing.id as string },
      select: {
        desiredState: true,
        desiredType: true,
        maxBudget: true,
        listingType: true,
        status: true,
      },
    });

    if (!full || full.status !== 'ACTIVE' || full.listingType === 'SEEKING') return [];

    const now = new Date();
    const budgetCeiling = Math.round(full.maxBudget * 1.3);

    const candidates = await this.prisma.swapListing.findMany({
      where: {
        id: { not: listing.id as string },
        status: 'ACTIVE',
        listingType: 'SWAP',
        currentState: { equals: full.desiredState, mode: 'insensitive' },
        currentRent: { lte: budgetCeiling },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        AND: [{ OR: [{ currentAvailableOn: null }, { currentAvailableOn: { gte: now } }] }],
      },
      select: {
        id: true,
        currentType: true,
        currentCity: true,
        currentState: true,
        currentRent: true,
        currentAvailable: true,
        desiredType: true,
      },
      take: 10,
      orderBy: { currentRent: 'asc' },
    });

    const desiredNorm = full.desiredType.trim().toLowerCase();
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
      const typeMatch =
        c.currentType.trim().toLowerCase() === desiredNorm ||
        c.currentType.trim().toLowerCase().includes(desiredNorm) ||
        desiredNorm.includes(c.currentType.trim().toLowerCase());
      const withinBudget = c.currentRent <= full.maxBudget;
      const isAvailable = c.currentAvailable;

      if (typeMatch && withinBudget && isAvailable) continue;

      let missReason: 'wrong_type' | 'over_budget' | 'not_available';
      if (!typeMatch) missReason = 'wrong_type';
      else if (!withinBudget) missReason = 'over_budget';
      else missReason = 'not_available';

      results.push({ id: c.id, currentType: c.currentType, currentCity: c.currentCity, currentState: c.currentState, currentRent: c.currentRent, desiredType: c.desiredType, missReason });
      if (results.length >= 3) break;
    }

    return results;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        password: true,
        phoneVerifiedAt: true,
        profilePhotoUrl: true,
        gender: true,
        occupation: true,
        allowIncomingCalls: true,
        oauthProvider: true,
        canConnectLandlord: true,
        hasLandlordContact: true,
        onboardingComplete: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user context');
    }

    const nextFullName = dto.fullName?.trim();
    const nextEmail = dto.email ? this.normalizeEmail(dto.email) : undefined;
    const nextPhone = dto.phone ? this.normalizePhone(dto.phone) : undefined;
    const nextProfilePhotoUrl = dto.profilePhotoUrl?.trim();
    const nextGender = dto.gender ? this.mapGender(dto.gender) : undefined;
    const nextOccupation = dto.occupation?.trim();
    const nextAllowIncomingCalls = dto.allowIncomingCalls;
    const nextCanConnectLandlord = dto.canConnectLandlord;
    const nextHasLandlordContact = dto.hasLandlordContact;
    const nextWorkplaceName = dto.workplaceName !== undefined ? (dto.workplaceName?.trim() || null) : undefined;
    const nextWorkplaceArea = dto.workplaceArea !== undefined ? (dto.workplaceArea?.trim() || null) : undefined;
    const nextWorkplaceCity = dto.workplaceCity !== undefined ? (dto.workplaceCity?.trim() || null) : undefined;
    const nextWorkplaceState = dto.workplaceState !== undefined ? (dto.workplaceState?.trim() || null) : undefined;

    const changesEmail =
      nextEmail !== undefined && nextEmail !== (user.email ?? null);
    const changesPhone = nextPhone !== undefined && nextPhone !== user.phone;
    const changesProfilePhotoUrl =
      nextProfilePhotoUrl !== undefined &&
      nextProfilePhotoUrl !== (user.profilePhotoUrl ?? null);
    const changesGender =
      nextGender !== undefined && nextGender !== (user.gender ?? null);
    const changesOccupation =
      nextOccupation !== undefined &&
      nextOccupation !== (user.occupation ?? null);
    const changesAllowIncomingCalls =
      nextAllowIncomingCalls !== undefined &&
      nextAllowIncomingCalls !== user.allowIncomingCalls;
    const changesCanConnectLandlord =
      nextCanConnectLandlord !== undefined &&
      nextCanConnectLandlord !== user.canConnectLandlord;
    const changesHasLandlordContact =
      nextHasLandlordContact !== undefined &&
      nextHasLandlordContact !== user.hasLandlordContact;

    const needsPasswordCheck = changesEmail || changesPhone;

    if (needsPasswordCheck && !dto.currentPassword) {
      throw new BadRequestException(
        'currentPassword is required when updating email or phone',
      );
    }

    if (needsPasswordCheck) {
      const validPassword = await compare(dto.currentPassword!, user.password);
      if (!validPassword) {
        throw new UnauthorizedException('Invalid current password');
      }
    }

    const data: Prisma.UserUpdateInput = {};

    if (nextFullName && nextFullName !== user.fullName) {
      data.fullName = nextFullName;
    }

    if (changesPhone && nextPhone) {
      data.phone = nextPhone;
      data.phoneVerifiedAt = null;
      data.phoneVerificationPinId = null;
      data.phoneVerificationExpiresAt = null;
      data.phoneVerificationAttempts = 0;
      data.phoneVerificationLastSentAt = null;
    }

    if (changesProfilePhotoUrl && nextProfilePhotoUrl !== undefined) {
      data.profilePhotoUrl = nextProfilePhotoUrl || null;
    }

    if (changesGender && nextGender !== undefined) {
      data.gender = nextGender;
    }

    if (changesOccupation && nextOccupation !== undefined) {
      data.occupation = nextOccupation || null;
    }

    if (changesAllowIncomingCalls && nextAllowIncomingCalls !== undefined) {
      data.allowIncomingCalls = nextAllowIncomingCalls;
    }

    if (changesCanConnectLandlord && nextCanConnectLandlord !== undefined) {
      data.canConnectLandlord = nextCanConnectLandlord;
    }

    if (changesHasLandlordContact && nextHasLandlordContact !== undefined) {
      data.hasLandlordContact = nextHasLandlordContact;
    }

    if (nextWorkplaceName !== undefined) data.workplaceName = nextWorkplaceName;
    if (nextWorkplaceArea !== undefined) data.workplaceArea = nextWorkplaceArea;
    if (nextWorkplaceCity !== undefined) data.workplaceCity = nextWorkplaceCity;
    if (nextWorkplaceState !== undefined) data.workplaceState = nextWorkplaceState;

    let verificationToken: string | undefined;
    if (changesEmail && nextEmail) {
      const tokenArtifacts = this.generateEmailVerificationArtifacts();
      verificationToken = tokenArtifacts.rawToken;

      data.email = nextEmail;
      data.emailVerifiedAt = null;
      data.emailVerificationTokenHash = tokenArtifacts.tokenHash;
      data.emailVerificationExpiresAt = tokenArtifacts.expiresAt;
    }

    if (Object.keys(data).length === 0) {
      return {
        message: 'No profile changes detected',
        user: await this.getProfile(userId),
      };
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          fullName: true,
          email: true,
          emailVerifiedAt: true,
          phone: true,
          role: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
          reliabilityScore: true,
          cancellationCount: true,
          noShowCount: true,
          cooldownUntil: true,
          blockedUntil: true,
          profilePhotoUrl: true,
          gender: true,
          occupation: true,
          allowIncomingCalls: true,
          oauthProvider: true,
          canConnectLandlord: true,
          hasLandlordContact: true,
          onboardingComplete: true,
          phoneVerifiedAt: true,
          workplaceName: true,
          workplaceArea: true,
          workplaceCity: true,
          workplaceState: true,
          createdAt: true,
        },
      });

      return {
        message: changesEmail
          ? 'Profile updated. Please verify your new email address'
          : 'Profile updated successfully',
        user: updated,
        ...(this.shouldExposeVerificationToken() && verificationToken
          ? { verificationToken }
          : {}),
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or phone is already in use');
      }

      throw error;
    }
  }

  async savePushToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    });
    return { message: 'Push token saved' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'newPassword must be different from currentPassword',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user context');
    }

    const validPassword = await compare(dto.currentPassword, user.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    return {
      message: 'Password updated successfully',
    };
  }

  private async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        cooldownUntil: true,
        blockedUntil: true,
        profilePhotoUrl: true,
        gender: true,
        occupation: true,
        allowIncomingCalls: true,
        canConnectLandlord: true,
        hasLandlordContact: true,
        onboardingComplete: true,
        phoneVerifiedAt: true,
        workplaceName: true,
        workplaceArea: true,
        workplaceCity: true,
        workplaceState: true,
        contactsUnlocked: true,
        createdAt: true,
      },
    });
  }

  private generateEmailVerificationArtifacts() {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.emailVerificationTokenTtlMs);

    return { rawToken, tokenHash, expiresAt };
  }

  private shouldExposeVerificationToken(): boolean {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    return nodeEnv !== 'production';
  }

  private mapGender(
    gender: 'male' | 'female' | 'other' | 'prefer_not_to_say',
  ): 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' {
    if (gender === 'male') return 'MALE';
    if (gender === 'female') return 'FEMALE';
    if (gender === 'other') return 'OTHER';
    return 'PREFER_NOT_TO_SAY';
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('00')) {
      return `+${cleaned.slice(2)}`;
    }
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async setProfilePhotoUrl(userId: string, url: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl: url },
    });
    return { profilePhotoUrl: url };
  }

  async submitNin(userId: string, nin: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ninVerifiedAt: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.ninVerifiedAt) {
      throw new BadRequestException('NIN already verified');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { nin: nin.trim() },
    });

    return { message: 'NIN submitted successfully. Verification is pending.' };
  }
}
