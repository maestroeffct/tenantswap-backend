import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
import { AiService } from './ai.service';
import { MatchingService } from './matching.service';

describe('MatchingService', () => {
  let service: MatchingService;

  const prismaMock = {
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
    suggestNoMatch: jest.fn(() => []),
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
