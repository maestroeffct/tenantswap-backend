import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { MatchingService } from './matching.service';

@Injectable()
export class MatchingLifecycleService {
  private readonly logger = new Logger(MatchingLifecycleService.name);

  constructor(private readonly matchingService: MatchingService) {}

  @Interval(60_000)
  async sweepExpiredChains() {
    try {
      const chainResult =
        await this.matchingService.expirePendingChains('SYSTEM_SWEEP');
      const interestResult =
        await this.matchingService.expireListingInterests('SYSTEM_SWEEP');

      if (
        chainResult.expiredChains > 0 ||
        interestResult.expiredInterests > 0
      ) {
        this.logger.warn(
          `Sweep finished: expiredChains=${chainResult.expiredChains}, expiredInterests=${interestResult.expiredInterests}.`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to sweep matching lifecycle', error as Error);
    }
  }
}
