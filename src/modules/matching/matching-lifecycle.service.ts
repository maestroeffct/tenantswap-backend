import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { MatchingService } from './matching.service';

@Injectable()
export class MatchingLifecycleService {
  private readonly logger = new Logger(MatchingLifecycleService.name);
  private readonly autoSearchSweepEnabled: boolean;

  constructor(
    private readonly matchingService: MatchingService,
    private readonly config: ConfigService,
  ) {
    this.autoSearchSweepEnabled =
      this.config.get<boolean>('AUTO_SEARCH_SWEEP_ENABLED') ?? true;
  }

  @Interval(60_000)
  async sweepExpiredChains() {
    try {
      const listingResult =
        await this.matchingService.expireListings('SYSTEM_SWEEP');
      const chainResult =
        await this.matchingService.expirePendingChains('SYSTEM_SWEEP');
      const interestResult =
        await this.matchingService.expireListingInterests('SYSTEM_SWEEP');

      if (
        listingResult.expiredListings > 0 ||
        chainResult.expiredChains > 0 ||
        interestResult.expiredInterests > 0
      ) {
        this.logger.warn(
          `Sweep finished: expiredListings=${listingResult.expiredListings}, expiredChains=${chainResult.expiredChains}, expiredInterests=${interestResult.expiredInterests}.`,
        );
      }

      if (this.autoSearchSweepEnabled) {
        await this.matchingService.runAutoSearchSweep('SYSTEM_SWEEP');
      }
    } catch (error) {
      this.logger.error('Failed to sweep matching lifecycle', error as Error);
    }
  }
}
