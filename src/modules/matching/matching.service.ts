import {
  BadRequestException,
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
import { AiService } from './ai.service';
import { NotificationService } from './notification.service';

type Edge = {
  to: string;
  cityScore: number;
  typeScore: number;
  budgetScore: number;
  timelineScore: number;
  featureScore: number;
  reciprocityBonus: number;
  rankScore: number;
  isMutual: boolean;
  totalScore: number;
};

type ListingNode = {
  id: string;
  userId: string;
  desiredCity: string;
  desiredType: string;
  maxBudget: number;
  timeline: string;
  currentCity: string;
  currentType: string;
  currentRent: number;
  availableOn: Date;
  features: string[];
};

type Recommendation = {
  listingId: string;
  userId: string | null;
  currentCity: string | null;
  currentType: string | null;
  currentRent: number | null;
  availableOn: Date | null;
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
};

type SweepTrigger = 'REQUEST' | 'SYSTEM_SWEEP' | 'ADMIN_SWEEP';

type RerunSummary = {
  triggered: number;
  succeeded: number;
  failed: number;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationService: NotificationService,
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
  }

  /* ---------------------------- scoring ---------------------------- */

  private normalize(value: string) {
    return value.trim().toLowerCase();
  }

  private computeLocationScore(desiredCity: string, currentCity: string) {
    const desired = this.normalize(desiredCity);
    const current = this.normalize(currentCity);

    if (desired === current) return 30;

    const desiredTokens = desired.split(/[,\-/\s]+/).filter(Boolean);
    const currentTokens = new Set(current.split(/[,\-/\s]+/).filter(Boolean));
    const shareToken = desiredTokens.some((token) => currentTokens.has(token));

    return shareToken ? 15 : 0;
  }

  private computeTypeScore(desiredType: string, currentType: string) {
    const desired = this.normalize(desiredType);
    const current = this.normalize(currentType);

    if (desired === current) return 30;
    if (desired.includes(current) || current.includes(desired)) return 15;

    return 0;
  }

  private computeBudgetScore(maxBudget: number, currentRent: number) {
    if (maxBudget <= 0 || currentRent <= 0) return 0;
    if (maxBudget < currentRent) return 0;

    const ratio = currentRent / maxBudget;
    const score = Math.round(25 * (1 - ratio));
    return Math.max(0, Math.min(25, score));
  }

  private computeTimelineScore(a: ListingNode, b: ListingNode) {
    const diffDays = Math.abs(
      (new Date(a.availableOn).getTime() - new Date(b.availableOn).getTime()) /
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

  private computeScore(a: ListingNode, b: ListingNode) {
    const cityScore = this.computeLocationScore(a.desiredCity, b.currentCity);
    const typeScore = this.computeTypeScore(a.desiredType, b.currentType);
    const budgetScore = this.computeBudgetScore(a.maxBudget, b.currentRent);
    const timelineScore = this.computeTimelineScore(a, b);
    const featureScore = this.computeFeatureScore(a, b);

    const totalScore =
      cityScore + typeScore + budgetScore + timelineScore + featureScore;

    return {
      cityScore,
      typeScore,
      budgetScore,
      timelineScore,
      featureScore,
      reciprocityBonus: 0,
      rankScore: Math.min(100, totalScore),
      isMutual: false,
      totalScore: Math.min(100, totalScore),
    };
  }

  private isEdgeCompatible(a: ListingNode, b: ListingNode) {
    const typeScore = this.computeTypeScore(a.desiredType, b.currentType);
    if (typeScore === 0) return false;

    return a.maxBudget >= b.currentRent;
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
        currentCity: target?.currentCity ?? null,
        currentType: target?.currentType ?? null,
        currentRent: target?.currentRent ?? null,
        availableOn: target?.availableOn ?? null,
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

    await this.expirePendingChains('REQUEST');
    await this.expireListingInterests('REQUEST');
  }

  private computeAcceptByDate() {
    const durationMs = this.chainAcceptTtlHours * 60 * 60 * 1000;
    return new Date(Date.now() + durationMs);
  }

  private computeInterestExpiresAt() {
    const durationMs = this.interestRequestTtlHours * 60 * 60 * 1000;
    return new Date(Date.now() + durationMs);
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

    const myListing = await this.prisma.swapListing.findFirst({
      where: { userId, status: 'ACTIVE' },
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
        desiredCity: true,
        desiredType: true,
        maxBudget: true,
        timeline: true,
        currentCity: true,
        currentType: true,
        currentRent: true,
        availableOn: true,
        features: true,
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

    const listings = await this.prisma.swapListing.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        userId: true,
        desiredCity: true,
        desiredType: true,
        maxBudget: true,
        timeline: true,
        currentCity: true,
        currentType: true,
        currentRent: true,
        availableOn: true,
        features: true,
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
        desiredCity: listing.desiredCity,
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
          currentCity: listing?.currentCity ?? null,
          currentType: listing?.currentType ?? null,
          currentRent: listing?.currentRent ?? null,
          desiredCity: listing?.desiredCity ?? null,
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
  ) {
    await this.sweepLifecycle();

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

    if (targetListing.status !== 'ACTIVE') {
      throw new BadRequestException('Target listing is no longer active');
    }

    if (targetListing.userId === requesterUserId) {
      throw new BadRequestException('You cannot request your own listing');
    }

    const requesterListing = requesterListingId
      ? await this.prisma.swapListing.findFirst({
          where: {
            id: requesterListingId,
            userId: requesterUserId,
            status: 'ACTIVE',
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
          where: {
            userId: requesterUserId,
            status: 'ACTIVE',
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

    if (requesterListing.id === targetListing.id) {
      throw new BadRequestException('Invalid request for same listing');
    }

    const requesterNode: ListingNode = {
      id: requesterListing.id,
      userId: requesterListing.userId,
      desiredCity: requesterListing.desiredCity,
      desiredType: requesterListing.desiredType,
      maxBudget: requesterListing.maxBudget,
      timeline: requesterListing.timeline,
      currentCity: requesterListing.currentCity,
      currentType: requesterListing.currentType,
      currentRent: requesterListing.currentRent,
      availableOn: requesterListing.availableOn,
      features: requesterListing.features,
    };

    const targetNode: ListingNode = {
      id: targetListing.id,
      userId: targetListing.userId,
      desiredCity: targetListing.desiredCity,
      desiredType: targetListing.desiredType,
      maxBudget: targetListing.maxBudget,
      timeline: targetListing.timeline,
      currentCity: targetListing.currentCity,
      currentType: targetListing.currentType,
      currentRent: targetListing.currentRent,
      availableOn: targetListing.availableOn,
      features: targetListing.features,
    };

    if (!this.isEdgeCompatible(requesterNode, targetNode)) {
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
        payload: {
          interestId: interest.id,
          listingId: targetListing.id,
          requesterListingId: requesterListing.id,
        },
      },
      {
        userId: requesterUserId,
        type: 'INTEREST_REQUESTED',
        title: 'Request Sent',
        message: `Your request was sent to ${targetListing.user.fullName}.`,
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
            currentCity: true,
            currentType: true,
            currentRent: true,
            createdAt: true,
          },
        },
        requesterListing: {
          select: {
            id: true,
            desiredCity: true,
            desiredType: true,
            maxBudget: true,
            timeline: true,
            currentCity: true,
            currentType: true,
            currentRent: true,
            availableOn: true,
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
        currentCity: string;
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
          currentCity: interest.listing.currentCity,
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
            currentCity: true,
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
          currentCity: interest.listing.currentCity,
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

    const updated = await this.prisma.listingInterest.update({
      where: { id: interest.id },
      data: {
        status: 'CONTACT_APPROVED',
        respondedAt: new Date(),
      },
    });

    await this.notificationService.notifyMany([
      {
        userId: interest.requesterUserId,
        type: 'INTEREST_APPROVED',
        title: 'Contact Approved',
        message: `${interest.listing.user.fullName} approved your request. You can now contact them.`,
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

  async confirmRenter(interestId: string, ownerUserId: string) {
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

    const now = new Date();

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
        },
      });

      await tx.swapListing.update({
        where: { id: interest.requesterListingId },
        data: {
          status: 'MATCHED',
          matchedAt: now,
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

    await this.notificationService.notifyMany([
      {
        userId: ownerUserId,
        type: 'RENTER_CONFIRMED',
        title: 'Confirmed Renter',
        message: `You confirmed ${interest.requesterListing.user.fullName} as renter for this listing.`,
        payload: {
          interestId: interest.id,
          listingId: interest.listingId,
        },
      },
      {
        userId: interest.requesterUserId,
        type: 'RENTER_CONFIRMED',
        title: 'Apartment Confirmed',
        message: `${interest.listing.user.fullName} confirmed you as renter for the apartment.`,
        payload: {
          interestId: interest.id,
          listingId: interest.listingId,
          ownerPhone: interest.listing.user.phone,
        },
      },
      ...releasedEntries.map((released) => ({
        userId: released.requesterUserId,
        type: 'REQUEST_RELEASED',
        title: 'Request Released',
        message:
          'This apartment has been confirmed for another renter. Matching has been rerun for you.',
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
      ownerUserId,
    );

    return {
      success: true,
      status: 'CONFIRMED_RENTER',
      releasedCount: releasedEntries.length,
      rerun,
      chainConflict,
    };
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

    return { success: true };
  }
}
