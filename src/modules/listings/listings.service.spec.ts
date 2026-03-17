import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
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
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'LISTING_ACTIVE_TTL_HOURS') return 336;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updates an owned listing', async () => {
    prismaMock.swapListing.findFirst.mockResolvedValue({
      id: 'listing-1',
      status: 'ACTIVE',
    });
    prismaMock.swapListing.update.mockResolvedValue({
      id: 'listing-1',
      desiredCity: 'Ibadan',
      currentAvailable: false,
    });

    const result = await service.updateListing('user-1', 'listing-1', {
      desiredCity: 'Ibadan',
      currentAvailable: false,
    });

    expect(prismaMock.swapListing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: {
        desiredCity: 'Ibadan',
        currentAvailable: false,
      },
    });
    expect(result.message).toBe('Listing updated successfully');
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
