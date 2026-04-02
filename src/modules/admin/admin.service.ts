import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Users ───────────────────────────────────────────────────────────────────

  async listUsers(opts: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    suspended?: boolean;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (opts.search) {
      const q = opts.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (opts.role) {
      where.role = opts.role;
    }

    if (opts.suspended === true) {
      where.blockedUntil = { gt: new Date() };
    } else if (opts.suspended === false) {
      where.OR = [{ blockedUntil: null }, { blockedUntil: { lte: new Date() } }];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          reliabilityScore: true,
          blockedUntil: true,
          cooldownUntil: true,
          subscriptionStatus: true,
          onboardingComplete: true,
          phoneVerifiedAt: true,
          createdAt: true,
          _count: { select: { listings: true } },
        },
      }),
    ]);

    return {
      items: users,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        phoneVerifiedAt: true,
        role: true,
        gender: true,
        occupation: true,
        profilePhotoUrl: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        blockedUntil: true,
        cooldownUntil: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        onboardingComplete: true,
        nin: true,
        ninVerifiedAt: true,
        workplaceName: true,
        workplaceCity: true,
        workplaceState: true,
        createdAt: true,
        listings: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            listingType: true,
            seekerCategory: true,
            verificationStatus: true,
            desiredType: true,
            desiredState: true,
            desiredCity: true,
            currentType: true,
            currentState: true,
            currentCity: true,
            maxBudget: true,
            timeline: true,
            createdAt: true,
          },
        },
        reliabilityEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            eventType: true,
            scoreDelta: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(userId: string, dto: { fullName?: string; role?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const data: any = {};
    if (dto.fullName) data.fullName = dto.fullName.trim();
    if (dto.role) data.role = dto.role;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, fullName: true, role: true, email: true, phone: true },
    });

    return { message: 'User updated', user: updated };
  }

  async suspendUser(userId: string, hours = 720) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const blockedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { blockedUntil },
    });

    return { message: `User suspended until ${blockedUntil.toISOString()}` };
  }

  // ─── Listings ─────────────────────────────────────────────────────────────────

  async listListings(opts: {
    page?: number;
    limit?: number;
    status?: string;
    listingType?: string;
    verificationStatus?: string;
    search?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.listingType) where.listingType = opts.listingType;
    if (opts.verificationStatus) where.verificationStatus = opts.verificationStatus;

    if (opts.search) {
      const q = opts.search.trim();
      where.user = {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [total, listings] = await Promise.all([
      this.prisma.swapListing.count({ where }),
      this.prisma.swapListing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          listingType: true,
          seekerCategory: true,
          verificationStatus: true,
          desiredType: true,
          desiredState: true,
          desiredCity: true,
          desiredArea: true,
          currentType: true,
          currentState: true,
          currentCity: true,
          maxBudget: true,
          timeline: true,
          createdAt: true,
          expiresAt: true,
          user: {
            select: { id: true, fullName: true, phone: true, email: true },
          },
        },
      }),
    ]);

    return {
      items: listings,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getListingById(listingId: string) {
    const listing = await this.prisma.swapListing.findUnique({
      where: { id: listingId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            reliabilityScore: true,
            blockedUntil: true,
          },
        },
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async closeListingByAdmin(adminId: string, listingId: string, reason?: string) {
    const listing = await this.prisma.swapListing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status === 'CLOSED') throw new BadRequestException('Listing is already closed');

    const updated = await this.prisma.swapListing.update({
      where: { id: listingId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closeReason: 'ADMIN_CLOSED',
        closedByUserId: adminId,
      },
    });

    return { message: 'Listing closed by admin', listing: updated };
  }

  // ─── Chains ───────────────────────────────────────────────────────────────────

  async listChains(opts: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.status) where.status = opts.status;

    const [total, chains] = await Promise.all([
      this.prisma.swapChain.count({ where }),
      this.prisma.swapChain.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          type: true,
          cycleSize: true,
          avgScore: true,
          acceptBy: true,
          brokenReason: true,
          brokenAt: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      }),
    ]);

    return {
      items: chains,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getChainById(chainId: string) {
    const chain = await this.prisma.swapChain.findUnique({
      where: { id: chainId },
      include: {
        members: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            hasAccepted: true,
            userId: true,
            listingId: true,
          },
        },
      },
    });

    if (!chain) throw new NotFoundException('Chain not found');

    // Enrich members with user + listing data
    const userIds = chain.members.map((m) => m.userId);
    const listingIds = chain.members.map((m) => m.listingId);

    const [users, listings] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, phone: true, email: true },
      }),
      this.prisma.swapListing.findMany({
        where: { id: { in: listingIds } },
        select: {
          id: true,
          status: true,
          listingType: true,
          desiredType: true,
          desiredState: true,
          desiredCity: true,
          currentType: true,
          currentState: true,
          currentCity: true,
          maxBudget: true,
        },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const enrichedMembers = chain.members.map((m) => ({
      ...m,
      user: userMap.get(m.userId) ?? null,
      listing: listingMap.get(m.listingId) ?? null,
    }));

    return { ...chain, members: enrichedMembers };
  }

  // ─── Verifications (all, not just pending) ────────────────────────────────────

  async listVerifications(opts: {
    page?: number;
    limit?: number;
    status?: string;
    category?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {
      listingType: 'SEEKING',
      verificationStatus: { not: null },
    };

    if (opts.status) where.verificationStatus = opts.status;
    if (opts.category) where.seekerCategory = opts.category;

    const [total, rows] = await Promise.all([
      this.prisma.swapListing.count({ where }),
      this.prisma.swapListing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          seekerCategory: true,
          verificationStatus: true,
          verificationDocumentUrl: true,
          verificationNote: true,
          desiredType: true,
          desiredState: true,
          desiredCity: true,
          maxBudget: true,
          timeline: true,
          createdAt: true,
          user: {
            select: { id: true, fullName: true, phone: true, email: true, nin: true },
          },
        },
      }),
    ]);

    return {
      items: rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }
}
