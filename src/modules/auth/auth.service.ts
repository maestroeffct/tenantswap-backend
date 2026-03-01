import {
  BadRequestException,
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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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
  }

  async register(dto: RegisterDto, ip: string) {
    const normalizedPhone = this.normalizePhone(dto.phone);
    const normalizedEmail = this.normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: normalizedPhone }, { email: normalizedEmail }],
      },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    let verificationToken: string | undefined;

    if (existingUser) {
      if (
        !existingUser.emailVerifiedAt &&
        existingUser.email === normalizedEmail
      ) {
        const tokenArtifacts = this.generateEmailVerificationArtifacts();
        verificationToken = tokenArtifacts.rawToken;

        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            emailVerificationTokenHash: tokenArtifacts.tokenHash,
            emailVerificationExpiresAt: tokenArtifacts.expiresAt,
          },
        });

        this.audit('register_existing_unverified', {
          ip,
          userId: existingUser.id,
          email: normalizedEmail,
        });
        this.logVerificationLink(normalizedEmail, tokenArtifacts.rawToken);
      } else {
        this.audit('register_existing_verified', {
          ip,
          email: normalizedEmail,
          phone: normalizedPhone,
        });
      }

      return this.registerResponse(verificationToken);
    }

    const hashedPassword = await hash(dto.password, 10);
    const tokenArtifacts = this.generateEmailVerificationArtifacts();
    verificationToken = tokenArtifacts.rawToken;

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        password: hashedPassword,
        emailVerificationTokenHash: tokenArtifacts.tokenHash,
        emailVerificationExpiresAt: tokenArtifacts.expiresAt,
      },
      select: { id: true, email: true },
    });

    this.audit('register_success', {
      ip,
      userId: user.id,
      email: user.email,
    });
    this.logVerificationLink(normalizedEmail, tokenArtifacts.rawToken);

    return this.registerResponse(verificationToken);
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

      this.logVerificationLink(normalizedEmail, tokenArtifacts.rawToken);
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

  private registerResponse(verificationToken?: string) {
    return {
      message: REGISTER_GENERIC_MESSAGE,
      ...(this.shouldExposeVerificationToken() && verificationToken
        ? { verificationToken }
        : {}),
    };
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

  private logVerificationLink(email: string, token: string): void {
    if (!this.shouldExposeVerificationToken()) {
      this.logger.log(`Verification email queued for ${email}`);
      return;
    }

    const separator = this.frontendVerifyEmailUrl.includes('?') ? '&' : '?';
    const verificationUrl = `${this.frontendVerifyEmailUrl}${separator}token=${token}`;

    this.logger.log(
      `Verification email prepared for ${email}: ${verificationUrl}`,
    );
  }

  private audit(event: string, metadata: Record<string, unknown>): void {
    this.logger.warn(`[AUTH_AUDIT] ${event} ${JSON.stringify(metadata)}`);
  }
}
