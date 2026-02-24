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
      const result =
        await this.matchingService.expirePendingChains('SYSTEM_SWEEP');

      if (result.expiredChains > 0) {
        this.logger.warn(
          `Expired ${result.expiredChains} chain(s), reran ${result.rerunTriggered} listing(s).`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to sweep expired chains', error as Error);
    }
  }
}
