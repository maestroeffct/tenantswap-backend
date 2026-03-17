import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';

type SweepSource = 'SYSTEM_SWEEP' | 'REQUEST' | 'ADMIN_SWEEP';

type SweepLifecycleJob = {
  source: SweepSource;
  type: 'SWEEP_LIFECYCLE';
};

type RunListingMatchJob = {
  listingId: string;
  userId?: string;
  type: 'RUN_LISTING_MATCH';
};

type MatchingLifecycleJob = SweepLifecycleJob | RunListingMatchJob;

import { MatchingService } from './matching.service';

const MATCHING_LIFECYCLE_QUEUE = 'matching-lifecycle';
const SWEEP_JOB = 'sweep-lifecycle';
const RUN_LISTING_JOB = 'run-listing-match';

@Injectable()
export class MatchingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingQueueService.name);
  private readonly queueEnabled: boolean;
  private readonly autoSearchSweepEnabled: boolean;
  private readonly connection: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly matchingService: MatchingService,
    private readonly config: ConfigService,
  ) {
    this.queueEnabled = this.config.get<boolean>('QUEUE_ENABLED') ?? false;
    this.autoSearchSweepEnabled =
      this.config.get<boolean>('AUTO_SEARCH_SWEEP_ENABLED') ?? true;
    this.connection = {
      host: this.config.get<string>('REDIS_HOST') ?? '127.0.0.1',
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
      password: this.config.get<string>('REDIS_PASSWORD'),
      db: this.config.get<number>('REDIS_DB') ?? 0,
    };
  }

  async onModuleInit() {
    if (!this.queueEnabled) {
      this.logger.log('BullMQ disabled; falling back to in-process scheduler');
      return;
    }

    this.queue = new Queue(MATCHING_LIFECYCLE_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    this.worker = new Worker(
      MATCHING_LIFECYCLE_QUEUE,
      async (job) => this.processJob(job as Job<MatchingLifecycleJob>),
      {
        connection: this.connection,
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`[BULLMQ] completed job=${job.name} id=${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `[BULLMQ] failed job=${job?.name ?? 'unknown'} id=${job?.id ?? 'n/a'}`,
        error?.stack ?? String(error),
      );
    });

    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();

    this.logger.log(
      `BullMQ enabled for matching lifecycle on redis ${this.connection.host}:${this.connection.port}/${this.connection.db}`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  isEnabled() {
    return this.queueEnabled && Boolean(this.queue) && Boolean(this.worker);
  }

  async enqueueLifecycleSweep(source: SweepSource = 'SYSTEM_SWEEP') {
    if (!this.isEnabled()) {
      return false;
    }

    const minuteBucket = Math.floor(Date.now() / 60_000);
    await this.queue!.add(
      SWEEP_JOB,
      {
        source,
        type: 'SWEEP_LIFECYCLE',
      } satisfies SweepLifecycleJob,
      {
        jobId: `${SWEEP_JOB}_${minuteBucket}`,
      },
    );

    return true;
  }

  async enqueueRunListingMatch(listingId: string, userId?: string) {
    if (!this.isEnabled()) {
      return false;
    }

    await this.queue!.add(
      RUN_LISTING_JOB,
      {
        listingId,
        userId,
        type: 'RUN_LISTING_MATCH',
      } satisfies RunListingMatchJob,
      {
        jobId: `${RUN_LISTING_JOB}_${listingId}_${Date.now()}`,
      },
    );

    return true;
  }

  private async processJob(job: Job<MatchingLifecycleJob>) {
    if (job.name === SWEEP_JOB) {
      const data = job.data as SweepLifecycleJob;
      return this.runLifecycleSweep(data.source);
    }

    if (job.name === RUN_LISTING_JOB) {
      const data = job.data as RunListingMatchJob;
      return this.matchingService.runForListing(data.listingId, data.userId, {
        skipExpireSweep: true,
      });
    }

    throw new Error(`Unsupported matching queue job: ${job.name}`);
  }

  private async runLifecycleSweep(source: SweepSource) {
    const listingResult = await this.matchingService.expireListings(source);
    const chainResult = await this.matchingService.expirePendingChains(source);
    const interestResult =
      await this.matchingService.expireListingInterests(source);

    if (
      listingResult.expiredListings > 0 ||
      chainResult.expiredChains > 0 ||
      interestResult.expiredInterests > 0
    ) {
      this.logger.warn(
        `[BULLMQ] sweep finished expiredListings=${listingResult.expiredListings} expiredChains=${chainResult.expiredChains} expiredInterests=${interestResult.expiredInterests}`,
      );
    }

    if (this.autoSearchSweepEnabled) {
      await this.matchingService.runAutoSearchSweep(source);
    }
  }
}
