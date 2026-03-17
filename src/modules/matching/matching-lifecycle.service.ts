import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MatchingService } from './matching.service';
import { MatchingQueueService } from './matching-queue.service';

@Injectable()
export class MatchingLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingLifecycleService.name);
  private readonly autoSearchSweepEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private intervalRef?: NodeJS.Timeout;

  constructor(
    private readonly matchingService: MatchingService,
    private readonly config: ConfigService,
    private readonly matchingQueueService: MatchingQueueService,
  ) {
    this.autoSearchSweepEnabled =
      this.config.get<boolean>('AUTO_SEARCH_SWEEP_ENABLED') ?? true;
    this.sweepIntervalMs =
      this.config.get<number>('MATCHING_LIFECYCLE_SWEEP_MS') ?? 60_000;
  }

  onModuleInit() {
    this.intervalRef = setInterval(() => {
      void this.sweepExpiredChains();
    }, this.sweepIntervalMs);

    this.logger.log(
      `Matching lifecycle sweep scheduled every ${this.sweepIntervalMs}ms`,
    );
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
  }

  async sweepExpiredChains() {
    try {
      const enqueued = await this.matchingQueueService.enqueueLifecycleSweep(
        'SYSTEM_SWEEP',
      );

      if (enqueued) {
        return;
      }

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
