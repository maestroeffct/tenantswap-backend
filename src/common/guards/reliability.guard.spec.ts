import { Test, TestingModule } from '@nestjs/testing';

import { ReliabilityService } from '../services/reliability.service';
import { ReliabilityGuard } from './reliability.guard';

describe('ReliabilityGuard', () => {
  let guard: ReliabilityGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReliabilityGuard,
        {
          provide: ReliabilityService,
          useValue: {
            getRestrictionState: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ReliabilityGuard>(ReliabilityGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
