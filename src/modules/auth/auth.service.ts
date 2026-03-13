import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,

} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../../common/services/email.service';
import {
  OauthService,
  type OAuthProviderType,
} from '../../common/services/oauth.service';
import { TermiiService } from '../../common/services/termii.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { OauthUser } from 'src/common/@types';


type AttemptState = {
  count: number;
  windowStartedAt: number;
  lockedUntil?: number;
};

type AttemptFeedback = {
  attemptsAllowed: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  locked: boolean;
  lockRemainingMs: number;
  lockUntil: string | null;
  windowMs: number;
};

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';
const REGISTER_GENERIC_MESSAGE =
  'If your details are valid, a verification email has been sent.';
const RESEND_GENERIC_MESSAGE =
  'If the email exists, a verification email has been sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly ipAttempts = new Map<string, AttemptState>();
  private readonly identifierAttempts = new Map<string, AttemptState>();

  private readonly loginMaxAttempts: number;
  private readonly loginWindowMs: number;
  private readonly loginLockMs: number;
  private readonly emailVerificationTokenTtlMs: number;
  private readonly frontendVerifyEmailUrl: string;
  private readonly phoneOtpMaxAttempts: number;
  private readonly phoneOtpResendCooldownSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly termiiService: TermiiService,
    private readonly oauthService: OauthService,
  ) {
    this.loginMaxAttempts =
      this.config.get<number>('AUTH_LOGIN_MAX_ATTEMPTS') ?? 5;
    this.loginWindowMs =
      this.config.get<number>('AUTH_LOGIN_WINDOW_MS') ?? 900_000;
    this.loginLockMs = this.config.get<number>('AUTH_LOGIN_LOCK_MS') ?? 900_000;
    this.emailVerificationTokenTtlMs =
      this.config.get<number>('EMAIL_VERIFICATION_TOKEN_TTL_MS') ?? 86_400_000;
    this.frontendVerifyEmailUrl =
      this.config.get<string>('FRONTEND_VERIFY_EMAIL_URL') ??
      'http://localhost:3000/verify-email';
    this.phoneOtpMaxAttempts =
      this.config.get<number>('TERMII_PIN_ATTEMPTS') ?? 5;
    this.phoneOtpResendCooldownSeconds =
      this.config.get<number>('PHONE_OTP_RESEND_COOLDOWN_SECONDS') ?? 60;
  }


  async sso(req: any, res: any) {
    const user: OauthUser = req.user;

    const existingProviderUser = await this.prisma.user.findFirst({
      where: {
        email: user.email,
        fullName: user.name,
        oauthProvider: "GOOGLE",
        oauthProviderUserId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (existingProviderUser) {

      const response = await this.buildOauthAuthResponse(
        existingProviderUser.id,
        'OAuth Login successful',
      );

      return res.redirect(`${this.config.get<string>('GOOGLE_OAUTH_FRONTEND_CALLBACK_URL')}?token=${response.accessToken}&state=signin`);
    }

    this.logger.log( 'OAuth successful')

    return res.redirect(`${this.config.get<string>('GOOGLE_OAUTH_FRONTEND_CALLBACK_URL')}?state=signup&token=${user.accessToken}&id=${user.id}&email=${user.email}&fullName=${user.name}&avatar=${user.avatar}`);
  }

  async register(dto: RegisterDto, ip: string) {
    const authType = dto.authType === 'oauth' ? 'oauth' : 'password';

    if (authType === 'oauth') {
      return this.registerOrLoginWithOauth(dto, ip);
    }

    if (!dto.email || !dto.fullName || !dto.phone || !dto.password) {
      throw new BadRequestException(
        'email, fullName, phone, and password are required for password registration',
      );
    }

    const normalizedPhone = this.normalizePhone(dto.phone);
    const normalizedEmail = this.normalizeEmail(dto.email);

    const [existingEmailUser, existingPhoneUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { phone: normalizedPhone },
        select: { id: true },
      }),
    ]);

    if (existingEmailUser || existingPhoneUser) {
      const conflictMessage =
        existingEmailUser && existingPhoneUser
          ? 'Email already exists and phone is already used'
          : existingEmailUser
            ? 'Email already exists'
            : 'Phone is already used';

      this.audit('register_conflict', {
        ip,
        email: normalizedEmail,
        phone: normalizedPhone,
        conflict: conflictMessage,
      });

      throw new ConflictException(conflictMessage);
    }

    const hashedPassword = await hash(dto.password, 10);
    const tokenArtifacts = this.generateEmailVerificationArtifacts();

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        password: hashedPassword,
        allowIncomingCalls: dto.allowIncomingCalls ?? false,
        canConnectLandlord: dto.canConnectLandlord ?? false,
        hasLandlordContact: dto.hasLandlordContact ?? false,
        profilePhotoUrl: dto.profilePhotoUrl?.trim() || null,
        gender: this.mapGender(dto.gender),
        occupation: dto.occupation?.trim() || null,
        emailVerificationTokenHash: tokenArtifacts.tokenHash,
        emailVerificationExpiresAt: tokenArtifacts.expiresAt,
      },
      select: { id: true, email: true },
    });

    const emailDispatch = await this.dispatchVerificationEmail(
      normalizedEmail,
      tokenArtifacts.rawToken,
    );

    this.audit('register_success', {
      ip,
      userId: user.id,
      email: user.email,
      emailDelivered: emailDispatch.delivered,
      emailProvider: emailDispatch.provider,
      emailAttempts: emailDispatch.attempts,
      ...(emailDispatch.messageId
        ? { emailMessageId: emailDispatch.messageId }
        : {}),
      ...(emailDispatch.error ? { emailError: emailDispatch.error } : {}),
    });

    return this.registerResponse(tokenArtifacts.rawToken);
  }

  private async registerOrLoginWithOauth(dto: RegisterDto, ip: string) {
    if (!dto.oauthProvider || !dto.oauthIdToken) {
      throw new BadRequestException(
        'oauthProvider and oauthIdToken are required for oauth registration',
      );
    }

    const provider = this.mapOauthProvider(dto.oauthProvider);

    const normalizedPhone = dto.phone ? this.normalizePhone(dto.phone) : null;
     if (!normalizedPhone) {
      throw new BadRequestException(
        'phone is required when creating a new account with oauth',
      );
    }

    const existingEmailUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        phone: true,
        oauthProvider: true,
      },
    });

    if (existingEmailUser && existingEmailUser.oauthProvider) {
      throw new ConflictException(
        'This email is already linked to another account or provider',
      );
    }


    const fullName = this.resolveDisplayName(dto.fullName, "");

    const generatedPassword = randomBytes(32).toString('hex');
    const passwordHash = await hash(generatedPassword, 10);
    const tokenArtifacts = this.generateEmailVerificationArtifacts();

    const user = await this.prisma.user.create({
      data: {
        fullName,
        email: dto.email,
        phone: normalizedPhone,
        password: passwordHash,
        emailVerifiedAt:new Date(),
        oauthProvider: provider,
        oauthProviderUserId: dto.oauthId,
        allowIncomingCalls: dto.allowIncomingCalls ?? false,
        canConnectLandlord: dto.canConnectLandlord ?? false,
        hasLandlordContact: dto.hasLandlordContact ?? false,
        profilePhotoUrl: dto.profilePhotoUrl?.trim()  || null,
        gender: this.mapGender(dto.gender),
        emailVerificationTokenHash: tokenArtifacts.tokenHash,
        emailVerificationExpiresAt: tokenArtifacts.expiresAt,
        occupation: dto.occupation?.trim() || null,
      },
      select: {
        id: true,
      },
    });

    this.audit('oauth_register_success', {
      ip,
      userId: user.id,
      email: dto.email,
      provider,
    });

    return this.buildOauthAuthResponse(
      user.id,
      'OAuth registration successful',
    );
  }

  async login(dto: LoginDto, ip: string) {
    const normalizedPhone = this.normalizePhone(dto.phone);

    const ipKey = this.ipAttemptKey(ip, 'login');
    const identifierKey = this.identifierAttemptKey(
      normalizedPhone,
      'login_phone',
    );

    this.assertNotLocked(this.ipAttempts, ipKey, 'ip', {
      ip,
      phone: normalizedPhone,
    });
    this.assertNotLocked(this.identifierAttempts, identifierKey, 'identifier', {
      ip,
      phone: normalizedPhone,
    });

    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        password: true,
        emailVerifiedAt: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        cooldownUntil: true,
        blockedUntil: true,
        profilePhotoUrl: true,
        gender: true,
        occupation: true,
        allowIncomingCalls: true,
        oauthProvider: true,
        canConnectLandlord: true,
        hasLandlordContact: true,
        onboardingComplete: true,
        phoneVerifiedAt: true,
      },
    });

    if (!user) {
      const ipFeedback = this.recordFailure(this.ipAttempts, ipKey);
      const identifierFeedback = this.recordFailure(
        this.identifierAttempts,
        identifierKey,
      );
      const feedback = this.combineAttemptFeedback(
        ipFeedback,
        identifierFeedback,
      );

      this.audit('login_failed_user_not_found', {
        ip,
        phone: normalizedPhone,
        ...feedback,
      });

      this.throwLoginFailure(feedback);
    }

    const isMatch = await compare(dto.password, user.password);
    if (!isMatch) {
      const ipFeedback = this.recordFailure(this.ipAttempts, ipKey);
      const identifierFeedback = this.recordFailure(
        this.identifierAttempts,
        identifierKey,
      );
      const feedback = this.combineAttemptFeedback(
        ipFeedback,
        identifierFeedback,
      );

      this.audit('login_failed_bad_password', {
        ip,
        userId: user.id,
        ...feedback,
      });

      this.throwLoginFailure(feedback);
    }

    this.clearFailure(this.ipAttempts, ipKey);
    this.clearFailure(this.identifierAttempts, identifierKey);

    if (!user.emailVerifiedAt) {
      this.audit('login_blocked_email_unverified', {
        ip,
        userId: user.id,
      });
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    const token = this.jwtService.sign({ userId: user.id });

    this.audit('login_success', {
      ip,
      userId: user.id,
    });

    return {
      message: 'Login successful',
      accessToken: token,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        reliabilityScore: user.reliabilityScore,
        cancellationCount: user.cancellationCount,
        noShowCount: user.noShowCount,
        cooldownUntil: user.cooldownUntil,
        blockedUntil: user.blockedUntil,
        profilePhotoUrl: user.profilePhotoUrl,
        gender: user.gender,
        occupation: user.occupation,
        allowIncomingCalls: user.allowIncomingCalls,
        oauthProvider: user.oauthProvider,
        canConnectLandlord: user.canConnectLandlord,
        hasLandlordContact: user.hasLandlordContact,
        onboardingComplete: user.onboardingComplete,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashVerificationToken(dto.token);

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        cooldownUntil: true,
        blockedUntil: true,
        profilePhotoUrl: true,
        gender: true,
        occupation: true,
        allowIncomingCalls: true,
        oauthProvider: true,
        canConnectLandlord: true,
        hasLandlordContact: true,
        onboardingComplete: true,
        phoneVerifiedAt: true,
      },
    });

    if (!user) {
      this.audit('email_verify_failed_invalid_or_expired', {
        tokenHashPrefix: tokenHash.slice(0, 8),
      });
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });

    const token = this.jwtService.sign({ userId: user.id });

    this.audit('email_verified', {
      userId: user.id,
      email: user.email,
    });

    return {
      message: 'Email verified successfully',
      accessToken: token,
      user,
    };
  }

  async resendEmailVerification(dto: ResendVerificationDto, ip: string) {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    let verificationToken: string | undefined;

    if (user && !user.emailVerifiedAt) {
      const tokenArtifacts = this.generateEmailVerificationArtifacts();
      verificationToken = tokenArtifacts.rawToken;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationTokenHash: tokenArtifacts.tokenHash,
          emailVerificationExpiresAt: tokenArtifacts.expiresAt,
        },
      });

      this.audit('verification_resend', {
        ip,
        userId: user.id,
        email: normalizedEmail,
      });

      const emailDispatch = await this.dispatchVerificationEmail(
        normalizedEmail,
        tokenArtifacts.rawToken,
      );

      this.audit('verification_resend_delivery', {
        ip,
        userId: user.id,
        email: normalizedEmail,
        emailDelivered: emailDispatch.delivered,
        emailProvider: emailDispatch.provider,
        emailAttempts: emailDispatch.attempts,
        ...(emailDispatch.messageId
          ? { emailMessageId: emailDispatch.messageId }
          : {}),
        ...(emailDispatch.error ? { emailError: emailDispatch.error } : {}),
      });
    } else {
      this.audit('verification_resend_non_existing_or_verified', {
        ip,
        email: normalizedEmail,
      });
    }

    return {
      message: RESEND_GENERIC_MESSAGE,
      ...(this.shouldExposeVerificationToken() && verificationToken
        ? { verificationToken }
        : {}),
    };
  }

  async sendPhoneVerificationOtp(userId: string, ip: string, resend = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        phoneVerifiedAt: true,
        phoneVerificationLastSentAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.phoneVerifiedAt) {
      return {
        message: 'Phone is already verified',
        phoneVerifiedAt: user.phoneVerifiedAt,
      };
    }

    const now = new Date();
    const lastSentAt = user.phoneVerificationLastSentAt;
    if (lastSentAt) {
      const elapsedSeconds = Math.floor(
        (now.getTime() - lastSentAt.getTime()) / 1000,
      );
      if (elapsedSeconds < this.phoneOtpResendCooldownSeconds) {
        const retryAfterSeconds =
          this.phoneOtpResendCooldownSeconds - elapsedSeconds;
        throw new HttpException(
          {
            message: 'Please wait before requesting another OTP',
            meta: {
              retryAfterSeconds,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const sendResult = await this.termiiService.sendOtp({ phone: user.phone });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerificationPinId: sendResult.pinId,
        phoneVerificationExpiresAt: sendResult.expiresAt,
        phoneVerificationAttempts: 0,
        phoneVerificationLastSentAt: now,
      },
    });

    this.audit(resend ? 'phone_otp_resent' : 'phone_otp_sent', {
      ip,
      userId: user.id,
      phone: user.phone,
      expiresAt: sendResult.expiresAt.toISOString(),
      providerStatus: sendResult.providerStatus,
    });

    return {
      message: resend ? 'OTP resent successfully' : 'OTP sent successfully',
      expiresAt: sendResult.expiresAt,
    };
  }

  async verifyPhoneVerificationOtp(userId: string, pin: string, ip: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        phoneVerifiedAt: true,
        phoneVerificationPinId: true,
        phoneVerificationExpiresAt: true,
        phoneVerificationAttempts: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.phoneVerifiedAt) {
      return {
        message: 'Phone is already verified',
        phoneVerifiedAt: user.phoneVerifiedAt,
      };
    }

    if (!user.phoneVerificationPinId || !user.phoneVerificationExpiresAt) {
      throw new BadRequestException('Request OTP first');
    }

    if (user.phoneVerificationExpiresAt <= new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerificationPinId: null,
          phoneVerificationExpiresAt: null,
          phoneVerificationAttempts: 0,
        },
      });
      throw new BadRequestException('OTP has expired. Request a new one');
    }

    if (user.phoneVerificationAttempts >= this.phoneOtpMaxAttempts) {
      throw new HttpException(
        {
          message: 'Too many invalid OTP attempts. Request a new OTP',
          meta: {
            attemptsAllowed: this.phoneOtpMaxAttempts,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const verifyResult = await this.termiiService.verifyOtp({
      pinId: user.phoneVerificationPinId,
      pin,
    });

    if (!verifyResult.verified) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerificationAttempts: {
            increment: 1,
          },
        },
        select: {
          phoneVerificationAttempts: true,
        },
      });

      const remainingAttempts = Math.max(
        this.phoneOtpMaxAttempts - updated.phoneVerificationAttempts,
        0,
      );

      this.audit('phone_otp_verify_failed', {
        ip,
        userId: user.id,
        remainingAttempts,
        providerStatus: verifyResult.providerStatus,
      });

      throw new BadRequestException({
        message: 'Invalid OTP',
        meta: {
          remainingAttempts,
        },
      });
    }

    const now = new Date();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerifiedAt: now,
        phoneVerificationPinId: null,
        phoneVerificationExpiresAt: null,
        phoneVerificationAttempts: 0,
      },
    });

    this.audit('phone_verified', {
      ip,
      userId: user.id,
      phone: user.phone,
      providerStatus: verifyResult.providerStatus,
    });

    return {
      message: 'Phone verified successfully',
      phoneVerifiedAt: now,
    };
  }

  private registerResponse(verificationToken?: string) {
    return {
      message: REGISTER_GENERIC_MESSAGE,
      ...(this.shouldExposeVerificationToken() && verificationToken
        ? { verificationToken }
        : {}),
    };
  }

  private async buildOauthAuthResponse(userId: string, message: string) {
 try {
     const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        cooldownUntil: true,
        blockedUntil: true,
        profilePhotoUrl: true,
        gender: true,
        occupation: true,
        allowIncomingCalls: true,
        oauthProvider: true,
        canConnectLandlord: true,
        hasLandlordContact: true,
        onboardingComplete: true,
        phoneVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const token = this.jwtService.sign({ userId: userId });

    return {
      message,
      accessToken: token,
      user,
    };
 } catch (error) {
  console.log(error);
      throw new UnauthorizedException('JWT Error');

 }
  }

  private mapOauthProvider(provider: OAuthProviderType): 'GOOGLE' | 'APPLE' {
    return provider === 'google' ? 'GOOGLE' : 'APPLE';
  }

  private mapGender(
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
  ): 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null {
    if (!gender) {
      return null;
    }

    if (gender === 'male') return 'MALE';
    if (gender === 'female') return 'FEMALE';
    if (gender === 'other') return 'OTHER';
    return 'PREFER_NOT_TO_SAY';
  }

  private resolveDisplayName(
    providedName: string | undefined,
    fallbackName: string | undefined,
  ): string {
    const normalizedProvided = providedName?.trim();
    if (normalizedProvided) {
      return normalizedProvided;
    }

    const normalizedFallback = fallbackName?.trim();
    if (normalizedFallback) {
      return normalizedFallback;
    }

    return 'TenantSwap User';
  }

  private shouldExposeVerificationToken(): boolean {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    return nodeEnv !== 'production';
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('00')) {
      return `+${cleaned.slice(2)}`;
    }
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private ipAttemptKey(ip: string, scope: string): string {
    const normalizedIp = ip?.trim() ? ip.trim() : 'unknown';
    return `${scope}:ip:${normalizedIp}`;
  }

  private identifierAttemptKey(identifier: string, scope: string): string {
    return `${scope}:${identifier}`;
  }

  private assertNotLocked(
    map: Map<string, AttemptState>,
    key: string,
    source: 'ip' | 'identifier',
    metadata: Record<string, unknown>,
  ): void {
    const now = Date.now();
    const state = map.get(key);

    if (!state) {
      return;
    }

    if (state.windowStartedAt + this.loginWindowMs < now) {
      map.delete(key);
      return;
    }

    if (state.lockedUntil && state.lockedUntil > now) {
      const feedback = this.feedbackFromState(state, now);
      this.audit('login_locked_blocked', {
        source,
        key,
        ...metadata,
        ...feedback,
      });

      throw new HttpException(
        {
          message: 'Too many attempts. Please try again later.',
          meta: feedback,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(
    map: Map<string, AttemptState>,
    key: string,
  ): AttemptFeedback {
    const now = Date.now();
    const state = map.get(key);

    if (!state || state.windowStartedAt + this.loginWindowMs < now) {
      const nextState: AttemptState = {
        count: 1,
        windowStartedAt: now,
      };
      map.set(key, nextState);
      return this.feedbackFromState(nextState, now);
    }

    const nextCount = state.count + 1;
    const nextState: AttemptState = {
      ...state,
      count: nextCount,
    };

    if (nextCount >= this.loginMaxAttempts) {
      const lockMultiplier = nextCount - this.loginMaxAttempts + 1;
      nextState.lockedUntil = now + this.loginLockMs * lockMultiplier;
    }

    map.set(key, nextState);
    return this.feedbackFromState(nextState, now);
  }

  private feedbackFromState(
    state: AttemptState,
    now = Date.now(),
  ): AttemptFeedback {
    const lockRemainingMs =
      state.lockedUntil && state.lockedUntil > now
        ? state.lockedUntil - now
        : 0;

    return {
      attemptsAllowed: this.loginMaxAttempts,
      attemptsUsed: state.count,
      attemptsRemaining: Math.max(this.loginMaxAttempts - state.count, 0),
      locked: lockRemainingMs > 0,
      lockRemainingMs,
      lockUntil: state.lockedUntil
        ? new Date(state.lockedUntil).toISOString()
        : null,
      windowMs: this.loginWindowMs,
    };
  }

  private combineAttemptFeedback(
    first: AttemptFeedback,
    second: AttemptFeedback,
  ): AttemptFeedback {
    return {
      attemptsAllowed: this.loginMaxAttempts,
      attemptsUsed: Math.max(first.attemptsUsed, second.attemptsUsed),
      attemptsRemaining: Math.min(
        first.attemptsRemaining,
        second.attemptsRemaining,
      ),
      locked: first.locked || second.locked,
      lockRemainingMs: Math.max(first.lockRemainingMs, second.lockRemainingMs),
      lockUntil:
        first.lockRemainingMs >= second.lockRemainingMs
          ? first.lockUntil
          : second.lockUntil,
      windowMs: this.loginWindowMs,
    };
  }

  private throwLoginFailure(feedback: AttemptFeedback): never {
    if (feedback.locked) {
      throw new HttpException(
        {
          message: 'Too many attempts. Please try again later.',
          meta: feedback,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    throw new UnauthorizedException({
      message: INVALID_CREDENTIALS_MESSAGE,
      meta: feedback,
    });
  }

  private clearFailure(map: Map<string, AttemptState>, key: string): void {
    map.delete(key);
  }

  private generateEmailVerificationArtifacts() {
    const rawToken = randomBytes(32).toString('hex');
    return {
      rawToken,
      tokenHash: this.hashVerificationToken(rawToken),
      expiresAt: new Date(Date.now() + this.emailVerificationTokenTtlMs),
    };
  }

  private hashVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildVerificationUrl(token: string): string {
    const separator = this.frontendVerifyEmailUrl.includes('?') ? '&' : '?';
    return `${this.frontendVerifyEmailUrl}${separator}token=${token}`;
  }

  private async dispatchVerificationEmail(email: string, token: string) {
    const verificationUrl = this.buildVerificationUrl(token);
    const result = await this.emailService.sendVerificationEmail({
      email,
      verificationUrl,
    });

    if (!result.delivered) {
      this.logVerificationLink(email, token);
    }

    return result;
  }

  private logVerificationLink(email: string, token: string): void {
    const verificationUrl = this.buildVerificationUrl(token);
    this.logger.warn(
      `[EMAIL_FALLBACK_LINK] email=${email} verificationUrl=${verificationUrl}`,
    );
  }

  private audit(event: string, metadata: Record<string, unknown>): void {
    this.logger.warn(`[AUTH_AUDIT] ${event} ${JSON.stringify(metadata)}`);
  }


}
