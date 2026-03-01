import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';

import { PrismaService } from '../../common/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'EMAIL_VERIFICATION_TOKEN_TTL_MS') {
        return 86_400_000;
      }

      if (key === 'NODE_ENV') {
        return 'test';
      }

      return undefined;
    }),
  } as unknown as ConfigService;

  let service: UsersService;

  beforeEach(() => {
    prismaMock.user.findUnique = jest.fn();
    prismaMock.user.update = jest.fn();

    service = new UsersService(prismaMock, configMock);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should update fullName without requiring currentPassword', async () => {
    const dto: UpdateProfileDto = { fullName: 'Ada Lovelace' };

    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        fullName: 'Old Name',
        email: 'ada@example.com',
        phone: '+2348011111111',
        password: 'hashed',
      })
      .mockResolvedValueOnce({
        id: 'u1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        emailVerifiedAt: new Date(),
        phone: '+2348011111111',
        role: 'USER',
        subscriptionStatus: 'INACTIVE',
        subscriptionExpiresAt: null,
        reliabilityScore: 100,
        cancellationCount: 0,
        noShowCount: 0,
        cooldownUntil: null,
        blockedUntil: null,
        createdAt: new Date(),
      });

    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerifiedAt: new Date(),
      phone: '+2348011111111',
      role: 'USER',
      subscriptionStatus: 'INACTIVE',
      subscriptionExpiresAt: null,
      reliabilityScore: 100,
      cancellationCount: 0,
      noShowCount: 0,
      cooldownUntil: null,
      blockedUntil: null,
      createdAt: new Date(),
    });

    const result = await service.updateProfile('u1', dto);

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(result.message).toBe('Profile updated successfully');
  });

  it('should change password when currentPassword is correct', async () => {
    const oldHash = await hash('OldPassword1!', 10);
    const dto: ChangePasswordDto = {
      currentPassword: 'OldPassword1!',
      newPassword: 'NewPassword1!',
    };

    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', password: oldHash });
    prismaMock.user.update.mockResolvedValue({ id: 'u1' });

    const result = await service.changePassword('u1', dto);

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(result.message).toBe('Password updated successfully');
  });
});
