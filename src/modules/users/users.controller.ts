import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { ReliabilityService } from '../../common/services/reliability.service';
import { UploadService } from '../../common/services/upload.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SubmitNinDto } from './dto/submit-nin.dto';
import { ReportUserDto } from './dto/report-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly reliabilityService: ReliabilityService,
    private readonly uploadService: UploadService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.getMe(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  updatePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/reliability')
  getMyReliability(@CurrentUser() user: CurrentUserPayload) {
    return this.reliabilityService.getStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/profile-photo')
  @UseInterceptors(
    FileInterceptor('photo', {
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
  async uploadProfilePhoto(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No image provided');
    const url = await this.uploadService.uploadProfilePhoto(file.buffer, user.id);
    return this.usersService.setProfilePhotoUrl(user.id, url);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/push-token')
  savePushToken(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { token: string },
  ) {
    return this.usersService.savePushToken(user.id, body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/nin')
  @HttpCode(HttpStatus.OK)
  submitNin(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitNinDto,
  ) {
    return this.usersService.submitNin(user.id, dto.nin);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/caretaker-prompt/dismiss')
  @HttpCode(HttpStatus.OK)
  dismissCaretakerPrompt(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.dismissCaretakerPrompt(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':userId/report')
  @HttpCode(HttpStatus.OK)
  reportUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') reportedUserId: string,
    @Body() dto: ReportUserDto,
  ) {
    return this.usersService.reportUser(user.id, reportedUserId, dto);
  }
}
