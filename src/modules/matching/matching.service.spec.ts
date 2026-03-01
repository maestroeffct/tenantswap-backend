import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { AiService } from './ai.service';
import { MatchingService } from './matching.service';
import { NotificationService } from './notification.service';

describe('MatchingService', () => {
  let service: MatchingService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    userNotification: {
      createMany: jest.fn(),
    },
    swapListing: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    listingInterest: {
      count: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    matchCandidate: {
      upsert: jest.fn(),
    },
    swapChain: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    swapChainMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    contactUnlock: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    contactUnlockApproval: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const aiServiceMock = {
    suggestNoMatch: jest.fn(() => ['tip']),
  };

  const notificationServiceMock = {
    notifyMany: jest.fn(() => Promise.resolve()),
  };

  const reliabilityServiceMock = {
    recordCancellation: jest.fn(() => Promise.resolve()),
    recordNoShow: jest.fn(() => Promise.resolve()),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'CHAIN_ACCEPT_TTL_HOURS') return 24;
      if (key === 'CHAIN_EXPIRE_SWEEP_LIMIT') return 50;
      if (key === 'INTEREST_REQUEST_TTL_HOURS') return 48;
      if (key === 'INTEREST_EXPIRE_SWEEP_LIMIT') return 100;
      if (key === 'LISTING_ACTIVE_TTL_HOURS') return 336;
      if (key === 'LISTING_EXPIRE_SWEEP_LIMIT') return 100;
      if (key === 'INTEREST_MAX_OPEN_PER_REQUESTER') return 25;
      if (key === 'INTEREST_MAX_DAILY_REQUESTS') return 50;
      if (key === 'RELIABILITY_RANK_PENALTY_WEIGHT') return 25;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.swapChain.findMany.mockResolvedValue([]);
    prismaMock.listingInterest.findMany.mockResolvedValue([]);
    prismaMock.swapListing.findMany.mockResolvedValue([]);
    prismaMock.swapListing.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.listingInterest.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: AiService,
          useValue: aiServiceMock,
        },
        {
          provide: NotificationService,
          useValue: notificationServiceMock,
        },
        {
          provide: ReliabilityService,
          useValue: reliabilityServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a direct chain when there is a mutual one-to-one match', async () => {
    const listingA = {
      id: 'A',
      userId: 'user-A',
      status: 'ACTIVE',
      desiredCity: 'Lagos',
      desiredType: '2 Bedroom',
      maxBudget: 1200,
      timeline: '30 days',
      currentCity: 'Abuja',
      currentType: '1 Bedroom',
      currentRent: 700,
      availableOn: new Date('2026-03-01T00:00:00.000Z'),
      features: ['parking', 'security'],
      expiresAt: new Date('2026-03-08T00:00:00.000Z'),
    };

    const listingB = {
      id: 'B',
      userId: 'user-B',
      status: 'ACTIVE',
      desiredCity: 'Abuja',
      desiredType: '1 Bedroom',
      maxBudget: 1000,
      timeline: '30 days',
      currentCity: 'Lagos',
      currentType: '2 Bedroom',
      currentRent: 900,
      availableOn: new Date('2026-03-08T00:00:00.000Z'),
      features: ['security', 'balcony'],
      expiresAt: new Date('2026-03-15T00:00:00.000Z'),
    };

    prismaMock.swapListing.findUnique.mockResolvedValue(listingA);
    prismaMock.swapListing.findMany.mockResolvedValue([listingA, listingB]);
    prismaMock.matchCandidate.upsert.mockImplementation(() =>
      Promise.resolve({}),
    );
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.swapChain.findUnique.mockResolvedValue(null);
    prismaMock.swapChainMember.findMany.mockResolvedValue([]);
    prismaMock.swapChain.create.mockResolvedValue({
      id: 'chain-1',
      status: 'PENDING',
      type: 'DIRECT',
      cycleSize: 2,
      avgScore: 74,
      cycleHash: 'A-B',
      acceptBy: new Date('2026-03-02T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      members: [
        {
          id: 'member-a',
          chainId: 'chain-1',
          listingId: 'A',
          userId: 'user-A',
          position: 0,
          hasAccepted: false,
        },
        {
          id: 'member-b',
          chainId: 'chain-1',
          listingId: 'B',
          userId: 'user-B',
          position: 1,
          hasAccepted: false,
        },
      ],
    });

    const result = await service.runForListing('A', 'user-A', {
      skipExpireSweep: true,
    });

    expect(result.found).toBe(true);
    expect(result.badge).toBe('DIRECT');
    expect(result.matchScenario).toBe('ONE_TO_ONE');
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].relationship).toBe('ONE_TO_ONE');
    expect(result.stats.totalCandidates).toBe(1);
    expect(prismaMock.swapChain.create).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.notifyMany).toHaveBeenCalled();
  });

  it('returns one-way recommendations when there is no chain', async () => {
    const listingA = {
      id: 'A',
      userId: 'user-A',
      status: 'ACTIVE',
      desiredCity: 'Lagos',
      desiredType: '2 Bedroom',
      maxBudget: 1500,
      timeline: '45 days',
      currentCity: 'Abuja',
      currentType: '1 Bedroom',
      currentRent: 650,
      availableOn: new Date('2026-03-01T00:00:00.000Z'),
      features: ['parking', 'security'],
      expiresAt: new Date('2026-03-08T00:00:00.000Z'),
    };

    const listingB = {
      id: 'B',
      userId: 'user-B',
      status: 'ACTIVE',
      desiredCity: 'Ibadan',
      desiredType: '5 Bedroom',
      maxBudget: 3000,
      timeline: '90 days',
      currentCity: 'Lagos',
      currentType: '2 Bedroom',
      currentRent: 1100,
      availableOn: new Date('2026-03-12T00:00:00.000Z'),
      features: ['security'],
      expiresAt: new Date('2026-03-20T00:00:00.000Z'),
    };

    const listingC = {
      id: 'C',
      userId: 'user-C',
      status: 'ACTIVE',
      desiredCity: 'Kano',
      desiredType: '4 Bedroom',
      maxBudget: 2500,
      timeline: '60 days',
      currentCity: 'Ikeja',
      currentType: '2 Bedroom',
      currentRent: 1300,
      availableOn: new Date('2026-03-20T00:00:00.000Z'),
      features: ['parking'],
      expiresAt: new Date('2026-03-30T00:00:00.000Z'),
    };

    prismaMock.swapListing.findUnique.mockResolvedValue(listingA);
    prismaMock.swapListing.findMany.mockResolvedValue([
      listingA,
      listingB,
      listingC,
    ]);
    prismaMock.matchCandidate.upsert.mockImplementation(() =>
      Promise.resolve({}),
    );
    prismaMock.$transaction.mockResolvedValue([]);

    const result = await service.runForListing('A', 'user-A', {
      skipExpireSweep: true,
    });

    expect(result.found).toBe(false);
    expect(result.matchScenario).toBe('ONE_TO_MANY');
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].rankScore).toBeGreaterThanOrEqual(
      result.recommendations[1].rankScore,
    );
    expect(prismaMock.swapChain.create).not.toHaveBeenCalled();
  });

  it('returns independent state and AI tips when there are no compatible recommendations', async () => {
    const listingA = {
      id: 'A',
      userId: 'user-A',
      status: 'ACTIVE',
      desiredCity: 'Lagos',
      desiredType: '2 Bedroom',
      maxBudget: 800,
      timeline: '30 days',
      currentCity: 'Abuja',
      currentType: 'Studio',
      currentRent: 700,
      availableOn: new Date('2026-03-01T00:00:00.000Z'),
      features: ['parking'],
      expiresAt: new Date('2026-03-08T00:00:00.000Z'),
    };

    prismaMock.swapListing.findUnique.mockResolvedValue(listingA);
    prismaMock.swapListing.findMany.mockResolvedValue([listingA]);

    const result = await service.runForListing('A', 'user-A', {
      skipExpireSweep: true,
    });

    expect(result.found).toBe(false);
    expect(result.matchScenario).toBe('INDEPENDENT');
    expect(result.recommendations).toHaveLength(0);
    expect(result.aiSuggestions).toEqual(['tip']);
    expect(aiServiceMock.suggestNoMatch).toHaveBeenCalledTimes(1);
  });

  it('creates an interest request for compatible listings', async () => {
    const targetListing = {
      id: 'target-1',
      userId: 'owner-1',
      status: 'ACTIVE',
      desiredCity: 'Ibadan',
      desiredType: '3 Bedroom',
      maxBudget: 2000,
      timeline: '60 days',
      currentCity: 'Lagos',
      currentType: '2 Bedroom',
      currentRent: 1000,
      availableOn: new Date('2026-03-14T00:00:00.000Z'),
      features: ['security'],
      expiresAt: new Date('2026-03-14T00:00:00.000Z'),
      user: {
        id: 'owner-1',
        fullName: 'Owner One',
        phone: '+2348011111111',
      },
    };

    const requesterListing = {
      id: 'requester-listing-1',
      userId: 'requester-1',
      status: 'ACTIVE',
      desiredCity: 'Lagos',
      desiredType: '2 Bedroom',
      maxBudget: 1200,
      timeline: '45 days',
      currentCity: 'Abuja',
      currentType: '1 Bedroom',
      currentRent: 700,
      availableOn: new Date('2026-03-01T00:00:00.000Z'),
      features: ['parking'],
      expiresAt: new Date('2026-03-08T00:00:00.000Z'),
      user: {
        id: 'requester-1',
        fullName: 'Requester One',
        phone: '+2348022222222',
      },
    };

    prismaMock.swapListing.findMany.mockResolvedValue([]);
    prismaMock.swapListing.findUnique.mockResolvedValue(targetListing);
    prismaMock.swapListing.findFirst.mockResolvedValue(requesterListing);
    prismaMock.listingInterest.upsert.mockResolvedValue({
      id: 'interest-1',
      status: 'REQUESTED',
      listingId: targetListing.id,
      requesterListingId: requesterListing.id,
      expiresAt: new Date('2026-03-03T00:00:00.000Z'),
    });

    const result = await service.requestInterest(targetListing.id, 'requester-1');

    expect(result.success).toBe(true);
    expect(result.interest.status).toBe('REQUESTED');
    expect(prismaMock.listingInterest.upsert).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.notifyMany).toHaveBeenCalled();
  });
});
