import { Test, TestingModule } from '@nestjs/testing';

import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

describe('BillingController', () => {
  let controller: BillingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: {
            getMySubscription: jest.fn(),
            createCheckout: jest.fn(),
            handleWebhook: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
