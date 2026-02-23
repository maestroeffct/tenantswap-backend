import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
import { ListingsService } from './listings.service';

describe('ListingsService', () => {
  let service: ListingsService;

  const prismaMock = {
    swapListing: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
