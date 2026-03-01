import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { PrismaService } from '../../common/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  private readonly emailVerificationTokenTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.emailVerificationTokenTtlMs =
      this.config.get<number>('EMAIL_VERIFICATION_TOKEN_TTL_MS') ?? 86_400_000;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user context');
    }

    const nextFullName = dto.fullName?.trim();
    const nextEmail = dto.email ? this.normalizeEmail(dto.email) : undefined;
    const nextPhone = dto.phone ? this.normalizePhone(dto.phone) : undefined;

    const changesEmail =
      nextEmail !== undefined && nextEmail !== (user.email ?? null);
    const changesPhone = nextPhone !== undefined && nextPhone !== user.phone;
    const needsPasswordCheck = changesEmail || changesPhone;

    if (needsPasswordCheck && !dto.currentPassword) {
      throw new BadRequestException(
        'currentPassword is required when updating email or phone',
      );
    }

    if (needsPasswordCheck) {
      const validPassword = await compare(dto.currentPassword!, user.password);
      if (!validPassword) {
        throw new UnauthorizedException('Invalid current password');
      }
    }

    const data: Prisma.UserUpdateInput = {};

    if (nextFullName && nextFullName !== user.fullName) {
      data.fullName = nextFullName;
    }

    if (changesPhone && nextPhone) {
      data.phone = nextPhone;
    }

    let verificationToken: string | undefined;
    if (changesEmail && nextEmail) {
      const tokenArtifacts = this.generateEmailVerificationArtifacts();
      verificationToken = tokenArtifacts.rawToken;

      data.email = nextEmail;
      data.emailVerifiedAt = null;
      data.emailVerificationTokenHash = tokenArtifacts.tokenHash;
      data.emailVerificationExpiresAt = tokenArtifacts.expiresAt;
    }

    if (Object.keys(data).length === 0) {
      return {
        message: 'No profile changes detected',
        user: await this.getProfile(userId),
      };
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          fullName: true,
          email: true,
          emailVerifiedAt: true,
          phone: true,
          role: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
          reliabilityScore: true,
          cancellationCount: true,
          noShowCount: true,
          cooldownUntil: true,
          blockedUntil: true,
          createdAt: true,
        },
      });

      return {
        message: changesEmail
          ? 'Profile updated. Please verify your new email address'
          : 'Profile updated successfully',
        user: updated,
        ...(this.shouldExposeVerificationToken() && verificationToken
          ? { verificationToken }
          : {}),
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or phone is already in use');
      }

      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'newPassword must be different from currentPassword',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user context');
    }

    const validPassword = await compare(dto.currentPassword, user.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    return {
      message: 'Password updated successfully',
    };
  }

  private async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        reliabilityScore: true,
        cancellationCount: true,
        noShowCount: true,
        cooldownUntil: true,
        blockedUntil: true,
        createdAt: true,
      },
    });
  }

  private generateEmailVerificationArtifacts() {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.emailVerificationTokenTtlMs);

    return { rawToken, tokenHash, expiresAt };
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
}
