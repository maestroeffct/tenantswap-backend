import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';

import {
  EmailService,
  type SystemEmailInput,
  type VerificationEmailInput,
} from './email.service';

type VerificationEmailJob = {
  type: 'SEND_VERIFICATION_EMAIL';
  payload: VerificationEmailInput;
};

type SystemEmailJob = {
  type: 'SEND_SYSTEM_EMAIL';
  payload: SystemEmailInput;
};

type EmailJob = VerificationEmailJob | SystemEmailJob;

export type EmailEnqueueResult = {
  queued: boolean;
  mode: 'bullmq' | 'detached';
  error?: string;
};

const EMAIL_QUEUE_NAME = 'email-delivery';
const VERIFICATION_JOB_NAME = 'send-verification-email';
const SYSTEM_JOB_NAME = 'send-system-email';

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly queueEnabled: boolean;
  private readonly connection: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.queueEnabled = this.config.get<boolean>('QUEUE_ENABLED') ?? false;
    this.connection = {
      host: this.config.get<string>('REDIS_HOST') ?? '127.0.0.1',
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
      password: this.config.get<string>('REDIS_PASSWORD'),
      db: this.config.get<number>('REDIS_DB') ?? 0,
    };
  }

  async onModuleInit() {
    if (!this.queueEnabled) {
      this.logger.log(
        'BullMQ disabled for email delivery; falling back to detached in-process dispatch',
      );
      return;
    }

    this.queue = new Queue(EMAIL_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    this.worker = new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => this.processJob(job as Job<EmailJob>),
      {
        connection: this.connection,
        concurrency: 3,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`[EMAIL_QUEUE] completed job=${job.name} id=${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `[EMAIL_QUEUE] failed job=${job?.name ?? 'unknown'} id=${job?.id ?? 'n/a'}`,
        error?.stack ?? String(error),
      );
    });

    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();

    this.logger.log(
      `BullMQ enabled for email delivery on redis ${this.connection.host}:${this.connection.port}/${this.connection.db}`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueVerificationEmail(
    payload: VerificationEmailInput,
  ): Promise<EmailEnqueueResult> {
    if (this.isEnabled()) {
      await this.queue!.add(
        VERIFICATION_JOB_NAME,
        {
          type: 'SEND_VERIFICATION_EMAIL',
          payload,
        } satisfies VerificationEmailJob,
        {
          jobId: `${VERIFICATION_JOB_NAME}_${payload.email}_${Date.now()}`,
        },
      );

      return {
        queued: true,
        mode: 'bullmq',
      };
    }

    this.dispatchDetached(async () => {
      const result = await this.emailService.sendVerificationEmail(payload);
      if (!result.delivered) {
        this.logger.warn(
          `[EMAIL_QUEUE_FALLBACK_LINK] email=${payload.email} verificationUrl=${payload.verificationUrl}`,
        );
      }
    });

    return {
      queued: true,
      mode: 'detached',
    };
  }

  async enqueueSystemEmail(
    payload: SystemEmailInput,
  ): Promise<EmailEnqueueResult> {
    if (this.isEnabled()) {
      await this.queue!.add(
        SYSTEM_JOB_NAME,
        {
          type: 'SEND_SYSTEM_EMAIL',
          payload,
        } satisfies SystemEmailJob,
        {
          jobId: `${SYSTEM_JOB_NAME}_${payload.email}_${Date.now()}`,
        },
      );

      return {
        queued: true,
        mode: 'bullmq',
      };
    }

    this.dispatchDetached(async () => {
      await this.emailService.sendSystemEmail(payload);
    });

    return {
      queued: true,
      mode: 'detached',
    };
  }

  private isEnabled() {
    return this.queueEnabled && Boolean(this.queue) && Boolean(this.worker);
  }

  private dispatchDetached(task: () => Promise<void>) {
    setImmediate(() => {
      void task().catch((error: unknown) => {
        this.logger.error(
          '[EMAIL_QUEUE] detached dispatch failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    });
  }

  private async processJob(job: Job<EmailJob>) {
    if (job.name === VERIFICATION_JOB_NAME) {
      const data = job.data as VerificationEmailJob;
      const result = await this.emailService.sendVerificationEmail(data.payload);
      if (!result.delivered) {
        this.logger.warn(
          `[EMAIL_QUEUE_FALLBACK_LINK] email=${data.payload.email} verificationUrl=${data.payload.verificationUrl}`,
        );
      }
      return result;
    }

    if (job.name === SYSTEM_JOB_NAME) {
      const data = job.data as SystemEmailJob;
      return this.emailService.sendSystemEmail(data.payload);
    }

    throw new Error(`Unsupported email queue job: ${job.name}`);
  }
}
