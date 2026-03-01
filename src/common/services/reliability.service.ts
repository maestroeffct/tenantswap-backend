import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, ReliabilityEventType } from '@prisma/client';

import { PrismaService } from '../prisma.service';

type PenaltyContext = {
  reason?: string;
  metadata?: Record<string, unknown>;
};

type ManualPenaltyInput = {
  reason?: string;
  scorePenalty?: number;
  cooldownHours?: number;
  blockHours?: number;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ReliabilityService {
  private readonly logger = new Logger(ReliabilityService.name);

  private readonly cancelScorePenalty: number;
  private readonly noShowScorePenalty: number;
  private readonly manualScorePenalty: number;
  private readonly cooldownAfterCancellations: number;
  private readonly cooldownHours: number;
  private readonly blockAfterNoShows: number;
  private readonly blockHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.cancelScorePenalty =
      this.config.get<number>('RELIABILITY_CANCEL_SCORE_PENALTY') ?? 5;
    this.noShowScorePenalty =
      this.config.get<number>('RELIABILITY_NOSHOW_SCORE_PENALTY') ?? 15;
    this.manualScorePenalty =
      this.config.get<number>('RELIABILITY_MANUAL_SCORE_PENALTY') ?? 10;
    this.cooldownAfterCancellations =
      this.config.get<number>('RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS') ?? 3;
    this.cooldownHours = this.config.get<number>('RELIABILITY_COOLDOWN_HOURS') ?? 24;
    this.blockAfterNoShows =
      this.config.get<number>('RELIABILITY_BLOCK_AFTER_NOSHOWS') ?? 2;
    this.blockHours = this.config.get<number>('RELIABILITY_BLOCK_HOURS') ?? 72;
  }

  private plusHours(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private normalizeScore(next: number): number {
    if (next < 0) {
      return 0;
    }
    if (next > 100) {
      return 100;
    }
    return next;
  }

  private toJson(input: unknown): Prisma.InputJsonValue | undefined {
    if (!input) {
      return undefined;
    }

    return input as Prisma.InputJsonValue;
  }

  private async appendEvent(input: {
    userId: string;
    actorUserId?: string;
    eventType: ReliabilityEventType;
    scoreDelta: number;
    reason?: string;
    metadata?: Record<string, unknown>;
    cooldownUntil?: Date | null;
    blockedUntil?: Date | null;
  }) {
    await this.prisma.reliabilityEvent.create({
      data: {
        userId: input.userId,
        actorUserId: input.actorUserId,
        eventType: input.eventType,
        scoreDelta: input.scoreDelta,
        reason: input.reason,
        metadata: this.toJson(input.metadata),
        cooldownUntil: input.cooldownUntil ?? null,
        blockedUntil: input.blockedUntil ?? null,
      },
    });
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        cooldownUntil: true,
        blockedUntil: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      userId: user.id,
      reliabilityScore: user.reliabilityScore,
      cancellationCount: user.cancellationCount,
      noShowCount: user.noShowCount,
      cooldownUntil: user.cooldownUntil,
      blockedUntil: user.blockedUntil,
    };
  }

  async getRestrictionState(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        cooldownUntil: true,
        blockedUntil: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const now = new Date();
    const blocked = Boolean(user.blockedUntil && user.blockedUntil > now);
    const cooldown = Boolean(user.cooldownUntil && user.cooldownUntil > now);

    return {
      blocked,
      cooldown,
      blockedUntil: user.blockedUntil,
      cooldownUntil: user.cooldownUntil,
    };
  }

  async recordCancellation(userId: string, context?: PenaltyContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        reliabilityScore: true,
        cancellationCount: true,
        cooldownUntil: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const nextCancellationCount = user.cancellationCount + 1;
    const nextScore = this.normalizeScore(
      user.reliabilityScore - this.cancelScorePenalty,
    );

    let cooldownUntil = user.cooldownUntil;
    if (nextCancellationCount >= this.cooldownAfterCancellations) {
      const candidateCooldown = this.plusHours(this.cooldownHours);
      if (!cooldownUntil || cooldownUntil < candidateCooldown) {
        cooldownUntil = candidateCooldown;
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        reliabilityScore: nextScore,
        cancellationCount: nextCancellationCount,
        cooldownUntil,
      },
    });

    await this.appendEvent({
      userId,
      eventType: 'CANCELLATION',
      scoreDelta: -this.cancelScorePenalty,
      reason: context?.reason,
      metadata: context?.metadata,
      cooldownUntil,
    });

    this.logger.warn(
      `[RELIABILITY_PENALTY] type=CANCELLATION userId=${userId} score=${nextScore} cancellations=${nextCancellationCount}`,
    );

    return this.getStatus(userId);
  }

  async recordNoShow(
    userId: string,
    actorUserId?: string,
    context?: PenaltyContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        reliabilityScore: true,
        noShowCount: true,
        blockedUntil: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const nextNoShowCount = user.noShowCount + 1;
    const nextScore = this.normalizeScore(
      user.reliabilityScore - this.noShowScorePenalty,
    );

    let blockedUntil = user.blockedUntil;
    if (nextNoShowCount >= this.blockAfterNoShows) {
      const candidateBlock = this.plusHours(this.blockHours);
      if (!blockedUntil || blockedUntil < candidateBlock) {
        blockedUntil = candidateBlock;
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        reliabilityScore: nextScore,
        noShowCount: nextNoShowCount,
        blockedUntil,
      },
    });

    await this.appendEvent({
      userId,
      actorUserId,
      eventType: 'NO_SHOW',
      scoreDelta: -this.noShowScorePenalty,
      reason: context?.reason,
      metadata: context?.metadata,
      blockedUntil,
    });

    this.logger.warn(
      `[RELIABILITY_PENALTY] type=NO_SHOW userId=${userId} score=${nextScore} noShows=${nextNoShowCount}`,
    );

    return this.getStatus(userId);
  }

  async applyManualPenalty(
    actorUserId: string,
    targetUserId: string,
    input: ManualPenaltyInput,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        reliabilityScore: true,
        cooldownUntil: true,
        blockedUntil: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Target user not found');
    }

    const penalty = input.scorePenalty ?? this.manualScorePenalty;
    const nextScore = this.normalizeScore(user.reliabilityScore - penalty);

    const cooldownUntil = input.cooldownHours
      ? this.plusHours(input.cooldownHours)
      : user.cooldownUntil;

    const blockedUntil = input.blockHours
      ? this.plusHours(input.blockHours)
      : user.blockedUntil;

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        reliabilityScore: nextScore,
        cooldownUntil,
        blockedUntil,
      },
    });

    await this.appendEvent({
      userId: targetUserId,
      actorUserId,
      eventType: 'MANUAL_PENALTY',
      scoreDelta: -penalty,
      reason: input.reason,
      metadata: input.metadata,
      cooldownUntil,
      blockedUntil,
    });

    this.logger.warn(
      `[RELIABILITY_PENALTY] type=MANUAL userId=${targetUserId} actorUserId=${actorUserId} score=${nextScore}`,
    );

    return this.getStatus(targetUserId);
  }

  async clearRestrictions(
    actorUserId: string,
    targetUserId: string,
    reason?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Target user not found');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        cooldownUntil: null,
        blockedUntil: null,
      },
    });

    await this.appendEvent({
      userId: targetUserId,
      actorUserId,
      eventType: 'MANUAL_UNBLOCK',
      scoreDelta: 0,
      reason,
    });

    this.logger.warn(
      `[RELIABILITY_UNBLOCK] userId=${targetUserId} actorUserId=${actorUserId}`,
    );

    return this.getStatus(targetUserId);
  }
}
