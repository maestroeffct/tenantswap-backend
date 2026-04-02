import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { MatchingService } from '../matching/matching.service';
import { ListingsService } from '../listings/listings.service';
import { AdminService } from './admin.service';
import { ApplyPenaltyDto } from './dto/apply-penalty.dto';
import { BreakChainDto } from './dto/break-chain.dto';
import { UnblockUserDto } from './dto/unblock-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloseListingDto } from './dto/close-listing.dto';
import { VerifyListingDto } from '../listings/dto/verify-listing.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly matchingService: MatchingService,
    private readonly reliabilityService: ReliabilityService,
    private readonly listingsService: ListingsService,
    private readonly adminService: AdminService,
  ) {}

  // ─── Stats / Overview ─────────────────────────────────────────────────────────

  @Get('stats/overview')
  getOverviewStats() {
    return this.listingsService.getOverviewStats();
  }

  // ─── Verifications ────────────────────────────────────────────────────────────

  @Get('verifications/pending')
  getPendingVerifications() {
    return this.listingsService.getPendingVerifications();
  }

  @Get('verifications')
  listVerifications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.adminService.listVerifications({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      category,
    });
  }

  @Post('listings/:listingId/verify')
  verifyListing(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() dto: VerifyListingDto,
  ) {
    return this.listingsService.verifyListing(user.id, listingId, dto);
  }

  // ─── Users ────────────────────────────────────────────────────────────────────

  @Get('users')
  listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('suspended') suspended?: string,
  ) {
    return this.adminService.listUsers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      role,
      suspended: suspended === 'true' ? true : suspended === 'false' ? false : undefined,
    });
  }

  @Get('users/:userId/reliability')
  getUserReliability(@Param('userId') userId: string) {
    return this.reliabilityService.getStatus(userId);
  }

  @Get('users/:userId')
  getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Patch('users/:userId')
  updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(userId, dto);
  }

  @Post('users/:userId/suspend')
  suspendUser(
    @Param('userId') userId: string,
    @Query('hours') hours?: string,
  ) {
    return this.adminService.suspendUser(userId, hours ? Number(hours) : undefined);
  }

  @Post('users/:userId/penalty')
  applyUserPenalty(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
    @Body() dto: ApplyPenaltyDto,
  ) {
    return this.reliabilityService.applyManualPenalty(user.id, userId, {
      reason: dto.reason,
      scorePenalty: dto.scorePenalty,
      cooldownHours: dto.cooldownHours,
      blockHours: dto.blockHours,
      metadata: dto.metadata,
    });
  }

  @Post('users/:userId/unblock')
  unblockUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
    @Body() dto: UnblockUserDto,
  ) {
    return this.reliabilityService.clearRestrictions(user.id, userId, dto.reason);
  }

  // ─── Listings ─────────────────────────────────────────────────────────────────

  @Get('listings')
  listListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('listingType') listingType?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listListings({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      listingType,
      verificationStatus,
      search,
    });
  }

  @Get('listings/:listingId')
  getListingById(@Param('listingId') listingId: string) {
    return this.adminService.getListingById(listingId);
  }

  @Post('listings/:listingId/close')
  closeListing(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() dto: CloseListingDto,
  ) {
    return this.adminService.closeListingByAdmin(user.id, listingId, dto.reason);
  }

  // ─── Chains ───────────────────────────────────────────────────────────────────

  @Get('chains')
  listChains(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listChains({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Get('chains/:chainId')
  getChainById(@Param('chainId') chainId: string) {
    return this.adminService.getChainById(chainId);
  }

  @Post('chains/expire-overdue')
  expireOverdueChains(@CurrentUser() user: CurrentUserPayload) {
    return this.matchingService.expirePendingChains('ADMIN_SWEEP', user.id);
  }

  @Post('chains/:chainId/break')
  breakChain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
    @Body() dto: BreakChainDto,
  ) {
    return this.matchingService.breakChainByAdmin(
      chainId,
      user.id,
      dto.reason ?? 'ADMIN_FORCE',
      dto.offenderUserId,
    );
  }

  @Post('chains/:chainId/expire')
  expireChain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.breakChainByAdmin(chainId, user.id, 'EXPIRED');
  }

  @Post('chains/:chainId/rerun')
  rerunChain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chainId') chainId: string,
  ) {
    return this.matchingService.rerunChainMembersByAdmin(chainId, user.id);
  }
}
