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
};

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /* ---------------------------- scoring ---------------------------- */

  private computeTimelineScore(a: ListingNode, b: ListingNode) {
    const diffDays = Math.abs(
      (new Date(a.availableOn).getTime() - new Date(b.availableOn).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (diffDays <= 30) return 30;
    if (diffDays <= 60) return 20;
    if (diffDays <= 90) return 10;
    return 0;
  }

  private computeScore(a: ListingNode, b: ListingNode) {
    const cityScore = a.desiredCity === b.currentCity ? 30 : 0;
    const typeScore = a.desiredType === b.currentType ? 20 : 0;

    let budgetScore = 0;
    if (a.maxBudget >= b.currentRent && a.maxBudget > 0) {
      const ratio = b.currentRent / a.maxBudget; // 0..1
      budgetScore = Math.round(30 * (1 - ratio));
      if (budgetScore < 0) budgetScore = 0;
    }

    const timelineScore = this.computeTimelineScore(a, b);

    const totalScore = cityScore + typeScore + budgetScore + timelineScore;

    return {
      cityScore,
      typeScore,
      budgetScore,
      timelineScore,
      totalScore: Math.min(100, totalScore),
    };
  }

  /* ---------------------------- graph ---------------------------- */

  private buildGraph(listings: ListingNode[]) {
    const graph = new Map<string, Edge[]>();

    for (const a of listings) {
      const edges: Edge[] = [];

      for (const b of listings) {
        if (a.id === b.id) continue;

        // MVP strict compatibility (edge existence)
        const ok =
          a.desiredCity === b.currentCity &&
          a.desiredType === b.currentType &&
          a.maxBudget >= b.currentRent;

        if (!ok) continue;

        const scoreData = this.computeScore(a, b);
        edges.push({ to: b.id, ...scoreData });
      }

      graph.set(a.id, edges);
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

      for (const e of edges) {
        const next = e.to;

        // ✅ allow DIRECT match (2-way) + circular (3/4)
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
        const edge = (graph.get(from) ?? []).find((x) => x.to === to);
        total += edge?.totalScore ?? 0;
      }

      const avg = Math.round(total / cycle.length);
      return { cycle, avg };
    });

    // prefer higher avg
    scored.sort((a, b) => b.avg - a.avg);
    return scored[0] ?? null;
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

    // Pull all ACTIVE listings
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
      },
    });

    const graph = this.buildGraph(listings);

    // store candidates
    const edgeWrites: Prisma.PrismaPromise<unknown>[] = [];
    for (const [fromId, edges] of graph.entries()) {
      for (const e of edges) {
        edgeWrites.push(
          this.prisma.matchCandidate.upsert({
            where: {
              fromListingId_toListingId: {
                fromListingId: fromId,
                toListingId: e.to,
              },
            },
            update: {
              cityScore: e.cityScore,
              typeScore: e.typeScore,
              budgetScore: e.budgetScore,
              timelineScore: e.timelineScore,
              totalScore: e.totalScore,
            },
            create: {
              fromListingId: fromId,
              toListingId: e.to,
              cityScore: e.cityScore,
              typeScore: e.typeScore,
              budgetScore: e.budgetScore,
              timelineScore: e.timelineScore,
              totalScore: e.totalScore,
            },
          }),
        );
      }
    }
    if (edgeWrites.length) await this.prisma.$transaction(edgeWrites);

    // find cycles from current listing (2..4)
    const cycles = this.findCyclesFrom(listingId, graph, 4);

    if (cycles.length === 0) {
      const tips = this.aiService.suggestNoMatch({
        desiredCity: listing.desiredCity,
        desiredType: listing.desiredType,
        maxBudget: listing.maxBudget,
        timeline: listing.timeline,
      });

      return {
        found: false,
        message: 'No chain found yet.',
        aiSuggestions: tips,
      };
    }

    // prefer smaller cycle first (2-way direct match, then 3, then 4)
    cycles.sort((a, b) => a.length - b.length);
    const shortestLen = cycles[0].length;
    const shortestGroup = cycles.filter((c) => c.length === shortestLen);

    const best = this.pickBestCycle(shortestGroup, graph);
    if (!best) {
      return {
        found: false,
        message: 'Cycle detection returned no best cycle.',
      };
    }

    const { cycle, avg } = best;

    // ✅ canonical hash prevents mirrored duplicates
    const canonical = [...cycle].sort().join('-');

    const existingChain = await this.prisma.swapChain.findUnique({
      where: { cycleHash: canonical },
      select: { id: true, status: true },
    });

    if (existingChain) {
      return {
        found: false,
        message: 'This chain already exists.',
        chainId: existingChain.id,
        status: existingChain.status,
      };
    }

    // prevent locking conflicts (any listing already in LOCKED chain)
    const existingMembers = await this.prisma.swapChainMember.findMany({
      where: { listingId: { in: cycle }, chain: { status: 'LOCKED' } },
      select: { listingId: true, chainId: true },
    });

    if (existingMembers.length > 0) {
      return {
        found: false,
        message:
          'A potential chain exists but one or more listings are already locked in another chain.',
      };
    }

    const chainType = cycle.length === 2 ? 'DIRECT' : 'CIRCULAR';

    const listingById = new Map(listings.map((x) => [x.id, x] as const));

    // Create chain (PENDING) + members (hasAccepted false)
    const chain = await this.prisma.swapChain.create({
      data: {
        cycleSize: cycle.length,
        avgScore: avg,
        status: 'PENDING',
        type: chainType,
        cycleHash: canonical,
        members: {
          create: cycle.map((id, index) => {
            const u = listingById.get(id);
            if (!u) {
              throw new BadRequestException(
                `Listing ${id} was not found in active listing set`,
              );
            }
            return {
              listingId: id,
              userId: u.userId,
              position: index,
              hasAccepted: false,
            };
          }),
        },
      },
      include: { members: true },
    });

    return {
      found: true,
      message:
        chainType === 'DIRECT'
          ? 'Direct match found! Awaiting confirmations.'
          : 'Circular chain found! Awaiting confirmations.',
      chain,
      badge: chainType, // frontend shows Direct Match badge if DIRECT
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
