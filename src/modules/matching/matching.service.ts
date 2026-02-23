import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AiService } from './ai.service';

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

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

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

    const ratio = currentRent / maxBudget; // 0..1
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

    // Reciprocity gets additional weight because it can produce direct swaps.
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
  ) {
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

    return {
      created: true,
      chainType,
      chain,
    };
  }

  /* ---------------------------- public API ---------------------------- */

  async runForUser(userId: string) {
    const myListing = await this.prisma.swapListing.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!myListing) {
      throw new BadRequestException(
        'You have no ACTIVE listing. Create one first.',
      );
    }

    return this.runForListing(myListing.id, userId);
  }

  async runForListing(listingId: string, userId?: string) {
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
          matchScenario: 'ONE_TO_MANY',
        };
      }

      return {
        found: false,
        message:
          'A direct match exists but one or more listings are currently locked in another chain.',
        recommendations,
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
        matchScenario: 'ONE_TO_MANY',
      };
    }

    if (!cycleOutcome.created && cycleOutcome.reason === 'lockedConflict') {
      return {
        found: false,
        message:
          'A potential chain exists but one or more listings are already locked in another chain.',
        recommendations,
        matchScenario: 'ONE_TO_MANY',
      };
    }

    if (!cycleOutcome.created) {
      return {
        found: false,
        message: 'Could not create a chain for this cycle.',
        recommendations,
      };
    }

    return {
      found: true,
      message: 'Circular chain found! Awaiting confirmations.',
      chain: cycleOutcome.chain,
      badge: cycleOutcome.chainType,
      recommendations,
      matchScenario: 'ONE_TO_MANY',
    };
  }

  async getMyChains(userId: string) {
    return this.prisma.swapChain.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
  }

  async getChainDetail(chainId: string, userId: string) {
    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: {
        members: { orderBy: { position: 'asc' } },
      },
    });

    if (!chain) throw new BadRequestException('Chain not found');

    const isMember = chain.members.some((m) => m.userId === userId);
    if (!isMember)
      throw new BadRequestException('You are not a member of this chain');

    const listingIds = chain.members.map((m) => m.listingId);
    const listings = await this.prisma.swapListing.findMany({
      where: { id: { in: listingIds } },
      include: { user: true },
    });

    const listingById = new Map(listings.map((l) => [l.id, l] as const));

    // check if contacts are unlocked for this chain
    const unlock = await this.prisma.contactUnlock.findFirst({
      where: { chainId },
      include: { approvals: true },
    });

    const memberUserIds = chain.members.map((m) => m.userId);
    const approvalsOk =
      unlock &&
      memberUserIds.every((uid) =>
        unlock.approvals.some((a) => a.approverUserId === uid),
      );

    return {
      id: chain.id,
      cycleSize: chain.cycleSize,
      avgScore: chain.avgScore,
      status: chain.status,
      type: chain.type,
      cycleHash: chain.cycleHash,
      members: chain.members.map((m) => {
        const l = listingById.get(m.listingId);
        return {
          listingId: m.listingId,
          position: m.position,
          hasAccepted: m.hasAccepted,
          fullName: l?.user.fullName ?? null,
          phone: approvalsOk ? (l?.user.phone ?? null) : null, // 🔒 hidden unless unlocked
          currentCity: l?.currentCity ?? null,
          currentType: l?.currentType ?? null,
          currentRent: l?.currentRent ?? null,
          desiredCity: l?.desiredCity ?? null,
        };
      }),
      contactUnlocked: Boolean(approvalsOk),
    };
  }

  /* ---------------------------- accept/decline ---------------------------- */

  async acceptChain(chainId: string, userId: string) {
    const member = await this.prisma.swapChainMember.findFirst({
      where: { chainId, userId },
    });

    if (!member)
      throw new BadRequestException('You are not a member of this chain');

    await this.prisma.swapChainMember.update({
      where: { id: member.id },
      data: { hasAccepted: true },
    });

    const members = await this.prisma.swapChainMember.findMany({
      where: { chainId },
      select: { hasAccepted: true },
    });

    const allAccepted = members.every((m) => m.hasAccepted);

    if (allAccepted) {
      await this.prisma.swapChain.update({
        where: { id: chainId },
        data: { status: 'LOCKED' },
      });
    }

    return { success: true, allAccepted };
  }

  async declineChain(chainId: string, userId: string) {
    const member = await this.prisma.swapChainMember.findFirst({
      where: { chainId, userId },
    });

    if (!member)
      throw new BadRequestException('You are not a member of this chain');

    await this.prisma.swapChain.update({
      where: { id: chainId },
      data: { status: 'BROKEN' },
    });

    return { success: true };
  }

  /* ---------------------------- contact unlock ---------------------------- */

  async requestContactUnlock(chainId: string, userId: string) {
    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: { members: true },
    });

    if (!chain) throw new BadRequestException('Chain not found');

    const isMember = chain.members.some((m) => m.userId === userId);
    if (!isMember)
      throw new BadRequestException('You are not a member of this chain');

    if (chain.status !== 'LOCKED') {
      throw new BadRequestException(
        'Chain must be LOCKED before unlocking contacts',
      );
    }

    // create unlock request
    const unlock = await this.prisma.contactUnlock.create({
      data: {
        chainId,
        requesterUserId: userId,
      },
    });

    // requester auto-approves
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

    const isMember = unlock.chain.members.some((m) => m.userId === userId);
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
