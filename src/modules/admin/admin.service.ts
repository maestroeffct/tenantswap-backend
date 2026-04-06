import * as bcrypt from 'bcrypt';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../../common/services/push.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

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
          viewCount: true,
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

    // Attach near-misses for SWAP ACTIVE listings
    let nearMisses: { id: string; currentType: string; currentCity: string; currentRent: number; desiredType: string; missReason: string }[] = [];
    if (listing.status === 'ACTIVE' && listing.listingType === 'SWAP') {
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
      for (const c of candidates) {
        const typeMatch = c.currentType.trim().toLowerCase() === desiredNorm ||
          c.currentType.trim().toLowerCase().includes(desiredNorm) ||
          desiredNorm.includes(c.currentType.trim().toLowerCase());
        const withinBudget = c.currentRent <= listing.maxBudget;
        const isAvailable = c.currentAvailable;
        if (typeMatch && withinBudget && isAvailable) continue;
        const missReason = !typeMatch ? 'wrong_type' : !withinBudget ? 'over_budget' : 'not_available';
        nearMisses.push({ id: c.id, currentType: c.currentType, currentCity: c.currentCity, currentRent: c.currentRent, desiredType: c.desiredType, missReason });
        if (nearMisses.length >= 5) break;
      }
    }

    return { ...listing, nearMisses };
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

  // ─── Near-miss breakdown ──────────────────────────────────────────────────────

  async getNearMissBreakdown() {
    const now = new Date();

    // Find all active SWAP listings that have zero match candidates
    const activeSwap = await this.prisma.swapListing.findMany({
      where: {
        status: 'ACTIVE',
        listingType: 'SWAP',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      select: {
        id: true,
        desiredState: true,
        desiredType: true,
        maxBudget: true,
      },
      take: 200,
    });

    // For each, count how many near-misses exist and why
    const breakdown = { wrong_type: 0, over_budget: 0, not_available: 0, no_near_miss: 0 };
    let withNearMiss = 0;
    let withFullMatch = 0;

    for (const listing of activeSwap) {
      const budgetCeiling = Math.round(listing.maxBudget * 1.3);
      const candidates = await this.prisma.swapListing.findMany({
        where: {
          id: { not: listing.id },
          status: 'ACTIVE',
          listingType: 'SWAP',
          currentState: { equals: listing.desiredState, mode: 'insensitive' },
          currentRent: { lte: budgetCeiling },
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          AND: [{ OR: [{ currentAvailableOn: null }, { currentAvailableOn: { gte: now } }] }],
        },
        select: { currentType: true, currentRent: true, currentAvailable: true },
        take: 10,
      });

      const desiredNorm = listing.desiredType.trim().toLowerCase();
      let foundFullMatch = false;
      let foundNearMiss = false;
      const missReasons = new Set<string>();

      for (const c of candidates) {
        const typeMatch = c.currentType.trim().toLowerCase() === desiredNorm ||
          c.currentType.trim().toLowerCase().includes(desiredNorm) ||
          desiredNorm.includes(c.currentType.trim().toLowerCase());
        const withinBudget = c.currentRent <= listing.maxBudget;
        const isAvailable = c.currentAvailable;
        if (typeMatch && withinBudget && isAvailable) { foundFullMatch = true; break; }
        if (!typeMatch) missReasons.add('wrong_type');
        else if (!withinBudget) missReasons.add('over_budget');
        else missReasons.add('not_available');
        foundNearMiss = true;
      }

      if (foundFullMatch) { withFullMatch++; continue; }
      if (!foundNearMiss) { breakdown.no_near_miss++; continue; }
      withNearMiss++;
      // Count the primary miss reason for this listing
      if (missReasons.has('wrong_type')) breakdown.wrong_type++;
      else if (missReasons.has('over_budget')) breakdown.over_budget++;
      else breakdown.not_available++;
    }

    return {
      total: activeSwap.length,
      withFullMatch,
      withNearMiss,
      noActivity: breakdown.no_near_miss,
      missReasons: {
        wrongType: breakdown.wrong_type,
        overBudget: breakdown.over_budget,
        notAvailable: breakdown.not_available,
      },
    };
  }

  // ─── Activity Feed ────────────────────────────────────────────────────────────

  async listActivity(opts: {
    limit?: number;
    offset?: number;
    type?: string;
    since?: string;
  }) {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
    const offset = Math.max(0, opts.offset ?? 0);
    const since = opts.since ? new Date(opts.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [users, listings, interests, chains, reliabilityEvents] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, fullName: true, email: true, createdAt: true },
      }),
      this.prisma.swapListing.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          listingType: true,
          currentType: true,
          desiredType: true,
          currentCity: true,
          desiredCity: true,
          createdAt: true,
          user: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.listingInterest.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          createdAt: true,
          requesterUserId: true,
          listing: {
            select: {
              id: true,
              userId: true,
              user: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.swapChain.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          cycleSize: true,
          createdAt: true,
        },
      }),
      this.prisma.reliabilityEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          eventType: true,
          scoreDelta: true,
          reason: true,
          createdAt: true,
          user: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    type ActivityEvent = {
      id: string;
      type: string;
      label: string;
      actor: string;
      meta: string;
      at: string;
    };

    const events: ActivityEvent[] = [];

    if (!opts.type || opts.type === 'user_registered') {
      events.push(...users.map((u) => ({
        id: `user:${u.id}`,
        type: 'user_registered',
        label: 'New User',
        actor: u.fullName,
        meta: u.email ?? '',
        at: u.createdAt.toISOString(),
      })));
    }

    if (!opts.type || opts.type === 'listing_created') {
      events.push(...listings.map((l) => ({
        id: `listing:${l.id}`,
        type: 'listing_created',
        label: l.listingType === 'SWAP' ? 'Listing Created (SWAP)' : 'Listing Created (SEEKING)',
        actor: l.user.fullName,
        meta: l.listingType === 'SWAP'
          ? `${l.currentType ?? '—'} → ${l.desiredType ?? '—'} (${l.currentCity ?? '—'})`
          : `Seeking ${l.desiredType ?? '—'} in ${l.desiredCity ?? '—'}`,
        at: l.createdAt.toISOString(),
      })));
    }

    if (!opts.type || opts.type === 'interest_sent') {
      events.push(...interests.map((i) => ({
        id: `interest:${i.id}`,
        type: 'interest_sent',
        label: 'Connection Request',
        actor: i.requesterUserId,
        meta: `→ listing of ${i.listing.user.fullName} · status: ${i.status}`,
        at: i.createdAt.toISOString(),
      })));
    }

    if (!opts.type || opts.type === 'chain_formed') {
      events.push(...chains.map((c) => ({
        id: `chain:${c.id}`,
        type: 'chain_formed',
        label: `Chain ${c.status}`,
        actor: 'System',
        meta: `${c.cycleSize}-way swap`,
        at: c.createdAt.toISOString(),
      })));
    }

    if (!opts.type || opts.type === 'reliability_event') {
      events.push(...reliabilityEvents.map((r) => ({
        id: `reliability:${r.id}`,
        type: 'reliability_event',
        label: 'Reliability Event',
        actor: r.user.fullName,
        meta: `${r.eventType} · ${r.scoreDelta > 0 ? '+' : ''}${r.scoreDelta} pts${r.reason ? ` · ${r.reason}` : ''}`,
        at: r.createdAt.toISOString(),
      })));
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      items: events.slice(offset, offset + limit),
      meta: { total: events.length, offset, limit },
    };
  }

  // ─── Push Notifications (Admin Campaigns) ────────────────────────────────────

  async listPushNotifications(opts: { search?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      const q = opts.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.adminPushNotification.count({ where }),
      this.prisma.adminPushNotification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { items, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createPushNotification(adminId: string, dto: {
    title: string;
    description: string;
    zone?: string;
    target?: string;
    imageUrl?: string;
    scheduledAt?: string;
  }) {
    const isScheduled = !!dto.scheduledAt;
    const record = await this.prisma.adminPushNotification.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        zone: dto.zone ?? 'ALL',
        target: dto.target ?? 'ALL_USERS',
        imageUrl: dto.imageUrl ?? null,
        isActive: true,
        status: isScheduled ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdByUserId: adminId,
      },
    });

    // If not scheduled, send immediately
    if (!isScheduled) {
      await this._dispatchPushNotification(record.id);
    }

    return record;
  }

  async updatePushNotification(id: string, dto: {
    title?: string;
    description?: string;
    zone?: string;
    target?: string;
    imageUrl?: string;
    isActive?: boolean;
    scheduledAt?: string | null;
  }) {
    const existing = await this.prisma.adminPushNotification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Push notification not found');

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.zone !== undefined) data.zone = dto.zone;
    if (dto.target !== undefined) data.target = dto.target;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.scheduledAt !== undefined) {
      data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
      if (dto.scheduledAt) data.status = 'SCHEDULED';
    }

    return this.prisma.adminPushNotification.update({ where: { id }, data });
  }

  async deletePushNotification(id: string) {
    const existing = await this.prisma.adminPushNotification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Push notification not found');
    await this.prisma.adminPushNotification.delete({ where: { id } });
    return { success: true };
  }

  async sendPushNotificationNow(id: string) {
    const existing = await this.prisma.adminPushNotification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Push notification not found');
    return this._dispatchPushNotification(id);
  }

  async sendPushToUser(userId: string, title: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, pushToken: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Create in-app notification
    await this.prisma.userNotification.create({
      data: { userId, type: 'ADMIN_MESSAGE', title, message: body },
    });

    // Send push if token available
    if (user.pushToken) {
      await this.pushService.sendPush({ token: user.pushToken, title, body });
    }

    return { success: true, hasPushToken: !!user.pushToken };
  }

  private async _dispatchPushNotification(id: string) {
    const record = await this.prisma.adminPushNotification.findUnique({ where: { id } });
    if (!record) return;

    // Build user filter
    const where: any = { pushToken: { not: null } };
    if (record.zone && record.zone !== 'ALL') {
      where.OR = [
        { listings: { some: { desiredState: { equals: record.zone, mode: 'insensitive' } } } },
        { listings: { some: { currentState: { equals: record.zone, mode: 'insensitive' } } } },
      ];
    }
    if (record.target === 'SEEKERS') {
      where.listings = { some: { listingType: 'SEEKING', status: 'ACTIVE' } };
    } else if (record.target === 'SWAPPERS') {
      where.listings = { some: { listingType: 'SWAP', status: 'ACTIVE' } };
    } else if (record.target === 'VERIFIED_USERS') {
      where.listings = { some: { verificationStatus: 'APPROVED' } };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, pushToken: true },
      take: 2000,
    });

    const tokens = users.map((u) => u.pushToken!).filter(Boolean);

    // Create in-app notifications
    await this.prisma.userNotification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: 'ADMIN_BROADCAST',
        title: record.title,
        message: record.description,
      })),
      skipDuplicates: true,
    });

    // Send FCM push
    if (tokens.length > 0) {
      await this.pushService.sendPushToMany({
        tokens,
        title: record.title,
        body: record.description,
      });
    }

    await this.prisma.adminPushNotification.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: users.length },
    });

    return { success: true, recipientCount: users.length };
  }

  // ─── Vacancies (Admin) ───────────────────────────────────────────────────────

  async listVacancies(opts: { state?: string; city?: string; apartmentType?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.state) where.state = { equals: opts.state, mode: 'insensitive' };
    if (opts.city) where.city = { equals: opts.city, mode: 'insensitive' };
    if (opts.apartmentType) where.apartmentType = { contains: opts.apartmentType, mode: 'insensitive' };

    const [total, items] = await Promise.all([
      this.prisma.vacancyAlert.count({ where }),
      this.prisma.vacancyAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          apartmentType: true,
          state: true,
          city: true,
          area: true,
          features: true,
          shareCount: true,
          clickCount: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      }),
    ]);

    return { items, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async deleteVacancy(vacancyId: string) {
    const vacancy = await this.prisma.vacancyAlert.findUnique({ where: { id: vacancyId } });
    if (!vacancy) throw new NotFoundException('Vacancy not found');
    await this.prisma.vacancyAlert.delete({ where: { id: vacancyId } });
    return { success: true };
  }

  // ─── Create User (Admin) ──────────────────────────────────────────────────────

  async createUser(dto: {
    fullName: string;
    phone: string;
    email?: string;
    password: string;
    role?: string;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new BadRequestException('Phone number already registered');

    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new BadRequestException('Email already registered');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim() || null,
        password: hashed,
        role: (dto.role as any) ?? 'USER',
        onboardingComplete: true,
        phoneVerifiedAt: new Date(),
      },
      select: { id: true, fullName: true, email: true, phone: true, role: true, createdAt: true },
    });

    return { message: 'User created', user };
  }

  // ─── Create Listing (Admin) ───────────────────────────────────────────────────

  async createListing(dto: {
    userId: string;
    listingType: string;
    desiredType: string;
    desiredState: string;
    desiredCity: string;
    desiredArea?: string;
    maxBudget: number;
    timeline: string;
    currentType?: string;
    currentState?: string;
    currentCity?: string;
    currentRent?: number;
    currentAvailable?: boolean;
    features?: string[];
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const listing = await this.prisma.swapListing.create({
      data: {
        userId: dto.userId,
        listingType: dto.listingType as any,
        desiredType: dto.desiredType,
        desiredState: dto.desiredState,
        desiredCity: dto.desiredCity,
        desiredArea: dto.desiredArea ?? null,
        maxBudget: dto.maxBudget,
        timeline: dto.timeline,
        currentType: dto.currentType ?? '',
        currentState: dto.currentState ?? '',
        currentCity: dto.currentCity ?? '',
        currentRent: dto.currentRent ?? 0,
        currentAvailable: dto.currentAvailable ?? false,
        features: dto.features ?? [],
        status: 'ACTIVE',
      },
    });

    return { message: 'Listing created', listing };
  }

  // ─── Staff / Employee management ─────────────────────────────────────────────

  async listStaff(opts: { page?: number; limit?: number; search?: string; role?: string }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR', 'SUPPORT'] } };
    if (opts.role) where.role = opts.role;
    if (opts.search) {
      const q = opts.search.trim();
      where.AND = [
        {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, staff] = await Promise.all([
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
          createdAt: true,
          phoneVerifiedAt: true,
          blockedUntil: true,
        },
      }),
    ]);

    return { items: staff, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }
}
