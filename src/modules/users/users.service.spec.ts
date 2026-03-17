import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';

import { PrismaService } from '../../common/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    swapListing: {
      findMany: jest.fn(),
    },
    matchCandidate: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'EMAIL_VERIFICATION_TOKEN_TTL_MS') {
        return 86_400_000;
      }

      if (key === 'NODE_ENV') {
        return 'test';
      }

      return undefined;
    }),
  } as unknown as ConfigService;

  let service: UsersService;

  beforeEach(() => {
    prismaMock.user.findUnique = jest.fn();
    prismaMock.user.update = jest.fn();
    prismaMock.swapListing.findMany = jest.fn();
    prismaMock.matchCandidate.findMany = jest.fn();

    service = new UsersService(prismaMock, configMock);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });


  it('should return profile with listings and matches', async () => {
    const createdAt = new Date('2026-03-17T10:00:00.000Z');
    const currentAvailableOn = new Date('2026-03-20T00:00:00.000Z');
    const expiresAt = new Date('2026-04-20T00:00:00.000Z');

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerifiedAt: new Date(),
      phone: '+2348011111111',
      role: 'USER',
      subscriptionStatus: 'INACTIVE',
      subscriptionExpiresAt: null,
      reliabilityScore: 100,
      cancellationCount: 0,
      noShowCount: 0,
      cooldownUntil: null,
      blockedUntil: null,
      profilePhotoUrl: null,
      gender: null,
      occupation: null,
      allowIncomingCalls: true,
      canConnectLandlord: true,
      hasLandlordContact: true,
      onboardingComplete: true,
      phoneVerifiedAt: null,
      createdAt,
    });

    prismaMock.swapListing.findMany
      .mockResolvedValueOnce([
        {
          id: 'listing-1',
          userId: 'u1',
          desiredType: '2 Bedroom',
          desiredCity: 'Lagos',
          maxBudget: 1000000,
          timeline: '30 days',
          currentType: '1 Bedroom',
          currentCity: 'Abuja',
          currentRent: 600000,
          currentAvailable: true,
          currentAvailableOn,
          features: ['parking'],
          status: 'ACTIVE',
          createdAt,
          expiresAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'listing-2',
          userId: 'u2',
          desiredType: '1 Bedroom',
          desiredCity: 'Abuja',
          maxBudget: 700000,
          timeline: '14 days',
          currentType: '2 Bedroom',
          currentCity: 'Lagos',
          currentRent: 950000,
          currentAvailable: true,
          currentAvailableOn,
          features: ['parking', 'security'],
          status: 'ACTIVE',
          createdAt,
          expiresAt,
        },
      ]);

    prismaMock.matchCandidate.findMany.mockResolvedValue([
      {
        id: 'match-1',
        fromListingId: 'listing-1',
        toListingId: 'listing-2',
        cityScore: 25,
        typeScore: 25,
        budgetScore: 20,
        timelineScore: 15,
        totalScore: 85,
        createdAt,
      },
    ]);

    const result = await service.getMe('u1');

    expect(result.message).toBe('User profile fetched successfully');
    expect(result.user.listings).toHaveLength(1);
    expect(result.user.listings[0]).toMatchObject({
      id: 'listing-1',
      matchCount: 1,
    });
  });

  it('should update fullName without requiring currentPassword', async () => {
    const dto: UpdateProfileDto = { fullName: 'Ada Lovelace' };

    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        fullName: 'Old Name',
        email: 'ada@example.com',
        phone: '+2348011111111',
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'u1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        emailVerifiedAt: new Date(),
        phone: '+2348011111111',
        role: 'USER',
        subscriptionStatus: 'INACTIVE',
        subscriptionExpiresAt: null,
        reliabilityScore: 100,
        cancellationCount: 0,
        noShowCount: 0,
        cooldownUntil: null,
        blockedUntil: null,
        createdAt: new Date(),
      });

    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerifiedAt: new Date(),
      phone: '+2348011111111',
      role: 'USER',
      subscriptionStatus: 'INACTIVE',
      subscriptionExpiresAt: null,
      reliabilityScore: 100,
      cancellationCount: 0,
      noShowCount: 0,
      cooldownUntil: null,
      blockedUntil: null,
      createdAt: new Date(),
    });

    const result = await service.updateProfile('u1', dto);

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(result.message).toBe('Profile updated successfully');
  });

  it('should change password when currentPassword is correct', async () => {
    const oldHash = await hash('OldPassword1!', 10);
    const dto: ChangePasswordDto = {
      currentPassword: 'OldPassword1!',
      newPassword: 'NewPassword1!',
    };

    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', password: oldHash });
    prismaMock.user.update.mockResolvedValue({ id: 'u1' });

    const result = await service.changePassword('u1', dto);

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(result.message).toBe('Password updated successfully');
  });
});
