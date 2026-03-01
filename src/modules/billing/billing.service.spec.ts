import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    paymentTransaction: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    paymentWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'SUBSCRIPTION_ENFORCEMENT') return false;
      if (key === 'TESTER_ALLOWLIST') return [];
      if (key === 'PAYMENT_PROVIDER') return 'manual';
      if (key === 'PAYMENT_WEBHOOK_SECRET') return 'dev-webhook-secret';
      if (key === 'SUBSCRIPTION_DEFAULT_PLAN') return 'basic_monthly';
      if (key === 'SUBSCRIPTION_DEFAULT_AMOUNT_MINOR') return 5000;
      if (key === 'SUBSCRIPTION_DEFAULT_DURATION_DAYS') return 30;
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
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

    service = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
