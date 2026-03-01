import { Test, TestingModule } from '@nestjs/testing';

import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ConfigService } from '@nestjs/config';

import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { PrismaService } from '../../common/prisma.service';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { ReliabilityService } from '../../common/services/reliability.service';

describe('ListingsController', () => {
  let controller: ListingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListingsController],
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
          provide: ListingsService,
          useValue: {
            createListing: jest.fn(),
            renewListing: jest.fn(),
            getMyListings: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ListingsController>(ListingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
