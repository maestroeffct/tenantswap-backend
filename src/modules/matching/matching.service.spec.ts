import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
import { AiService } from './ai.service';
import { MatchingService } from './matching.service';
import { NotificationService } from './notification.service';

describe('MatchingService', () => {
  let service: MatchingService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    userNotification: {
      createMany: jest.fn(),
    },
    swapListing: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
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

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'CHAIN_ACCEPT_TTL_HOURS') return 24;
      if (key === 'CHAIN_EXPIRE_SWEEP_LIMIT') return 50;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.swapChain.findMany.mockResolvedValue([]);

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

    const result = await service.runForListing('A', 'user-A');

    expect(result.found).toBe(true);
    expect(result.badge).toBe('DIRECT');
    expect(result.matchScenario).toBe('ONE_TO_ONE');
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].relationship).toBe('ONE_TO_ONE');
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

    const result = await service.runForListing('A', 'user-A');

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
    };

    prismaMock.swapListing.findUnique.mockResolvedValue(listingA);
    prismaMock.swapListing.findMany.mockResolvedValue([listingA]);

    const result = await service.runForListing('A', 'user-A');

    expect(result.found).toBe(false);
    expect(result.matchScenario).toBe('INDEPENDENT');
    expect(result.recommendations).toHaveLength(0);
    expect(result.aiSuggestions).toEqual(['tip']);
    expect(aiServiceMock.suggestNoMatch).toHaveBeenCalledTimes(1);
  });
});
