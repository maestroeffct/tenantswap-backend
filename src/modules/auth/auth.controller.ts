import { Body, Controller, Get, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { GoogleOAuthGuard } from '../../common/guards/google-oauth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(GoogleOAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('sso/google')
  googleAuth() {}

  @UseGuards(GoogleOAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('sso/google/callback')
  googleAuthCallback(@Req() req: any, @Res() res: any) {
    return this.authService.sso(req, res);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return this.authService.logout(user.id, ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto, @Ip() ip: string) {
    return this.authService.resendEmailVerification(dto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('phone/send-otp')
  sendPhoneOtp(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return this.authService.sendPhoneVerificationOtp(user.id, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('phone/resend-otp')
  resendPhoneOtp(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return this.authService.sendPhoneVerificationOtp(user.id, ip, true);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('phone/verify-otp')
  verifyPhoneOtp(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyPhoneOtpDto,
    @Ip() ip: string,
  ) {
    return this.authService.verifyPhoneVerificationOtp(user.id, dto.pin, ip);
  }
}
