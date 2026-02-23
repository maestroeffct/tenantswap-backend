import { Test, TestingModule } from '@nestjs/testing';

import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

describe('MatchingController', () => {
  let controller: MatchingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        {
          provide: MatchingService,
          useValue: {
            runForUser: jest.fn(),
            runForListing: jest.fn(),
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
