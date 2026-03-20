import { hash } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionStatus, UserRole, type User } from '@prisma/client';

import { PrismaService } from '../../src/common/prisma.service';

type CreateTestUserInput = {
  fullName?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  subscriptionStatus?: SubscriptionStatus;
  canConnectLandlord?: boolean;
  hasLandlordContact?: boolean;
  onboardingComplete?: boolean;
};

let userCounter = 0;

export async function createTestUser(
  prisma: PrismaService,
  input: CreateTestUserInput = {},
): Promise<User> {
  userCounter += 1;
  const suffix = `${Date.now()}-${userCounter}`;

  return prisma.user.create({
    data: {
      fullName: input.fullName ?? `Test User ${userCounter}`,
      email: input.email ?? `test${suffix}@example.com`,
      phone: input.phone ?? `+23480${String(10000000 + userCounter).slice(-8)}`,
      password: await hash('Password123!', 10),
      role: input.role ?? 'USER',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      subscriptionStatus: input.subscriptionStatus ?? 'ACTIVE',
      subscriptionStartedAt: new Date(),
      subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      canConnectLandlord: input.canConnectLandlord ?? true,
      hasLandlordContact: input.hasLandlordContact ?? true,
      onboardingComplete: input.onboardingComplete ?? false,
      allowIncomingCalls: true,
    },
  });
}

export function issueAccessToken(jwtService: JwtService, user: Pick<User, 'id' | 'tokenVersion'>) {
  return jwtService.sign({
    userId: user.id,
    tokenVersion: user.tokenVersion,
  });
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
