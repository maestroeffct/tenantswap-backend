import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { UploadService } from '../../common/services/upload.service';
import { MatchingService } from '../matching/matching.service';
import { ListingsService } from '../listings/listings.service';
import { AdminService } from './admin.service';
import { ApplyPenaltyDto } from './dto/apply-penalty.dto';
import { BreakChainDto } from './dto/break-chain.dto';
import { UnblockUserDto } from './dto/unblock-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloseListingDto } from './dto/close-listing.dto';
import { CreatePushNotificationDto } from './dto/create-push-notification.dto';
import { SendToUserDto } from './dto/send-to-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { VerifyListingDto } from '../listings/dto/verify-listing.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SystemSettingsService, SETTINGS_KEYS } from '../../common/services/system-settings.service';
import { AdminEmailService } from './admin-email.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto, SendEmailDto } from './dto/email.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly matchingService: MatchingService,
    private readonly reliabilityService: ReliabilityService,
    private readonly listingsService: ListingsService,
    private readonly adminService: AdminService,
    private readonly uploadService: UploadService,
    private readonly systemSettings: SystemSettingsService,
    private readonly adminEmail: AdminEmailService,
  ) {}

  // ─── System Settings ──────────────────────────────────────────────────────────

  @Get('settings')
  async getSettings() {
    const all = await this.systemSettings.getAll();
    return {
      subscriptionEnforcement: all[SETTINGS_KEYS.SUBSCRIPTION_ENFORCEMENT] === 'true',
      paymentProvider: all[SETTINGS_KEYS.PAYMENT_PROVIDER],
      subscriptionAmountMinor: Number(all[SETTINGS_KEYS.SUBSCRIPTION_AMOUNT_MINOR]),
      subscriptionCurrency: all[SETTINGS_KEYS.SUBSCRIPTION_CURRENCY],
      subscriptionPlanName: all[SETTINGS_KEYS.SUBSCRIPTION_PLAN_NAME],
      subscriptionDurationDays: Number(all[SETTINGS_KEYS.SUBSCRIPTION_DURATION_DAYS]),
      emailBranding: this.parseJsonSetting(all[SETTINGS_KEYS.EMAIL_BRANDING_JSON]),
    };
  }

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    const entries: Record<string, string> = {};
    if (dto.subscriptionEnforcement !== undefined)
      entries[SETTINGS_KEYS.SUBSCRIPTION_ENFORCEMENT] = String(dto.subscriptionEnforcement);
    if (dto.paymentProvider !== undefined)
      entries[SETTINGS_KEYS.PAYMENT_PROVIDER] = dto.paymentProvider;
    if (dto.subscriptionAmountMinor !== undefined)
      entries[SETTINGS_KEYS.SUBSCRIPTION_AMOUNT_MINOR] = String(dto.subscriptionAmountMinor);
    if (dto.subscriptionCurrency !== undefined)
      entries[SETTINGS_KEYS.SUBSCRIPTION_CURRENCY] = dto.subscriptionCurrency;
    if (dto.subscriptionPlanName !== undefined)
      entries[SETTINGS_KEYS.SUBSCRIPTION_PLAN_NAME] = dto.subscriptionPlanName;
    if (dto.subscriptionDurationDays !== undefined)
      entries[SETTINGS_KEYS.SUBSCRIPTION_DURATION_DAYS] = String(dto.subscriptionDurationDays);
    if (dto.emailBranding !== undefined)
      entries[SETTINGS_KEYS.EMAIL_BRANDING_JSON] = JSON.stringify(dto.emailBranding);
    await this.systemSettings.setMany(entries as any);
    return this.getSettings();
  }

  @Post('settings/email-brand-logo')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, WebP, or SVG images are allowed'), false);
        }
      },
    }),
  )
  async uploadEmailBrandLogo(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No image provided');
    const url = await this.uploadService.uploadEmailBrandAsset(
      file.buffer,
      `${user.id}_${Date.now()}`,
    );
    return { url };
  }

  // ─── Stats / Overview ─────────────────────────────────────────────────────────

  @Get('stats/overview')
  getOverviewStats() {
    return this.listingsService.getOverviewStats();
  }

  @Get('stats/near-misses')
  getNearMissBreakdown() {
    return this.adminService.getNearMissBreakdown();
  }

  // ─── Caretakers ──────────────────────────────────────────────────────────────

  @Get('caretakers')
  listCaretakers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listCaretakers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
    });
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

  @Delete('listings/:listingId')
  deleteListing(@Param('listingId') listingId: string) {
    return this.adminService.deleteListingByAdmin(listingId);
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

  // ─── Activity Feed ────────────────────────────────────────────────────────────

  @Get('activity')
  listActivity(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('type') type?: string,
    @Query('since') since?: string,
  ) {
    return this.adminService.listActivity({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      type,
      since,
    });
  }

  // ─── Push Notifications ───────────────────────────────────────────────────────

  @Get('push-notifications')
  listPushNotifications(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listPushNotifications({
      search,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('push-notifications')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, or WebP images are allowed'), false);
        }
      },
    }),
  )
  async createPushNotification(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePushNotificationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let payload = dto;

    if (file) {
      const imageUrl = await this.uploadService.uploadPushNotificationImage(
        file.buffer,
        `${user.id}_${Date.now()}`,
      );
      payload = { ...dto, imageUrl };
    }

    return this.adminService.createPushNotification(user.id, payload);
  }

  @Patch('push-notifications/:id')
  updatePushNotification(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePushNotificationDto> & { isActive?: boolean },
  ) {
    return this.adminService.updatePushNotification(id, dto);
  }

  @Delete('push-notifications/:id')
  deletePushNotification(@Param('id') id: string) {
    return this.adminService.deletePushNotification(id);
  }

  @Post('push-notifications/:id/send')
  sendPushNotificationNow(@Param('id') id: string) {
    return this.adminService.sendPushNotificationNow(id);
  }

  @Post('push-notifications/send-to-user')
  sendPushToUser(@Body() dto: SendToUserDto) {
    return this.adminService.sendPushToUser(dto.userId, dto.title, dto.body);
  }

  // ─── Connection Requests ──────────────────────────────────────────────────────

  @Get('interests')
  listInterests(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listInterests({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status: status || undefined,
      search: search || undefined,
    });
  }

  // ─── Reports ─────────────────────────────────────────────────────────────────

  @Get('reports')
  listReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listReports({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Patch('reports/:reportId/review')
  reviewReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('reportId') reportId: string,
    @Body() body: { action: 'REVIEWED' | 'DISMISSED' },
  ) {
    return this.adminService.reviewReport(reportId, user.id, body.action);
  }

  // ─── Vacancies (Admin) ────────────────────────────────────────────────────────

  @Get('vacancies')
  listVacancies(
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('apartmentType') apartmentType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listVacancies({
      state,
      city,
      apartmentType,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('vacancies')
  createVacancy(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: { userId?: string; apartmentType: string; state: string; city: string; area?: string; features?: string[] },
  ) {
    return this.adminService.createVacancy(user.id, { ...dto, features: dto.features ?? [] });
  }

  @Delete('vacancies/:vacancyId')
  deleteVacancy(@Param('vacancyId') vacancyId: string) {
    return this.adminService.deleteVacancy(vacancyId);
  }

  // ─── Create User / Listing ────────────────────────────────────────────────────

  @Post('users/create')
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Post('listings/create')
  createListing(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateListingDto,
  ) {
    // If no userId specified, use the admin's own account
    return this.adminService.createListing({ ...dto, userId: dto.userId || user.id });
  }

  // ─── Staff Management ─────────────────────────────────────────────────────────

  @Get('staff')
  listStaff(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.listStaff({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      role,
    });
  }

  // ─── Email Logs ───────────────────────────────────────────────────────────────

  @Get('email/logs')
  listEmailLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.adminEmail.listLogs({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      type,
      search,
    });
  }

  // ─── Email Templates ──────────────────────────────────────────────────────────

  @Get('email/templates')
  listEmailTemplates() {
    return this.adminEmail.listTemplates();
  }

  @Get('email/templates/:id')
  getEmailTemplate(@Param('id') id: string) {
    return this.adminEmail.getTemplate(id);
  }

  @Get('email/templates/:id/preview')
  previewEmailTemplate(@Param('id') id: string) {
    return this.adminEmail.previewTemplate(id);
  }

  @Post('email/templates')
  createEmailTemplate(@Body() dto: CreateEmailTemplateDto) {
    return this.adminEmail.createTemplate(dto);
  }

  @Patch('email/templates/:id')
  updateEmailTemplate(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.adminEmail.updateTemplate(id, dto);
  }

  @Delete('email/templates/:id')
  deleteEmailTemplate(@Param('id') id: string) {
    return this.adminEmail.deleteTemplate(id);
  }

  // ─── Email Send ───────────────────────────────────────────────────────────────

  @Post('email/send')
  sendEmail(@Body() dto: SendEmailDto) {
    return this.adminEmail.sendEmail(dto);
  }

  @Post('email/seed-templates')
  seedEmailTemplates() {
    return this.adminEmail.seedDefaultTemplates();
  }

  private parseJsonSetting(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
