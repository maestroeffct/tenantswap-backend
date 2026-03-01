import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma.service';
import { ReliabilityService } from './reliability.service';

describe('ReliabilityService', () => {
  let service: ReliabilityService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    reliabilityEvent: {
      create: jest.fn(),
    },
  };

  const configMock = {
    get: jest.fn(() => undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReliabilityService,
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

    service = module.get<ReliabilityService>(ReliabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
