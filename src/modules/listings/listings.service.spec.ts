import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { ListingsService } from './listings.service';

describe('ListingsService', () => {
  let service: ListingsService;

  const prismaMock = {
    $transaction: jest.fn(),
    user: {
      update: jest.fn(),
    },
    swapListing: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    matchCandidate: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const matchingServiceMock = {
    runForListing: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'LISTING_ACTIVE_TTL_HOURS') return 336;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    matchingServiceMock.runForListing.mockResolvedValue({ found: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: ConfigService,
          useValue: configMock,
        },
        {
          provide: MatchingService,
          useValue: matchingServiceMock,
        },
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });


  it('creates a listing and runs matching automatically', async () => {
    const listing = {
      id: 'listing-1',
      userId: 'user-1',
      desiredType: '2 Bedroom',
      desiredState: 'Lagos',
      desiredCity: 'Lagos',
      desiredArea: 'Ikeja',
      maxBudget: 1000000,
      timeline: '30 days',
      currentType: '1 Bedroom',
      currentState: 'FCT',
      currentCity: 'Abuja',
      currentArea: 'Wuse',
      currentRent: 600000,
      currentAvailable: true,
      currentAvailableOn: new Date('2026-03-20T00:00:00.000Z'),
      features: ['parking'],
      status: 'ACTIVE',
      createdAt: new Date('2026-03-17T10:00:00.000Z'),
      expiresAt: new Date('2026-04-20T00:00:00.000Z'),
    };

    prismaMock.$transaction.mockImplementation(async (cb: any) => cb({
      swapListing: { create: jest.fn().mockResolvedValue(listing) },
      user: { update: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    }));
    prismaMock.matchCandidate.findMany.mockResolvedValue([]);

    const result = await service.createListing('user-1', {
      desiredType: '2 Bedroom',
      desiredState: 'Lagos',
      desiredCity: 'Lagos',
      desiredArea: 'Ikeja',
      maxBudget: 1000000,
      timeline: '30 days',
      currentType: '1 Bedroom',
      currentState: 'FCT',
      currentCity: 'Abuja',
      currentArea: 'Wuse',
      currentRent: 600000,
      currentAvailable: true,
      currentAvailableOn: '2026-03-20T00:00:00.000Z',
      features: ['parking'],
    });

    expect(matchingServiceMock.runForListing).toHaveBeenCalledWith('listing-1', 'user-1', {
      skipExpireSweep: true,
    });
    expect(result.message).toBe('Listing created successfully');
  });

  it('clears matches when a listing is made unavailable', async () => {
    prismaMock.swapListing.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'ACTIVE',
    });
    prismaMock.swapListing.update.mockResolvedValue({
      id: 'listing-1',
      status: 'ACTIVE',
      currentAvailable: false,
    });
    prismaMock.matchCandidate.findMany.mockResolvedValue([]);

    await service.updateListing('user-1', 'listing-1', {
      currentAvailable: false,
    });

    expect(prismaMock.matchCandidate.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ fromListingId: 'listing-1' }, { toListingId: 'listing-1' }],
      },
    });
    expect(matchingServiceMock.runForListing).not.toHaveBeenCalled();
  });

  it('updates an owned listing', async () => {
    prismaMock.swapListing.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'ACTIVE',
    });
    prismaMock.swapListing.update.mockResolvedValue({
      id: 'listing-1',
      status: 'ACTIVE',
      desiredCity: 'Ibadan',
      currentAvailable: true,
    });
    prismaMock.matchCandidate.findMany.mockResolvedValue([]);

    const result = await service.updateListing('user-1', 'listing-1', {
      desiredCity: 'Ibadan',
    });

    expect(prismaMock.swapListing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: {
        desiredCity: 'Ibadan',
      },
    });
    expect(matchingServiceMock.runForListing).toHaveBeenCalledWith('listing-1', 'user-1', {
      skipExpireSweep: true,
    });
    expect(result.message).toBe('Listing updated successfully');
  });


  it('returns listings with matches attached', async () => {
    const createdAt = new Date('2026-03-17T10:00:00.000Z');
    const currentAvailableOn = new Date('2026-03-20T00:00:00.000Z');
    const expiresAt = new Date('2026-04-20T00:00:00.000Z');

    prismaMock.swapListing.findMany
      .mockResolvedValueOnce([
        {
          id: 'listing-1',
          userId: 'user-1',
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
          userId: 'user-2',
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

    const result = await service.getMyListings('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'listing-1',
      matchCount: 1,
    });
    expect(result[0].matches[0]).toMatchObject({
      id: 'match-1',
      totalScore: 85,
      targetListing: {
        id: 'listing-2',
      },
    });
  });

  it('rejects empty listing updates', async () => {
    prismaMock.swapListing.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'ACTIVE',
    });

    await expect(
      service.updateListing('user-1', 'listing-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
