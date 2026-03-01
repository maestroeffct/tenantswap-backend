import { Test, TestingModule } from '@nestjs/testing';

import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { ConfigService } from '@nestjs/config';

import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { PrismaService } from '../../common/prisma.service';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';

describe('MatchingController', () => {
  let controller: MatchingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: SubscriptionGuard,
          useValue: {
            canActivate: jest.fn(() => true),
          },
        },
        {
          provide: ReliabilityService,
          useValue: {
            getRestrictionState: jest.fn(() => ({ blocked: false, cooldown: false })),
          },
        },
        {
          provide: ReliabilityGuard,
          useValue: {
            canActivate: jest.fn(() => true),
          },
        },
        {
          provide: MatchingService,
          useValue: {
            runForUser: jest.fn(),
            runForListing: jest.fn(),
            requestInterest: jest.fn(),
            getIncomingInterests: jest.fn(),
            getOutgoingInterests: jest.fn(),
            approveInterest: jest.fn(),
            declineInterest: jest.fn(),
            confirmRenter: jest.fn(),
            confirmTakenByRequester: jest.fn(),
            getMyChains: jest.fn(),
            getChainDetail: jest.fn(),
            acceptChain: jest.fn(),
            declineChain: jest.fn(),
            requestContactUnlock: jest.fn(),
            approveContactUnlock: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MatchingController>(MatchingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
