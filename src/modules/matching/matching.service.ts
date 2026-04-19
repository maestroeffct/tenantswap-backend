import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChainBreakReason,
  ListingInterestStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { AiService } from './ai.service';
import { NotificationService } from './notification.service';

type Edge = {
  to: string;
  cityScore: number;
  typeScore: number;
  budgetScore: number;
  timelineScore: number;
  featureScore: number;
  workplaceScore: number;
  reliabilityPenalty: number;
  reciprocityBonus: number;
  rankScore: number;
  isMutual: boolean;
  totalScore: number;
};

type ListingNode = {
  id: string;
  userId: string;
  desiredState: string;
  desiredCity: string;
  desiredArea: string | null;
  desiredType: string;
  maxBudget: number;
  timeline: string;
  currentState: string;
  currentCity: string;
  currentArea: string | null;
  currentType: string;
  currentRent: number;
  currentAvailable: boolean;
  currentAvailableOn: Date | null;
  features: string[];
  reliabilityScore: number;
  workplaceCity: string | null;
  workplaceArea: string | null;
  listingType: 'SWAP' | 'SEEKING';
  verificationStatus: string | null;
};

type Recommendation = {
  listingId: string;
  userId: string | null;
  currentState: string | null;
  currentCity: string | null;
  currentArea: string | null;
  currentType: string | null;
  currentRent: number | null;
  currentAvailable: boolean | null;
  currentAvailableOn: Date | null;
  features: string[];
  relationship: 'ONE_TO_ONE' | 'ONE_WAY';
  score: number;
  rankScore: number;
  breakdown: {
    location: number;
    apartmentType: number;
    budget: number;
    timeline: number;
    features: number;
    workplaceProximity: number;
    reliabilityPenalty: number;
    reciprocityBonus: number;
  };
};

type ChainCreateOutcome =
  | {
      created: true;
      chainType: 'DIRECT' | 'CIRCULAR';
      chain: {
        id: string;
        status: 'PENDING' | 'LOCKED' | 'BROKEN';
        type: 'DIRECT' | 'CIRCULAR';
        cycleSize: number;
        avgScore: number;
        cycleHash: string;
        acceptBy: Date | null;
        createdAt: Date;
        members: {
          id: string;
          chainId: string;
          listingId: string;
          userId: string;
          position: number;
          hasAccepted: boolean;
        }[];
      };
    }
  | {
      created: false;
      reason: 'exists';
      chainId: string;
      status: 'PENDING' | 'LOCKED' | 'BROKEN';
    }
  | {
      created: false;
      reason: 'lockedConflict';
    };

type RunOptions = {
  skipExpireSweep?: boolean;
  dryRun?: boolean;
};

type SweepTrigger = 'REQUEST' | 'SYSTEM_SWEEP' | 'ADMIN_SWEEP';

type RerunSummary = {
  triggered: number;
  succeeded: number;
  failed: number;
};

type ConfirmedByRole = 'LISTER' | 'WANTER' | 'ADMIN';

type InterestForConfirmation = {
  id: string;
  listingId: string;
  requesterListingId: string;
  requesterUserId: string;
  status: ListingInterestStatus;
  listing: {
    userId: string;
    user: {
      id: string;
      fullName: string;
      phone: string;
    };
  };
  requesterListing: {
    userId: string;
    user: {
      id: string;
      fullName: string;
      phone: string;
    };
  };
};

const OPEN_INTEREST_STATUSES: ListingInterestStatus[] = [
  'REQUESTED',
  'CONTACT_APPROVED',
];

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly chainAcceptTtlHours: number;
  private readonly chainExpireSweepLimit: number;
  private readonly interestRequestTtlHours: number;
  private readonly interestExpireSweepLimit: number;
  private readonly listingActiveTtlHours: number;
  private readonly listingExpireSweepLimit: number;
  private readonly interestMaxOpenPerRequester: number;
  private readonly interestMaxDailyRequests: number;
  private readonly reliabilityRankPenaltyWeight: number;
  private readonly autoSearchSweepLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationService: NotificationService,
    private readonly reliabilityService: ReliabilityService,
    private readonly config: ConfigService,
  ) {
    this.chainAcceptTtlHours =
      this.config.get<number>('CHAIN_ACCEPT_TTL_HOURS') ?? 24;
    this.chainExpireSweepLimit =
      this.config.get<number>('CHAIN_EXPIRE_SWEEP_LIMIT') ?? 50;
    this.interestRequestTtlHours =
      this.config.get<number>('INTEREST_REQUEST_TTL_HOURS') ?? 48;
    this.interestExpireSweepLimit =
      this.config.get<number>('INTEREST_EXPIRE_SWEEP_LIMIT') ?? 100;
    this.listingActiveTtlHours =
      this.config.get<number>('LISTING_ACTIVE_TTL_HOURS') ?? 336;
    this.listingExpireSweepLimit =
      this.config.get<number>('LISTING_EXPIRE_SWEEP_LIMIT') ?? 100;
    this.interestMaxOpenPerRequester =
      this.config.get<number>('INTEREST_MAX_OPEN_PER_REQUESTER') ?? 25;
    this.interestMaxDailyRequests =
      this.config.get<number>('INTEREST_MAX_DAILY_REQUESTS') ?? 50;
    this.reliabilityRankPenaltyWeight =
      this.config.get<number>('RELIABILITY_RANK_PENALTY_WEIGHT') ?? 25;
    this.autoSearchSweepLimit =
      this.config.get<number>('AUTO_SEARCH_SWEEP_LIMIT') ?? 100;
  }

  /* ---------------------------- scoring ---------------------------- */

  private normalize(value: string) {
    return value.trim().toLowerCase();
  }

  private normalizeNullable(value?: string | null) {
    if (!value) {
      return '';
    }

    return this.normalize(value);
  }

  private tokenizeLocation(...values: Array<string | null | undefined>) {
    return values
      .flatMap((value) => this.normalizeNullable(value).split(/[,\-/\s]+/))
      .filter(Boolean);
  }

  private computeLocationScore(a: ListingNode, b: ListingNode) {
    const desiredState = this.normalizeNullable(a.desiredState);
    const currentState = this.normalizeNullable(b.currentState);
    const desiredCity = this.normalizeNullable(a.desiredCity);
    const currentCity = this.normalizeNullable(b.currentCity);
    const desiredArea = this.normalizeNullable(a.desiredArea);
    const currentArea = this.normalizeNullable(b.currentArea);

    let score = 0;
    let usedStructuredLocation = false;

    if (desiredState && currentState) {
      usedStructuredLocation = true;
      if (desiredState === currentState) {
        score += 15;
      }
    }

    if (desiredCity && currentCity) {
      usedStructuredLocation = true;
      if (desiredCity === currentCity) {
        score += 10;
      }
    }

    if (desiredArea && currentArea) {
      usedStructuredLocation = true;

      if (desiredArea === currentArea) {
        score += 5;
      } else {
        const desiredAreaTokens = new Set(this.tokenizeLocation(desiredArea));
        const currentAreaTokens = this.tokenizeLocation(currentArea);
        const hasPartialAreaMatch = currentAreaTokens.some((token) =>
          desiredAreaTokens.has(token),
        );

        if (hasPartialAreaMatch) {
          score += 3;
        }
      }
    }

    if (usedStructuredLocation) {
      return score;
    }

    const desiredTokens = new Set(
      this.tokenizeLocation(a.desiredArea, a.desiredCity, a.desiredState),
    );
    const currentTokens = this.tokenizeLocation(
      b.currentArea,
      b.currentCity,
      b.currentState,
    );
    const shareToken = currentTokens.some((token) => desiredTokens.has(token));

    return shareToken ? 15 : 0;
  }

  private computeTypeScore(desiredType: string, currentType: string) {
    const desired = this.normalize(desiredType);
    const current = this.normalize(currentType);

    if (desired === current) return 30;
    if (desired.includes(current) || current.includes(desired)) return 15;

    return 0;
  }

  private computeBudgetScore(_maxBudget: number, _currentRent: number) {
    // Budget is not a matching factor — apartment type and location decide matches
    return 0;
  }

  private computeTimelineScore(a: ListingNode, b: ListingNode) {
    if (!a.currentAvailableOn || !b.currentAvailableOn) {
      return 0;
    }

    const diffDays = Math.abs(
      (a.currentAvailableOn.getTime() - b.currentAvailableOn.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (diffDays <= 14) return 10;
    if (diffDays <= 30) return 8;
    if (diffDays <= 60) return 5;
    if (diffDays <= 90) return 2;
    return 0;
  }

  private computeFeatureScore(a: ListingNode, b: ListingNode) {
    if (a.features.length === 0 || b.features.length === 0) return 0;

    const aFeatures = new Set(
      a.features.map((feature) => this.normalize(feature)),
    );
    const bFeatures = new Set(
      b.features.map((feature) => this.normalize(feature)),
    );

    let overlap = 0;
    for (const feature of aFeatures) {
      if (bFeatures.has(feature)) {
        overlap += 1;
      }
    }

    const denominator = Math.max(aFeatures.size, bFeatures.size);
    if (denominator === 0) return 0;

    const ratio = overlap / denominator;
    return Math.round(5 * ratio);
  }

  private computeReliabilityPenalty(reliabilityScore: number) {
    const clampedScore = Math.max(0, Math.min(100, reliabilityScore));
    const deficit = 100 - clampedScore;
    return Math.round((deficit / 100) * this.reliabilityRankPenaltyWeight);
  }

  // Score B higher if B's current location is near A's workplace.
  // A is the seeker; B is the listing being evaluated.
  // Max 8 points: city match (5) + area match (3).
  private computeWorkplaceProximityScore(a: ListingNode, b: ListingNode) {
    if (!a.workplaceCity) return 0;

    const wpCity = this.normalize(a.workplaceCity);
    const bCity = this.normalize(b.currentCity);
    if (wpCity !== bCity) return 0;

    // City matched: 5 pts base
    let score = 5;

    if (a.workplaceArea && b.currentArea) {
      const wpArea = this.normalize(a.workplaceArea);
      const bArea = this.normalize(b.currentArea);
      if (wpArea === bArea) {
        score += 3;
      } else {
        const wpTokens = new Set(this.tokenizeLocation(a.workplaceArea));
        const bTokens = this.tokenizeLocation(b.currentArea);
        if (bTokens.some((t) => wpTokens.has(t))) score += 1;
      }
    }

    return score;
  }

  private computeScore(a: ListingNode, b: ListingNode) {
    const cityScore = this.computeLocationScore(a, b);
    const typeScore = this.computeTypeScore(a.desiredType, b.currentType);
    const budgetScore = this.computeBudgetScore(a.maxBudget, b.currentRent);
    const timelineScore = this.computeTimelineScore(a, b);
    const featureScore = this.computeFeatureScore(a, b);
    const workplaceScore = this.computeWorkplaceProximityScore(a, b);
    const reliabilityPenalty = this.computeReliabilityPenalty(
      b.reliabilityScore,
    );

    const totalScore =
      cityScore +
      typeScore +
      budgetScore +
      timelineScore +
      featureScore +
      workplaceScore -
      reliabilityPenalty;

    return {
      cityScore,
      typeScore,
      budgetScore,
      timelineScore,
      featureScore,
      workplaceScore,
      reliabilityPenalty,
      reciprocityBonus: 0,
      rankScore: Math.max(0, Math.min(100, totalScore)),
      isMutual: false,
      totalScore: Math.max(0, Math.min(100, totalScore)),
    };
  }

  private isEdgeCompatible(a: ListingNode, b: ListingNode) {
    // Seekers can never be on the B side — they have no apartment to offer
    if (b.listingType === 'SEEKING') return false;

    // If A is a seeker, they must be APPROVED to participate
    if (a.listingType === 'SEEKING') {
      return a.verificationStatus === 'APPROVED';
    }

    const typeScore = this.computeTypeScore(a.desiredType, b.currentType);
    if (typeScore === 0) return false;

    return b.currentAvailable;
  }

  private recommendationStats(recommendations: Recommendation[]) {
    const oneToOneCandidates = recommendations.filter(
      (item) => item.relationship === 'ONE_TO_ONE',
    ).length;

    return {
      totalCandidates: recommendations.length,
      oneToOneCandidates,
      oneWayCandidates: recommendations.length - oneToOneCandidates,
    };
  }

  /* ---------------------------- graph ---------------------------- */

  private buildGraph(listings: ListingNode[]) {
    const graph = new Map<string, Edge[]>();
    const lookup = new Map<string, Edge>();

    for (const a of listings) {
      const edges: Edge[] = [];

      for (const b of listings) {
        if (a.id === b.id) continue;
        if (!this.isEdgeCompatible(a, b)) continue;

        const scoreData = this.computeScore(a, b);
        const edge = { to: b.id, ...scoreData };

        edges.push(edge);
        lookup.set(`${a.id}->${b.id}`, edge);
      }

      edges.sort((left, right) => right.totalScore - left.totalScore);
      graph.set(a.id, edges);
    }

    for (const [fromId, edges] of graph.entries()) {
      for (const edge of edges) {
        const reverse = lookup.get(`${edge.to}->${fromId}`);
        if (!reverse) continue;

        edge.isMutual = true;
        edge.reciprocityBonus = 15;
        edge.rankScore = edge.totalScore + edge.reciprocityBonus;
      }
    }

    return graph;
  }

  private findCyclesFrom(
    startId: string,
    graph: Map<string, Edge[]>,
    maxLen = 4,
  ) {
    const cycles: string[][] = [];
    const path: string[] = [startId];
    const visited = new Set<string>([startId]);

    const dfs = (current: string) => {
      const edges = graph.get(current) ?? [];

      for (const edge of edges) {
        const next = edge.to;

        if (next === startId && path.length >= 2 && path.length <= maxLen) {
          cycles.push([...path]);
          continue;
        }

        if (visited.has(next)) continue;
        if (path.length >= maxLen) continue;

        visited.add(next);
        path.push(next);
        dfs(next);
        path.pop();
        visited.delete(next);
      }
    };

    dfs(startId);
    return cycles;
  }

  private pickBestCycle(cycles: string[][], graph: Map<string, Edge[]>) {
    const scored = cycles.map((cycle) => {
      let total = 0;

      for (let i = 0; i < cycle.length; i++) {
        const from = cycle[i];
        const to = i === cycle.length - 1 ? cycle[0] : cycle[i + 1];
        const edge = this.getEdge(graph, from, to);

        total += edge?.rankScore ?? edge?.totalScore ?? 0;
      }

      const avg = Math.round(total / cycle.length);
      return { cycle, avg };
    });

    scored.sort((left, right) => right.avg - left.avg);
    return scored[0] ?? null;
  }

  private getEdge(graph: Map<string, Edge[]>, fromId: string, toId: string) {
    return (graph.get(fromId) ?? []).find((edge) => edge.to === toId);
  }

  private pickBestDirectPair(listingId: string, graph: Map<string, Edge[]>) {
    const myEdges = graph.get(listingId) ?? [];

    const directCandidates = myEdges
      .filter((edge) => edge.isMutual)
      .map((edge) => {
        const reverse = this.getEdge(graph, edge.to, listingId);
        if (!reverse) return null;

        const avg = Math.round((edge.rankScore + reverse.rankScore) / 2);
        return { peerId: edge.to, avg };
      })
      .filter((candidate): candidate is { peerId: string; avg: number } =>
        Boolean(candidate),
      )
      .sort((left, right) => right.avg - left.avg);

    return directCandidates[0] ?? null;
  }

  private buildRecommendations(
    listingId: string,
    graph: Map<string, Edge[]>,
    listingById: Map<string, ListingNode>,
    limit = 8,
  ): Recommendation[] {
    const candidates = [...(graph.get(listingId) ?? [])]
      .sort((left, right) => right.rankScore - left.rankScore)
      .slice(0, limit);

    return candidates.map((candidate) => {
      const target = listingById.get(candidate.to);

      return {
        listingId: candidate.to,
        userId: target?.userId ?? null,
        currentState: target?.currentState ?? null,
        currentCity: target?.currentCity ?? null,
        currentArea: target?.currentArea ?? null,
        currentType: target?.currentType ?? null,
        currentRent: target?.currentRent ?? null,
        currentAvailable: target?.currentAvailable ?? null,
        currentAvailableOn: target?.currentAvailableOn ?? null,
        features: target?.features ?? [],
        relationship: candidate.isMutual ? 'ONE_TO_ONE' : 'ONE_WAY',
        score: candidate.totalScore,
        rankScore: candidate.rankScore,
        breakdown: {
          location: candidate.cityScore,
          apartmentType: candidate.typeScore,
          budget: candidate.budgetScore,
          timeline: candidate.timelineScore,
          features: candidate.featureScore,
          workplaceProximity: candidate.workplaceScore,
          reliabilityPenalty: candidate.reliabilityPenalty,
          reciprocityBonus: candidate.reciprocityBonus,
        },
      };
    });
  }

  /* ---------------------------- lifecycle helpers ---------------------------- */

  private async sweepLifecycle(skip = false) {
    if (skip) {
      return;
    }

    await this.expireListings('REQUEST');
    await this.expirePendingChains('REQUEST');
    await this.expireListingInterests('REQUEST');
    await this.sweepStaleAvailability();
  }

  private async sweepStaleAvailability() {
    const now = new Date();

    // Find SWAP listings that are active, marked available, but availableOn date has passed
    const staleListings = await this.prisma.swapListing.findMany({
      where: {
        status: 'ACTIVE',
        listingType: 'SWAP',
        currentAvailable: true,
        currentAvailableOn: { lt: now },
      },
      select: { id: true, userId: true },
    });

    if (staleListings.length === 0) return;

    // Only notify listings that haven't received this alert before
    const alreadyNotified = await this.prisma.userNotification.findMany({
      where: {
        type: 'AVAILABILITY_STALE',
        userId: { in: staleListings.map((l) => l.userId) },
      },
      select: { userId: true, payload: true },
    });

    const notifiedListingIds = new Set(
      alreadyNotified
        .map((n) => (n.payload as Record<string, string> | null)?.listingId)
        .filter(Boolean),
    );

    const toNotify = staleListings.filter(
      (l) => !notifiedListingIds.has(l.id),
    );

    if (toNotify.length === 0) return;

    await this.notificationService.notifyMany(
      toNotify.map((l) => ({
        userId: l.userId,
        type: 'AVAILABILITY_STALE',
        title: 'Update Your Availability',
        message:
          'Your listed available date has passed. Please update when the apartment will be ready, or mark it as unavailable if it\'s no longer free.',
        channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
        payload: { listingId: l.id },
      })),
    );
  }

  private computeAcceptByDate() {
    const durationMs = this.chainAcceptTtlHours * 60 * 60 * 1000;
    return new Date(Date.now() + durationMs);
  }

  private computeInterestExpiresAt() {
    const durationMs = this.interestRequestTtlHours * 60 * 60 * 1000;
    return new Date(Date.now() + durationMs);
  }

  private computeListingExpiresAt(from = new Date()) {
    const durationMs = this.listingActiveTtlHours * 60 * 60 * 1000;
    return new Date(from.getTime() + durationMs);
  }

  private getStartOfCurrentUtcDay() {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private async rerunListingsForMembers(
    listingIds: string[],
    sourceId: string,
  ): Promise<RerunSummary> {
    const uniqueListingIds = [...new Set(listingIds)];
    const summary: RerunSummary = {
      triggered: uniqueListingIds.length,
      succeeded: 0,
      failed: 0,
    };

    for (const listingId of uniqueListingIds) {
      try {
        await this.runForListing(listingId, undefined, {
          skipExpireSweep: true,
        });
        summary.succeeded += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn(
          `[MATCH_RERUN_FAILED] source=${sourceId} listingId=${listingId} error=${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    return summary;
  }

  private async updateAutoSearchState(
    listingId: string,
    recommendationCount: number,
  ) {
    const now = new Date();

    await this.prisma.swapListing.update({
      where: { id: listingId },
      data: {
        autoSearchEnabled: recommendationCount === 0,
        lastRecommendationCount: recommendationCount,
        autoSearchLastRunAt: now,
        autoSearchMatchedAt: recommendationCount > 0 ? now : null,
      },
    });
  }

  async runAutoSearchSweep(trigger: SweepTrigger) {
    const now = new Date();

    const watchListings = await this.prisma.swapListing.findMany({
      where: {
        status: 'ACTIVE',
        autoSearchEnabled: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        NOT: {
          AND: [
            { listingType: 'SEEKING' },
            { verificationStatus: 'PENDING' },
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: this.autoSearchSweepLimit,
      select: {
        id: true,
        userId: true,
        lastRecommendationCount: true,
      },
    });

    let evaluated = 0;
    let notified = 0;
    let failed = 0;

    for (const listing of watchListings) {
      try {
        const result = await this.runForListing(listing.id, listing.userId, {
          skipExpireSweep: true,
          dryRun: true,
        });
        const recommendationCount = result.recommendations.length;

        evaluated += 1;

        if (recommendationCount > 0 && listing.lastRecommendationCount === 0) {
          await this.notificationService.notifyMany([
            {
              userId: listing.userId,
              type: 'AUTO_RECOMMENDATION_FOUND',
              title: 'New Match Found',
              message:
                'Good news! We found new apartment recommendations for your listing.',
              channels: ['IN_APP', 'EMAIL', 'SMS'],
              payload: {
                listingId: listing.id,
                recommendationCount,
              },
            },
          ]);

          notified += 1;
        }

        // Near-miss notification — when no full matches but close candidates exist
        if (recommendationCount === 0) {
          const nearMisses = await this.computeNearMissesForSweep(listing.id);
          if (nearMisses.length > 0) {
            const top = nearMisses[0];
            const missMsg = top.missReason === 'wrong_type'
              ? `Someone in ${top.currentCity} is looking for what you have — they need a ${top.desiredType}, you have a ${top.currentType}.`
              : top.missReason === 'over_budget'
              ? `Someone in ${top.currentCity} is interested in your area — their budget is slightly below your rent.`
              : `Someone in ${top.currentCity} matches your area — their apartment isn't available yet.`;

            // Only send once per listing per day
            const alreadySentToday = await this.prisma.userNotification.findFirst({
              where: {
                userId: listing.userId,
                type: 'NEAR_MISS',
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                payload: { path: ['listingId'], equals: listing.id },
              },
              select: { id: true },
            });

            if (!alreadySentToday) {
              await this.notificationService.notifyMany([{
                userId: listing.userId,
                type: 'NEAR_MISS',
                title: 'Almost a Match',
                message: missMsg,
                channels: ['IN_APP'],
                payload: { listingId: listing.id, missReason: top.missReason, city: top.currentCity },
              }]);
            }
          }
        }

        await this.prisma.swapListing.update({
          where: { id: listing.id },
          data: {
            lastRecommendationCount: recommendationCount,
            autoSearchLastRunAt: now,
            autoSearchMatchedAt: recommendationCount > 0 ? now : null,
            autoSearchEnabled: recommendationCount === 0,
          },
        });
      } catch (error: unknown) {
        failed += 1;
        this.logger.warn(
          `[AUTO_SEARCH_SWEEP_FAILED] trigger=${trigger} listingId=${listing.id} error=${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    if (evaluated > 0 || failed > 0) {
      this.logger.log(
        `[AUTO_SEARCH_SWEEP] trigger=${trigger} watched=${watchListings.length} evaluated=${evaluated} notified=${notified} failed=${failed}`,
      );
    }

    return {
      trigger,
      watched: watchListings.length,
      evaluated,
      notified,
      failed,
    };
  }

  private async computeNearMissesForSweep(listingId: string): Promise<{
    currentType: string;
    currentCity: string;
    currentRent: number;
    desiredType: string;
    missReason: 'wrong_type' | 'over_budget' | 'not_available';
  }[]> {
    const listing = await this.prisma.swapListing.findUnique({
      where: { id: listingId },
      select: { desiredState: true, desiredType: true, maxBudget: true, listingType: true, status: true },
    });
    if (!listing || listing.status !== 'ACTIVE' || listing.listingType === 'SEEKING') return [];

    const now = new Date();
    const budgetCeiling = Math.round(listing.maxBudget * 1.3);

    const candidates = await this.prisma.swapListing.findMany({
      where: {
        id: { not: listingId },
        status: 'ACTIVE',
        listingType: 'SWAP',
        currentState: { equals: listing.desiredState, mode: 'insensitive' },
        currentRent: { lte: budgetCeiling },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        AND: [{ OR: [{ currentAvailableOn: null }, { currentAvailableOn: { gte: now } }] }],
      },
      select: { id: true, currentType: true, currentCity: true, currentRent: true, currentAvailable: true, desiredType: true },
      take: 10,
      orderBy: { currentRent: 'asc' },
    });

    const desiredNorm = listing.desiredType.trim().toLowerCase();
    const results: { currentType: string; currentCity: string; currentRent: number; desiredType: string; missReason: 'wrong_type' | 'over_budget' | 'not_available' }[] = [];

    for (const c of candidates) {
      const typeMatch = c.currentType.trim().toLowerCase() === desiredNorm ||
        c.currentType.trim().toLowerCase().includes(desiredNorm) ||
        desiredNorm.includes(c.currentType.trim().toLowerCase());
      const withinBudget = c.currentRent <= listing.maxBudget;
      const isAvailable = c.currentAvailable;
      if (typeMatch && withinBudget && isAvailable) continue;
      const missReason: 'wrong_type' | 'over_budget' | 'not_available' = !typeMatch ? 'wrong_type' : !withinBudget ? 'over_budget' : 'not_available';
      results.push({ currentType: c.currentType, currentCity: c.currentCity, currentRent: c.currentRent, desiredType: c.desiredType, missReason });
      if (results.length >= 3) break;
    }

    return results;
  }

  private async breakChainAndRecover(
    chainId: string,
    reason: ChainBreakReason,
    options: {
      actorUserId?: string;
      actorType: 'USER' | 'ADMIN' | 'SYSTEM';
      rerunMembers?: boolean;
    },
  ) {
    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: {
        members: {
          select: {
            listingId: true,
            userId: true,
          },
        },
      },
    });

    if (!chain) {
      throw new BadRequestException('Chain not found');
    }

    if (chain.status === 'BROKEN') {
      return {
        changed: false,
        reason: 'already_broken',
        rerun: {
          triggered: 0,
          succeeded: 0,
          failed: 0,
        },
      };
    }

    if (
      chain.status === 'LOCKED' &&
      options.actorType === 'SYSTEM' &&
      reason === 'EXPIRED'
    ) {
      return {
        changed: false,
        reason: 'already_locked',
        rerun: {
          triggered: 0,
          succeeded: 0,
          failed: 0,
        },
      };
    }

    await this.prisma.swapChain.update({
      where: { id: chainId },
      data: {
        status: 'BROKEN',
        brokenReason: reason,
        brokenAt: new Date(),
        brokenByUserId: options.actorUserId ?? null,
      },
    });

    const listingIds = chain.members.map((member) => member.listingId);
    const memberUserIds = chain.members.map((member) => member.userId);

    await this.notificationService.notifyMany(
      memberUserIds.map((userId) => ({
        userId,
        chainId,
        type: 'CHAIN_BROKEN',
        title: 'Chain Update',
        message: `Your chain has been marked BROKEN (${reason}).`,
        channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
        payload: {
          reason,
          actorType: options.actorType,
        },
      })),
    );

    const rerun = options.rerunMembers
      ? await this.rerunListingsForMembers(listingIds, chainId)
      : { triggered: 0, succeeded: 0, failed: 0 };

    this.logger.warn(
      `[CHAIN_BROKEN] chainId=${chainId} reason=${reason} actorType=${options.actorType} actorUserId=${
        options.actorUserId ?? 'n/a'
      } rerun=${JSON.stringify(rerun)}`,
    );

    return {
      changed: true,
      reason,
      rerun,
    };
  }

  private async breakChainsForListings(
    listingIds: string[],
    actorType: 'USER' | 'ADMIN' | 'SYSTEM',
    actorUserId?: string,
  ) {
    if (listingIds.length === 0) {
      return {
        affectedChains: 0,
        brokenChains: 0,
      };
    }

    const members = await this.prisma.swapChainMember.findMany({
      where: {
        listingId: { in: listingIds },
        chain: { status: { in: ['PENDING', 'LOCKED'] } },
      },
      select: {
        chainId: true,
      },
    });

    const chainIds = [...new Set(members.map((member) => member.chainId))];
    let brokenChains = 0;

    for (const chainId of chainIds) {
      const result = await this.breakChainAndRecover(chainId, 'CONFLICT', {
        actorType,
        actorUserId,
        rerunMembers: true,
      });

      if (result.changed) {
        brokenChains += 1;
      }
    }

    return {
      affectedChains: chainIds.length,
      brokenChains,
    };
  }

  async expireListings(trigger: SweepTrigger) {
    const now = new Date();

    const expiredListings = await this.prisma.swapListing.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          lt: now,
        },
      },
      orderBy: {
        expiresAt: 'asc',
      },
      take: this.listingExpireSweepLimit,
      select: {
        id: true,
        userId: true,
      },
    });

    let expiredCount = 0;
    let releasedInterests = 0;
    let rerunTriggered = 0;

    for (const listing of expiredListings) {
      const closed = await this.prisma.swapListing.updateMany({
        where: {
          id: listing.id,
          status: 'ACTIVE',
          expiresAt: {
            lt: now,
          },
        },
        data: {
          status: 'CLOSED',
          closeReason: 'EXPIRED',
          closedAt: now,
          expiresAt: null,
        },
      });

      if (closed.count === 0) {
        continue;
      }

      expiredCount += 1;

      const staleInterests = await this.prisma.listingInterest.findMany({
        where: {
          OR: [{ listingId: listing.id }, { requesterListingId: listing.id }],
          status: {
            in: OPEN_INTEREST_STATUSES,
          },
        },
        select: {
          id: true,
          requesterUserId: true,
          requesterListingId: true,
          listing: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (staleInterests.length === 0) {
        await this.notificationService.notifyMany([
          {
            userId: listing.userId,
            type: 'LISTING_EXPIRED',
            title: 'Listing Expired',
            message:
              'Your listing expired. Renew it to continue receiving requests.',
            channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
            payload: {
              listingId: listing.id,
            },
          },
        ]);
        continue;
      }

      const staleInterestIds = staleInterests.map((interest) => interest.id);
      const released = await this.prisma.listingInterest.updateMany({
        where: {
          id: {
            in: staleInterestIds,
          },
          status: {
            in: OPEN_INTEREST_STATUSES,
          },
        },
        data: {
          status: 'EXPIRED',
          respondedAt: now,
          releasedAt: now,
          expiresAt: null,
        },
      });

      releasedInterests += released.count;

      const rerunListingIds = [
        ...new Set(
          staleInterests
            .map((interest) => interest.requesterListingId)
            .filter((item) => item !== listing.id),
        ),
      ];

      if (rerunListingIds.length > 0) {
        const rerun = await this.rerunListingsForMembers(
          rerunListingIds,
          `listing-expired:${listing.id}`,
        );
        rerunTriggered += rerun.triggered;
      }

      const notifications = [
        {
          userId: listing.userId,
          type: 'LISTING_EXPIRED',
          title: 'Listing Expired',
          message:
            'Your listing expired and open requests were released automatically.',
          channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
          payload: {
            listingId: listing.id,
            releasedCount: released.count,
          },
        },
        ...staleInterests.map((interest) => ({
          userId: interest.requesterUserId,
          type: 'REQUEST_RELEASED',
          title: 'Request Released',
          message:
            'This listing is no longer active. Your request was released and matching reran.',
          channels: ['IN_APP', 'EMAIL'] as const,
          payload: {
            listingId: listing.id,
          },
        })),
        ...staleInterests.map((interest) => ({
          userId: interest.listing.userId,
          type: 'REQUEST_RELEASED',
          title: 'Request Released',
          message:
            'A related request was released because one listing expired.',
          channels: ['IN_APP', 'EMAIL'] as const,
          payload: {
            listingId: listing.id,
          },
        })),
      ];

      await this.notificationService.notifyMany(notifications);
    }

    if (expiredCount > 0) {
      this.logger.warn(
        `[LISTING_EXPIRE_SWEEP] trigger=${trigger} expiredListings=${expiredCount} releasedInterests=${releasedInterests} rerunTriggered=${rerunTriggered}`,
      );
    }

    return {
      trigger,
      checked: expiredListings.length,
      expiredListings: expiredCount,
      releasedInterests,
      rerunTriggered,
    };
  }

  async expirePendingChains(trigger: SweepTrigger, actorUserId?: string) {
    const now = new Date();

    const expiredChains = await this.prisma.swapChain.findMany({
      where: {
        status: 'PENDING',
        acceptBy: {
          lt: now,
        },
      },
      orderBy: {
        acceptBy: 'asc',
      },
      take: this.chainExpireSweepLimit,
      select: {
        id: true,
      },
    });

    let expiredCount = 0;
    let rerunTriggered = 0;

    for (const chain of expiredChains) {
      const result = await this.breakChainAndRecover(chain.id, 'EXPIRED', {
        actorType: 'SYSTEM',
        actorUserId,
        rerunMembers: true,
      });

      if (result.changed) {
        expiredCount += 1;
        rerunTriggered += result.rerun.triggered;
      }
    }

    if (expiredCount > 0) {
      this.logger.warn(
        `[CHAIN_EXPIRE_SWEEP] trigger=${trigger} expiredChains=${expiredCount} rerunTriggered=${rerunTriggered}`,
      );
    }

    return {
      trigger,
      checked: expiredChains.length,
      expiredChains: expiredCount,
      rerunTriggered,
    };
  }

  async expireListingInterests(trigger: SweepTrigger) {
    const now = new Date();

    const expiredInterests = await this.prisma.listingInterest.findMany({
      where: {
        status: { in: OPEN_INTEREST_STATUSES },
        expiresAt: { lt: now },
      },
      orderBy: {
        expiresAt: 'asc',
      },
      take: this.interestExpireSweepLimit,
      select: {
        id: true,
        listingId: true,
        requesterListingId: true,
        requesterUserId: true,
        listing: {
          select: {
            userId: true,
          },
        },
      },
    });

    let expiredCount = 0;
    let rerunTriggered = 0;

    for (const interest of expiredInterests) {
      const result = await this.prisma.listingInterest.updateMany({
        where: {
          id: interest.id,
          status: { in: OPEN_INTEREST_STATUSES },
        },
        data: {
          status: 'EXPIRED',
          respondedAt: now,
          releasedAt: now,
        },
      });

      if (result.count === 0) {
        continue;
      }

      expiredCount += 1;
      rerunTriggered += 1;

      await this.notificationService.notifyMany([
        {
          userId: interest.requesterUserId,
          type: 'INTEREST_EXPIRED',
          title: 'Request Expired',
          message:
            'Your request expired before it was approved. Matching will continue automatically.',
          channels: ['IN_APP', 'EMAIL'] as const,
          payload: {
            interestId: interest.id,
            listingId: interest.listingId,
          },
        },
        {
          userId: interest.listing.userId,
          type: 'INTEREST_EXPIRED',
          title: 'Request Expired',
          message: 'A pending request on your listing has expired.',
          channels: ['IN_APP', 'EMAIL'] as const,
          payload: {
            interestId: interest.id,
            requesterListingId: interest.requesterListingId,
          },
        },
      ]);

      await this.rerunListingsForMembers(
        [interest.requesterListingId],
        `interest-expired:${interest.id}`,
      );
    }

    if (expiredCount > 0) {
      this.logger.warn(
        `[INTEREST_EXPIRE_SWEEP] trigger=${trigger} expiredInterests=${expiredCount} rerunTriggered=${rerunTriggered}`,
      );
    }

    return {
      trigger,
      checked: expiredInterests.length,
      expiredInterests: expiredCount,
      rerunTriggered,
    };
  }

  private async createChainFromCycle(
    cycle: string[],
    avg: number,
    listings: ListingNode[],
  ): Promise<ChainCreateOutcome> {
    const canonical = [...cycle].sort().join('-');

    const existingChain = await this.prisma.swapChain.findUnique({
      where: { cycleHash: canonical },
      select: { id: true, status: true },
    });

    if (existingChain) {
      return {
        created: false,
        reason: 'exists',
        chainId: existingChain.id,
        status: existingChain.status,
      };
    }

    const existingMembers = await this.prisma.swapChainMember.findMany({
      where: { listingId: { in: cycle }, chain: { status: 'LOCKED' } },
      select: { listingId: true, chainId: true },
    });

    if (existingMembers.length > 0) {
      return {
        created: false,
        reason: 'lockedConflict',
      };
    }

    const chainType = cycle.length === 2 ? 'DIRECT' : 'CIRCULAR';
    const listingById = new Map(
      listings.map((item) => [item.id, item] as const),
    );

    const chain = await this.prisma.swapChain.create({
      data: {
        cycleSize: cycle.length,
        avgScore: avg,
        status: 'PENDING',
        type: chainType,
        cycleHash: canonical,
        acceptBy: this.computeAcceptByDate(),
        members: {
          create: cycle.map((id, index) => {
            const listing = listingById.get(id);

            if (!listing) {
              throw new BadRequestException(
                `Listing ${id} was not found in active listing set`,
              );
            }

            return {
              listingId: id,
              userId: listing.userId,
              position: index,
              hasAccepted: false,
            };
          }),
        },
      },
      include: { members: true },
    });

    await this.notificationService.notifyMany(
      chain.members.map((member) => ({
        userId: member.userId,
        chainId: chain.id,
        type: 'CHAIN_PENDING',
        title: 'New Chain Proposal',
        message: `A new ${chainType.toLowerCase()} chain was created. Accept before ${
          chain.acceptBy?.toISOString() ?? 'the deadline'
        }.`,
        channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
        payload: {
          chainType,
          acceptBy: chain.acceptBy?.toISOString() ?? null,
        },
      })),
    );

    return {
      created: true,
      chainType,
      chain,
    };
  }

  /* ---------------------------- public matching API ---------------------------- */

  async runForUser(userId: string, options?: RunOptions) {
    await this.sweepLifecycle(Boolean(options?.skipExpireSweep));

    const now = new Date();

    const myListing = await this.prisma.swapListing.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        currentAvailable: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!myListing) {
      throw new BadRequestException(
        'You have no ACTIVE listing. Create one first.',
      );
    }

    return this.runForListing(myListing.id, userId, options);
  }

  async runForListing(
    listingId: string,
    userId?: string,
    options?: RunOptions,
  ) {
    await this.sweepLifecycle(Boolean(options?.skipExpireSweep));

    const listing = await this.prisma.swapListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        userId: true,
        status: true,
        expiresAt: true,
        desiredState: true,
        desiredCity: true,
        desiredArea: true,
        desiredType: true,
        maxBudget: true,
        timeline: true,
        currentState: true,
        currentCity: true,
        currentArea: true,
        currentType: true,
        currentRent: true,
        currentAvailable: true,
        currentAvailableOn: true,
        features: true,
        listingType: true,
      },
    });

    if (!listing) throw new BadRequestException('Listing not found');

    if (userId && listing.userId !== userId) {
      throw new BadRequestException(
        'You can only run matching for your own listing',
      );
    }
    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Listing must be ACTIVE to run matching');
    }

    if (listing.listingType !== 'SEEKING' && !listing.currentAvailable) {
      throw new BadRequestException('Listing is marked unavailable for matching');
    }

    const now = new Date();
    if (listing.expiresAt && listing.expiresAt.getTime() < now.getTime()) {
      await this.prisma.swapListing.updateMany({
        where: {
          id: listing.id,
          status: 'ACTIVE',
        },
        data: {
          status: 'CLOSED',
          closeReason: 'EXPIRED',
          closedAt: now,
          expiresAt: null,
        },
      });

      throw new BadRequestException(
        'Listing expired. Renew it before matching',
      );
    }

    const listingRows = await this.prisma.swapListing.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        // Exclude SEEKING listings that are still pending verification
        NOT: {
          AND: [
            { listingType: 'SEEKING' },
            { verificationStatus: 'PENDING' },
          ],
        },
        // SWAP listings must have currentAvailable and a non-past availableOn date; SEEKING listings are exempt
        AND: [
          {
            OR: [
              { listingType: 'SEEKING' },
              { currentAvailable: true },
            ],
          },
          {
            OR: [
              { listingType: 'SEEKING' },
              { currentAvailableOn: null },
              { currentAvailableOn: { gte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        userId: true,
        desiredState: true,
        desiredCity: true,
        desiredArea: true,
        desiredType: true,
        maxBudget: true,
        timeline: true,
        currentState: true,
        currentCity: true,
        currentArea: true,
        currentType: true,
        currentRent: true,
        currentAvailable: true,
        currentAvailableOn: true,
        features: true,
        listingType: true,
        verificationStatus: true,
      },
    });

    const userRows = await this.prisma.user.findMany({
      where: {
        id: {
          in: [...new Set(listingRows.map((item) => item.userId))],
        },
      },
      select: {
        id: true,
        reliabilityScore: true,
        workplaceCity: true,
        workplaceArea: true,
      },
    });

    const userDataByUserId = new Map(
      userRows.map((item) => [item.id, item] as const),
    );

    const listings: ListingNode[] = listingRows.map((item) => {
      const userData = userDataByUserId.get(item.userId);
      return {
        ...item,
        reliabilityScore: userData?.reliabilityScore ?? 100,
        workplaceCity: userData?.workplaceCity ?? null,
        workplaceArea: userData?.workplaceArea ?? null,
        listingType: item.listingType as 'SWAP' | 'SEEKING',
        verificationStatus: item.verificationStatus as string | null,
      };
    });

    await this.prisma.matchCandidate.deleteMany({
      where: {
        OR: [{ fromListingId: listingId }, { toListingId: listingId }],
      },
    });

    const graph = this.buildGraph(listings);
    const listingById = new Map(
      listings.map((item) => [item.id, item] as const),
    );

    const edgeWrites: Prisma.PrismaPromise<unknown>[] = [];
    for (const [fromId, edges] of graph.entries()) {
      for (const edge of edges) {
        edgeWrites.push(
          this.prisma.matchCandidate.upsert({
            where: {
              fromListingId_toListingId: {
                fromListingId: fromId,
                toListingId: edge.to,
              },
            },
            update: {
              cityScore: edge.cityScore,
              typeScore: edge.typeScore,
              budgetScore: edge.budgetScore,
              timelineScore: edge.timelineScore,
              totalScore: edge.totalScore,
            },
            create: {
              fromListingId: fromId,
              toListingId: edge.to,
              cityScore: edge.cityScore,
              typeScore: edge.typeScore,
              budgetScore: edge.budgetScore,
              timelineScore: edge.timelineScore,
              totalScore: edge.totalScore,
            },
          }),
        );
      }
    }
    if (edgeWrites.length > 0) {
      await this.prisma.$transaction(edgeWrites);
    }

    const recommendations = this.buildRecommendations(
      listingId,
      graph,
      listingById,
    );
    const stats = this.recommendationStats(recommendations);

    if (!options?.dryRun) {
      await this.updateAutoSearchState(listingId, recommendations.length);
    }

    if (options?.dryRun) {
      if (recommendations.length === 0) {
        return {
          found: false,
          message:
            'No compatible recommendation yet. This listing is currently independent.',
          recommendations,
          stats,
          matchScenario: 'INDEPENDENT',
        };
      }

      const hasOneToOneRecommendation = recommendations.some(
        (recommendation) => recommendation.relationship === 'ONE_TO_ONE',
      );

      return {
        found: false,
        message: hasOneToOneRecommendation
          ? 'Auto-search found a direct recommendation.'
          : 'Auto-search found one-way recommendations.',
        recommendations,
        stats,
        matchScenario: hasOneToOneRecommendation ? 'ONE_TO_ONE' : 'ONE_TO_MANY',
      };
    }

    const bestDirect = this.pickBestDirectPair(listingId, graph);

    if (bestDirect) {
      const directOutcome = await this.createChainFromCycle(
        [listingId, bestDirect.peerId],
        bestDirect.avg,
        listings,
      );

      if (directOutcome.created) {
        return {
          found: true,
          message: 'Direct one-to-one match found! Awaiting confirmations.',
          chain: directOutcome.chain,
          badge: directOutcome.chainType,
          recommendations,
          stats,
          matchScenario: 'ONE_TO_ONE',
        };
      }

      if (directOutcome.reason === 'exists') {
        return {
          found: false,
          message: 'This direct chain already exists.',
          chainId: directOutcome.chainId,
          status: directOutcome.status,
          recommendations,
          stats,
          matchScenario: 'ONE_TO_MANY',
        };
      }

      return {
        found: false,
        message:
          'A direct match exists but one or more listings are currently locked in another chain.',
        recommendations,
        stats,
        matchScenario: 'ONE_TO_MANY',
      };
    }

    const cycles = this.findCyclesFrom(listingId, graph, 4).filter(
      (cycle) => cycle.length >= 3,
    );

    if (cycles.length === 0) {
      if (recommendations.length > 0) {
        return {
          found: false,
          message:
            'No one-to-one chain found yet. Showing top one-way matches for this listing.',
          recommendations,
          stats,
          matchScenario: 'ONE_TO_MANY',
        };
      }

      const tips = this.aiService.suggestNoMatch({
        desiredState: listing.desiredState,
        desiredCity: listing.desiredCity,
        desiredArea: listing.desiredArea,
        desiredType: listing.desiredType,
        maxBudget: listing.maxBudget,
        timeline: listing.timeline,
      });

      return {
        found: false,
        message:
          'No compatible recommendation yet. This listing is currently independent.',
        aiSuggestions: tips,
        recommendations,
        stats,
        matchScenario: 'INDEPENDENT',
      };
    }

    cycles.sort((left, right) => left.length - right.length);
    const shortestLen = cycles[0].length;
    const shortestGroup = cycles.filter(
      (cycle) => cycle.length === shortestLen,
    );

    const bestCycle = this.pickBestCycle(shortestGroup, graph);
    if (!bestCycle) {
      return {
        found: false,
        message: 'Cycle detection returned no best cycle.',
        recommendations,
        stats,
      };
    }

    const cycleOutcome = await this.createChainFromCycle(
      bestCycle.cycle,
      bestCycle.avg,
      listings,
    );

    if (!cycleOutcome.created && cycleOutcome.reason === 'exists') {
      return {
        found: false,
        message: 'This chain already exists.',
        chainId: cycleOutcome.chainId,
        status: cycleOutcome.status,
        recommendations,
        stats,
        matchScenario: 'ONE_TO_MANY',
      };
    }

    if (!cycleOutcome.created && cycleOutcome.reason === 'lockedConflict') {
      return {
        found: false,
        message:
          'A potential chain exists but one or more listings are already locked in another chain.',
        recommendations,
        stats,
        matchScenario: 'ONE_TO_MANY',
      };
    }

    if (!cycleOutcome.created) {
      return {
        found: false,
        message: 'Could not create a chain for this cycle.',
        recommendations,
        stats,
      };
    }

    return {
      found: true,
      message: 'Circular chain found! Awaiting confirmations.',
      chain: cycleOutcome.chain,
      badge: cycleOutcome.chainType,
      recommendations,
      stats,
      matchScenario: 'ONE_TO_MANY',
    };
  }

  async getMyChains(userId: string) {
    await this.sweepLifecycle();

    return this.prisma.swapChain.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
  }

  async getChainDetail(chainId: string, userId: string) {
    await this.sweepLifecycle();

    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: {
        members: { orderBy: { position: 'asc' } },
      },
    });

    if (!chain) throw new BadRequestException('Chain not found');

    const isMember = chain.members.some((member) => member.userId === userId);
    if (!isMember)
      throw new BadRequestException('You are not a member of this chain');

    const listingIds = chain.members.map((member) => member.listingId);
    const listings = await this.prisma.swapListing.findMany({
      where: { id: { in: listingIds } },
      include: { user: true },
    });

    const listingById = new Map(
      listings.map((listing) => [listing.id, listing]),
    );

    const unlock = await this.prisma.contactUnlock.findFirst({
      where: { chainId },
      include: { approvals: true },
    });

    const memberUserIds = chain.members.map((member) => member.userId);
    const approvalsOk =
      unlock &&
      memberUserIds.every((memberUserId) =>
        unlock.approvals.some(
          (approval) => approval.approverUserId === memberUserId,
        ),
      );

    return {
      id: chain.id,
      cycleSize: chain.cycleSize,
      avgScore: chain.avgScore,
      status: chain.status,
      type: chain.type,
      cycleHash: chain.cycleHash,
      acceptBy: chain.acceptBy,
      brokenReason: chain.brokenReason,
      brokenAt: chain.brokenAt,
      members: chain.members.map((member) => {
        const listing = listingById.get(member.listingId);
        return {
          listingId: member.listingId,
          position: member.position,
          hasAccepted: member.hasAccepted,
          fullName: listing?.user.fullName ?? null,
          phone: approvalsOk ? (listing?.user.phone ?? null) : null,
          currentState: listing?.currentState ?? null,
          currentCity: listing?.currentCity ?? null,
          currentArea: listing?.currentArea ?? null,
          currentType: listing?.currentType ?? null,
          currentRent: listing?.currentRent ?? null,
          desiredState: listing?.desiredState ?? null,
          desiredCity: listing?.desiredCity ?? null,
          desiredArea: listing?.desiredArea ?? null,
        };
      }),
      contactUnlocked: Boolean(approvalsOk),
    };
  }

  /* ---------------------------- one-to-many interest flow ---------------------------- */

  async requestInterest(
    targetListingId: string,
    requesterUserId: string,
    requesterListingId?: string,
    skipAvailabilityCheck = false,
    skipRequesterChecks = false,
    skipTargetStatusCheck = false,
  ) {
    await this.sweepLifecycle();

    const now = new Date();

    const targetListing = await this.prisma.swapListing.findUnique({
      where: { id: targetListingId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (!targetListing) {
      throw new BadRequestException('Target listing not found');
    }

    if (!skipTargetStatusCheck && targetListing.status !== 'ACTIVE') {
      throw new BadRequestException('Target listing is no longer active');
    }

    // Skip availability check for vacancy-based connects — the vacancy poster is
    // signalling knowledge of an available apartment, not offering their own listing
    if (!skipAvailabilityCheck && !targetListing.currentAvailable) {
      throw new BadRequestException('Target listing is not currently available');
    }

    if (
      !skipTargetStatusCheck &&
      targetListing.expiresAt &&
      targetListing.expiresAt.getTime() < now.getTime()
    ) {
      throw new BadRequestException('Target listing has expired');
    }

    if (targetListing.userId === requesterUserId) {
      throw new BadRequestException('You cannot request your own listing');
    }

    const openRequestCount = await this.prisma.listingInterest.count({
      where: {
        requesterUserId,
        status: {
          in: OPEN_INTEREST_STATUSES,
        },
      },
    });

    if (openRequestCount >= this.interestMaxOpenPerRequester) {
      throw new HttpException(
        `You already have ${openRequestCount} open requests. Resolve existing requests before creating more.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const todayRequestCount = await this.prisma.listingInterest.count({
      where: {
        requesterUserId,
        createdAt: {
          gte: this.getStartOfCurrentUtcDay(),
        },
      },
    });

    if (todayRequestCount >= this.interestMaxDailyRequests) {
      throw new HttpException(
        `Daily request limit reached (${this.interestMaxDailyRequests}). Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const requesterListing = requesterListingId
      ? await this.prisma.swapListing.findFirst({
          where: skipRequesterChecks
            ? { id: requesterListingId, userId: requesterUserId }
            : {
                id: requesterListingId,
                userId: requesterUserId,
                status: 'ACTIVE',
                OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
              },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        })
      : await this.prisma.swapListing.findFirst({
          where: skipRequesterChecks
            ? { userId: requesterUserId }
            : {
                userId: requesterUserId,
                status: 'ACTIVE',
                OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
              },
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        });

    if (!requesterListing) {
      throw new BadRequestException(
        'You need an ACTIVE listing before sending a request',
      );
    }

    if (!skipRequesterChecks && !requesterListing.currentAvailable) {
      throw new BadRequestException('Your listing is marked unavailable for matching');
    }

    if (requesterListing.id === targetListing.id) {
      throw new BadRequestException('Invalid request for same listing');
    }

    const requesterNode: ListingNode = {
      id: requesterListing.id,
      userId: requesterListing.userId,
      desiredState: requesterListing.desiredState,
      desiredCity: requesterListing.desiredCity,
      desiredArea: requesterListing.desiredArea,
      desiredType: requesterListing.desiredType,
      maxBudget: requesterListing.maxBudget,
      timeline: requesterListing.timeline,
      currentState: requesterListing.currentState,
      currentCity: requesterListing.currentCity,
      currentArea: requesterListing.currentArea,
      currentType: requesterListing.currentType,
      currentRent: requesterListing.currentRent,
      currentAvailable: requesterListing.currentAvailable,
      currentAvailableOn: requesterListing.currentAvailableOn,
      features: requesterListing.features,
      reliabilityScore: 100,
      workplaceCity: null,
      workplaceArea: null,
      listingType: requesterListing.listingType as 'SWAP' | 'SEEKING',
      verificationStatus: requesterListing.verificationStatus as string | null,
    };

    const targetNode: ListingNode = {
      id: targetListing.id,
      userId: targetListing.userId,
      desiredState: targetListing.desiredState,
      desiredCity: targetListing.desiredCity,
      desiredArea: targetListing.desiredArea,
      desiredType: targetListing.desiredType,
      maxBudget: targetListing.maxBudget,
      timeline: targetListing.timeline,
      currentState: targetListing.currentState,
      currentCity: targetListing.currentCity,
      currentArea: targetListing.currentArea,
      currentType: targetListing.currentType,
      currentRent: targetListing.currentRent,
      currentAvailable: targetListing.currentAvailable,
      currentAvailableOn: targetListing.currentAvailableOn,
      features: targetListing.features,
      reliabilityScore: 100,
      workplaceCity: null,
      workplaceArea: null,
      listingType: targetListing.listingType as 'SWAP' | 'SEEKING',
      verificationStatus: targetListing.verificationStatus as string | null,
    };

    // Vacancy-based connects skip swap compatibility — the requester is expressing
    // interest in a vacancy tip, not proposing a swap
    if (!skipTargetStatusCheck && !this.isEdgeCompatible(requesterNode, targetNode)) {
      throw new BadRequestException(
        'Your current active listing is not compatible with this apartment request',
      );
    }

    const expiresAt = this.computeInterestExpiresAt();

    const interest = await this.prisma.listingInterest.upsert({
      where: {
        listingId_requesterListingId: {
          listingId: targetListing.id,
          requesterListingId: requesterListing.id,
        },
      },
      update: {
        requesterUserId,
        status: 'REQUESTED',
        expiresAt,
        respondedAt: null,
        releasedAt: null,
        confirmedAt: null,
        confirmedByUserId: null,
        confirmedByRole: null,
      },
      create: {
        listingId: targetListing.id,
        requesterListingId: requesterListing.id,
        requesterUserId,
        status: 'REQUESTED',
        expiresAt,
      },
    });

    await this.notificationService.notifyMany([
      {
        userId: targetListing.userId,
        type: 'INTEREST_REQUESTED',
        title: 'New Request',
        message: `${requesterListing.user.fullName} requested your listing.`,
        channels: ['IN_APP', 'EMAIL', 'SMS'],
        payload: {
          interestId: interest.id,
          listingId: targetListing.id,
          requesterListingId: requesterListing.id,
        },
      },
      {
        userId: requesterUserId,
        type: 'INTEREST_SENT',
        title: 'Request Sent',
        message: `Your match request was sent to ${targetListing.user.fullName}.`,
        channels: ['IN_APP'],
        payload: {
          interestId: interest.id,
          listingId: targetListing.id,
          expiresAt: expiresAt.toISOString(),
        },
      },
    ]);

    return {
      success: true,
      message: 'Interest request sent',
      interest: {
        id: interest.id,
        status: interest.status,
        listingId: interest.listingId,
        requesterListingId: interest.requesterListingId,
        expiresAt: interest.expiresAt,
      },
    };
  }

  async getIncomingInterests(ownerUserId: string) {
    await this.sweepLifecycle();

    const interests = await this.prisma.listingInterest.findMany({
      where: {
        listing: {
          userId: ownerUserId,
        },
      },
      include: {
        listing: {
          select: {
            id: true,
            status: true,
            currentState: true,
            currentCity: true,
            currentArea: true,
            currentType: true,
            currentRent: true,
            createdAt: true,
          },
        },
        requesterListing: {
          select: {
            id: true,
            desiredState: true,
            desiredCity: true,
            desiredArea: true,
            desiredType: true,
            maxBudget: true,
            timeline: true,
            currentState: true,
            currentCity: true,
            currentArea: true,
            currentType: true,
            currentRent: true,
            currentAvailableOn: true,
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const grouped = new Map<
      string,
      {
        listingId: string;
        listingStatus: string;
        currentState: string;
        currentCity: string;
        currentArea: string | null;
        currentType: string;
        currentRent: number;
        openRequests: number;
        requests: Array<{
          interestId: string;
          status: ListingInterestStatus;
          createdAt: Date;
          expiresAt: Date | null;
          requester: {
            userId: string;
            fullName: string;
            phone: string;
            listingId: string;
          };
        }>;
      }
    >();

    for (const interest of interests) {
      const key = interest.listing.id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          listingId: interest.listing.id,
          listingStatus: interest.listing.status,
          currentState: interest.listing.currentState,
          currentCity: interest.listing.currentCity,
          currentArea: interest.listing.currentArea,
          currentType: interest.listing.currentType,
          currentRent: interest.listing.currentRent,
          openRequests: 0,
          requests: [],
        });
      }

      const bucket = grouped.get(key);
      if (!bucket) continue;

      if (OPEN_INTEREST_STATUSES.includes(interest.status)) {
        bucket.openRequests += 1;
      }

      bucket.requests.push({
        interestId: interest.id,
        status: interest.status,
        createdAt: interest.createdAt,
        expiresAt: interest.expiresAt,
        requester: {
          userId: interest.requesterListing.user.id,
          fullName: interest.requesterListing.user.fullName,
          phone: interest.requesterListing.user.phone,
          listingId: interest.requesterListing.id,
        },
      });
    }

    const listings = [...grouped.values()].sort(
      (left, right) => right.openRequests - left.openRequests,
    );

    return {
      totalRequests: interests.length,
      openRequests: listings.reduce((sum, item) => sum + item.openRequests, 0),
      listings,
    };
  }

  async getOutgoingInterests(requesterUserId: string) {
    await this.sweepLifecycle();

    const interests = await this.prisma.listingInterest.findMany({
      where: {
        requesterUserId,
      },
      include: {
        listing: {
          select: {
            id: true,
            status: true,
            currentState: true,
            currentCity: true,
            currentArea: true,
            currentType: true,
            currentRent: true,
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
        requesterListing: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      totalRequests: interests.length,
      requests: interests.map((interest) => ({
        interestId: interest.id,
        status: interest.status,
        createdAt: interest.createdAt,
        expiresAt: interest.expiresAt,
        listing: {
          id: interest.listing.id,
          status: interest.listing.status,
          currentState: interest.listing.currentState,
          currentCity: interest.listing.currentCity,
          currentArea: interest.listing.currentArea,
          currentType: interest.listing.currentType,
          currentRent: interest.listing.currentRent,
        },
        owner: {
          id: interest.listing.user.id,
          fullName: interest.listing.user.fullName,
          phone:
            interest.status === 'CONTACT_APPROVED' ||
            interest.status === 'CONFIRMED_RENTER'
              ? interest.listing.user.phone
              : null,
        },
        requesterListingId: interest.requesterListing.id,
      })),
    };
  }

  async approveInterest(interestId: string, ownerUserId: string) {
    await this.sweepLifecycle();

    const interest = await this.prisma.listingInterest.findUnique({
      where: { id: interestId },
      include: {
        listing: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
        requesterListing: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!interest) {
      throw new BadRequestException('Interest request not found');
    }

    if (interest.listing.userId !== ownerUserId) {
      throw new UnauthorizedException(
        'You can only approve your own listing requests',
      );
    }

    if (interest.status === 'CONTACT_APPROVED') {
      return {
        success: true,
        status: interest.status,
        interestId: interest.id,
        ownerContact: {
          fullName: interest.listing.user.fullName,
          phone: interest.listing.user.phone,
        },
      };
    }

    if (interest.status !== 'REQUESTED') {
      throw new BadRequestException(
        `This request cannot be approved from status ${interest.status}`,
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.listingInterest.update({
        where: { id: interest.id },
        data: { status: 'CONTACT_APPROVED', respondedAt: new Date() },
      }),
      // Increment the requester's unlocked contact count (Option 1: initiator only)
      this.prisma.user.update({
        where: { id: interest.requesterUserId },
        data: { contactsUnlocked: { increment: 1 } },
      }),
    ]);

    await this.notificationService.notifyMany([
      {
        userId: interest.requesterUserId,
        type: 'INTEREST_APPROVED',
        title: 'Contact Approved',
        message: `${interest.listing.user.fullName} approved your request. You can now contact them.`,
        channels: ['IN_APP', 'EMAIL', 'SMS'],
        payload: {
          interestId: interest.id,
          listingId: interest.listingId,
          ownerPhone: interest.listing.user.phone,
        },
      },
      {
        userId: ownerUserId,
        type: 'INTEREST_APPROVED',
        title: 'Contact Shared',
        message: `You approved contact for ${interest.requesterListing.user.fullName}.`,
        channels: ['IN_APP', 'EMAIL', 'SMS'],
        payload: {
          interestId: interest.id,
          requesterPhone: interest.requesterListing.user.phone,
        },
      },
    ]);

    return {
      success: true,
      status: updated.status,
      interestId: updated.id,
      ownerContact: {
        fullName: interest.listing.user.fullName,
        phone: interest.listing.user.phone,
      },
    };
  }

  async declineInterest(interestId: string, ownerUserId: string) {
    await this.sweepLifecycle();

    const interest = await this.prisma.listingInterest.findUnique({
      where: { id: interestId },
      include: {
        listing: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
        requesterListing: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!interest) {
      throw new BadRequestException('Interest request not found');
    }

    if (interest.listing.userId !== ownerUserId) {
      throw new UnauthorizedException(
        'You can only decline your own listing requests',
      );
    }

    if (interest.status === 'DECLINED') {
      return {
        success: true,
        status: interest.status,
      };
    }

    if (!OPEN_INTEREST_STATUSES.includes(interest.status)) {
      throw new BadRequestException(
        `This request cannot be declined from status ${interest.status}`,
      );
    }

    const updated = await this.prisma.listingInterest.update({
      where: { id: interest.id },
      data: {
        status: 'DECLINED',
        respondedAt: new Date(),
      },
    });

    await this.notificationService.notifyMany([
      {
        userId: interest.requesterUserId,
        type: 'INTEREST_DECLINED',
        title: 'Request Declined',
        message: `${interest.listing.user.fullName} declined your request.`,
        channels: ['IN_APP', 'EMAIL', 'SMS'],
        payload: {
          interestId: interest.id,
          listingId: interest.listingId,
        },
      },
      {
        userId: ownerUserId,
        type: 'INTEREST_DECLINED',
        title: 'Request Declined',
        message: `You declined ${interest.requesterListing.user.fullName}.`,
        channels: ['IN_APP', 'EMAIL', 'SMS'],
        payload: {
          interestId: interest.id,
        },
      },
    ]);

    return {
      success: true,
      status: updated.status,
    };
  }

  private async getInterestForConfirmation(
    interestId: string,
  ): Promise<InterestForConfirmation | null> {
    return this.prisma.listingInterest.findUnique({
      where: { id: interestId },
      select: {
        id: true,
        listingId: true,
        requesterListingId: true,
        requesterUserId: true,
        status: true,
        listing: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
        requesterListing: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  private async finalizeInterestConfirmation(
    interest: InterestForConfirmation,
    confirmedByUserId: string,
    confirmedByRole: ConfirmedByRole,
  ) {
    const now = new Date();
    const closeReason =
      confirmedByRole === 'WANTER' ? 'REQUESTER_CONFIRMED' : 'MATCH_CONFIRMED';

    const transition = await this.prisma.$transaction(async (tx) => {
      const releasedOnTarget = await tx.listingInterest.findMany({
        where: {
          listingId: interest.listingId,
          id: { not: interest.id },
          status: { in: OPEN_INTEREST_STATUSES },
        },
        select: {
          id: true,
          requesterUserId: true,
          requesterListingId: true,
        },
      });

      const releasedOnRequester = await tx.listingInterest.findMany({
        where: {
          requesterListingId: interest.requesterListingId,
          id: { not: interest.id },
          status: { in: OPEN_INTEREST_STATUSES },
        },
        select: {
          id: true,
          requesterUserId: true,
          requesterListingId: true,
        },
      });

      await tx.listingInterest.update({
        where: { id: interest.id },
        data: {
          status: 'CONFIRMED_RENTER',
          confirmedAt: now,
          confirmedByUserId,
          confirmedByRole,
          respondedAt: now,
          releasedAt: null,
          expiresAt: null,
        },
      });

      await tx.swapListing.update({
        where: { id: interest.listingId },
        data: {
          status: 'MATCHED',
          matchedInterestId: interest.id,
          matchedAt: now,
          expiresAt: null,
          closedAt: now,
          closeReason,
          closedByUserId: confirmedByUserId,
        },
      });

      await tx.swapListing.update({
        where: { id: interest.requesterListingId },
        data: {
          status: 'MATCHED',
          matchedInterestId: interest.id,
          matchedAt: now,
          expiresAt: null,
          closedAt: now,
          closeReason,
          closedByUserId: confirmedByUserId,
        },
      });

      if (releasedOnTarget.length > 0) {
        await tx.listingInterest.updateMany({
          where: {
            id: {
              in: releasedOnTarget.map((item) => item.id),
            },
          },
          data: {
            status: 'RELEASED',
            respondedAt: now,
            releasedAt: now,
            expiresAt: null,
          },
        });
      }

      if (releasedOnRequester.length > 0) {
        await tx.listingInterest.updateMany({
          where: {
            id: {
              in: releasedOnRequester.map((item) => item.id),
            },
          },
          data: {
            status: 'RELEASED',
            respondedAt: now,
            releasedAt: now,
            expiresAt: null,
          },
        });
      }

      return {
        releasedOnTarget,
        releasedOnRequester,
      };
    });

    const releasedMap = new Map<
      string,
      { requesterUserId: string; requesterListingId: string }
    >();

    for (const released of transition.releasedOnTarget) {
      releasedMap.set(released.id, {
        requesterUserId: released.requesterUserId,
        requesterListingId: released.requesterListingId,
      });
    }

    for (const released of transition.releasedOnRequester) {
      releasedMap.set(released.id, {
        requesterUserId: released.requesterUserId,
        requesterListingId: released.requesterListingId,
      });
    }

    const releasedEntries = [...releasedMap.values()];

    const ownerMessage =
      confirmedByRole === 'WANTER'
        ? `${interest.requesterListing.user.fullName} reported they have taken your apartment.`
        : `You confirmed ${interest.requesterListing.user.fullName} as renter for this listing.`;

    const requesterMessage =
      confirmedByRole === 'WANTER'
        ? 'You confirmed that you have secured this apartment.'
        : `${interest.listing.user.fullName} confirmed you as renter for the apartment.`;

    await this.notificationService.notifyMany([
      {
        userId: interest.listing.userId,
        type: 'RENTER_CONFIRMED',
        title: 'Apartment Confirmed',
        message: ownerMessage,
        channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
        payload: {
          interestId: interest.id,
          listingId: interest.listingId,
          confirmedByRole,
        },
      },
      {
        userId: interest.requesterUserId,
        type: 'RENTER_CONFIRMED',
        title: 'Apartment Confirmed',
        message: requesterMessage,
        channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
        payload: {
          interestId: interest.id,
          listingId: interest.listingId,
          ownerPhone: interest.listing.user.phone,
          confirmedByRole,
        },
      },
      ...releasedEntries.map((released) => ({
        userId: released.requesterUserId,
        type: 'REQUEST_RELEASED',
        title: 'Request Released',
        message:
          'This apartment has been confirmed for another renter. Matching has been rerun for you.',
        channels: ['IN_APP', 'EMAIL'] as const,
        payload: {
          listingId: interest.listingId,
        },
      })),
    ]);

    const releasedListingIds = releasedEntries.map(
      (entry) => entry.requesterListingId,
    );

    const rerun = releasedListingIds.length
      ? await this.rerunListingsForMembers(
          releasedListingIds,
          `confirm-renter:${interest.id}`,
        )
      : {
          triggered: 0,
          succeeded: 0,
          failed: 0,
        };

    const chainConflict = await this.breakChainsForListings(
      [interest.listingId, interest.requesterListingId],
      'SYSTEM',
      confirmedByUserId,
    );

    return {
      success: true,
      status: 'CONFIRMED_RENTER',
      releasedCount: releasedEntries.length,
      rerun,
      chainConflict,
      confirmedByRole,
    };
  }

  async confirmRenter(interestId: string, ownerUserId: string) {
    await this.sweepLifecycle();

    const interest = await this.getInterestForConfirmation(interestId);

    if (!interest) {
      throw new BadRequestException('Interest request not found');
    }

    if (interest.listing.userId !== ownerUserId) {
      throw new UnauthorizedException(
        'You can only confirm renter for your own listing',
      );
    }

    if (interest.status === 'CONFIRMED_RENTER') {
      return {
        success: true,
        status: interest.status,
        releasedCount: 0,
      };
    }

    if (!OPEN_INTEREST_STATUSES.includes(interest.status)) {
      throw new BadRequestException(
        `This request cannot be confirmed from status ${interest.status}`,
      );
    }

    return this.finalizeInterestConfirmation(interest, ownerUserId, 'LISTER');
  }

  async confirmTakenByRequester(interestId: string, requesterUserId: string) {
    await this.sweepLifecycle();

    const interest = await this.getInterestForConfirmation(interestId);

    if (!interest) {
      throw new BadRequestException('Interest request not found');
    }

    if (interest.requesterUserId !== requesterUserId) {
      throw new UnauthorizedException(
        'You can only confirm your own approved request',
      );
    }

    if (interest.status === 'CONFIRMED_RENTER') {
      return {
        success: true,
        status: interest.status,
        releasedCount: 0,
      };
    }

    if (interest.status !== 'CONTACT_APPROVED') {
      throw new BadRequestException(
        'You can only confirm after the listing owner approves contact',
      );
    }

    return this.finalizeInterestConfirmation(
      interest,
      requesterUserId,
      'WANTER',
    );
  }

  /* ---------------------------- chain accept/decline ---------------------------- */

  async acceptChain(chainId: string, userId: string) {
    await this.sweepLifecycle();

    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: {
        members: true,
      },
    });

    if (!chain) {
      throw new BadRequestException('Chain not found');
    }

    const member = chain.members.find(
      (chainMember) => chainMember.userId === userId,
    );
    if (!member) {
      throw new BadRequestException('You are not a member of this chain');
    }

    if (chain.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING chains can be accepted');
    }

    const now = Date.now();
    if (chain.acceptBy && chain.acceptBy.getTime() < now) {
      await this.breakChainAndRecover(chainId, 'EXPIRED', {
        actorType: 'SYSTEM',
        rerunMembers: true,
      });

      throw new BadRequestException(
        'This chain has expired and was marked BROKEN',
      );
    }

    await this.prisma.swapChainMember.update({
      where: { id: member.id },
      data: { hasAccepted: true },
    });

    const members = await this.prisma.swapChainMember.findMany({
      where: { chainId },
      select: { hasAccepted: true, userId: true },
    });

    const allAccepted = members.every((chainMember) => chainMember.hasAccepted);

    if (allAccepted) {
      await this.prisma.swapChain.update({
        where: { id: chainId },
        data: { status: 'LOCKED', acceptBy: null },
      });

      await this.notificationService.notifyMany(
        members.map((chainMember) => ({
          userId: chainMember.userId,
          chainId,
          type: 'CHAIN_LOCKED',
          title: 'Chain Locked',
          message:
            'All members accepted. Your chain is now LOCKED and ready for contact unlock.',
          channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
        })),
      );
    }

    return { success: true, allAccepted };
  }

  async declineChain(chainId: string, userId: string) {
    await this.sweepLifecycle();

    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: { members: true },
    });

    if (!chain) {
      throw new BadRequestException('Chain not found');
    }

    const isMember = chain.members.some((member) => member.userId === userId);
    if (!isMember) {
      throw new BadRequestException('You are not a member of this chain');
    }

    const outcome = await this.breakChainAndRecover(chainId, 'DECLINED', {
      actorType: 'USER',
      actorUserId: userId,
      rerunMembers: true,
    });

    await this.reliabilityService.recordCancellation(userId, {
      reason: 'User declined a chain',
      metadata: {
        chainId,
      },
    });

    return {
      success: true,
      status: 'BROKEN',
      rerun: outcome.rerun,
    };
  }

  /* ---------------------------- admin controls ---------------------------- */

  async breakChainByAdmin(
    chainId: string,
    adminUserId: string,
    reason: ChainBreakReason,
    offenderUserId?: string,
  ) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new UnauthorizedException('Admin access required');
    }

    const outcome = await this.breakChainAndRecover(chainId, reason, {
      actorType: 'ADMIN',
      actorUserId: adminUserId,
      rerunMembers: true,
    });

    if (reason === 'NO_SHOW' && offenderUserId) {
      await this.reliabilityService.recordNoShow(offenderUserId, adminUserId, {
        reason: 'Admin marked user as no-show on chain break',
        metadata: {
          chainId,
          reason,
        },
      });
    }

    return {
      success: true,
      status: 'BROKEN',
      reason,
      rerun: outcome.rerun,
      changed: outcome.changed,
    };
  }

  async rerunChainMembersByAdmin(chainId: string, adminUserId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new UnauthorizedException('Admin access required');
    }

    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: {
        members: {
          select: {
            listingId: true,
            userId: true,
          },
        },
      },
    });

    if (!chain) {
      throw new BadRequestException('Chain not found');
    }

    const rerun = await this.rerunListingsForMembers(
      chain.members.map((member) => member.listingId),
      chainId,
    );

    await this.notificationService.notifyMany(
      chain.members.map((member) => ({
        userId: member.userId,
        chainId,
        type: 'MATCH_RERUN',
        title: 'Matching Rerun',
        message: 'Matching has been rerun for your listing by support.',
        channels: ['IN_APP', 'EMAIL'] as const,
        payload: {
          rerunBy: adminUserId,
        },
      })),
    );

    return {
      success: true,
      rerun,
    };
  }

  /* ---------------------------- contact unlock ---------------------------- */

  async requestContactUnlock(chainId: string, userId: string) {
    await this.sweepLifecycle();

    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: { members: true },
    });

    if (!chain) throw new BadRequestException('Chain not found');

    const isMember = chain.members.some((member) => member.userId === userId);
    if (!isMember)
      throw new BadRequestException('You are not a member of this chain');

    if (chain.status !== 'LOCKED') {
      throw new BadRequestException(
        'Chain must be LOCKED before unlocking contacts',
      );
    }

    const unlock = await this.prisma.contactUnlock.create({
      data: {
        chainId,
        requesterUserId: userId,
      },
    });

    await this.prisma.contactUnlockApproval.create({
      data: {
        contactUnlockId: unlock.id,
        approverUserId: userId,
        approved: true,
      },
    });

    return { success: true, unlockId: unlock.id };
  }

  async approveContactUnlock(unlockId: string, userId: string) {
    const unlock = await this.prisma.contactUnlock.findUnique({
      where: { id: unlockId },
      include: { chain: { include: { members: true } }, approvals: true },
    });

    if (!unlock) throw new BadRequestException('Unlock request not found');

    const isMember = unlock.chain.members.some(
      (member) => member.userId === userId,
    );
    if (!isMember)
      throw new BadRequestException('You are not a member of this chain');

    await this.prisma.contactUnlockApproval.upsert({
      where: {
        contactUnlockId_approverUserId: {
          contactUnlockId: unlockId,
          approverUserId: userId,
        },
      },
      update: { approved: true },
      create: {
        contactUnlockId: unlockId,
        approverUserId: userId,
        approved: true,
      },
    });

    // Notify the other chain members that this user approved the unlock
    const approver = unlock.chain.members.find((m) => m.userId === userId);
    const approverName = approver ? await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    }).then((u) => u?.fullName ?? 'A member') : 'A member';

    const otherMemberUserIds = unlock.chain.members
      .filter((m) => m.userId !== userId)
      .map((m) => m.userId);

    if (otherMemberUserIds.length > 0) {
      await this.notificationService.notifyMany(
        otherMemberUserIds.map((recipientId) => ({
          userId: recipientId,
          type: 'CONTACT_UNLOCK_APPROVED',
          title: 'Number Unlocked',
          message: `${approverName} has unlocked their phone number for your chain.`,
          channels: ['IN_APP', 'EMAIL', 'SMS'] as const,
          payload: { chainId: unlock.chainId, unlockId },
        })),
      );
    }

    return { success: true };
  }
}
