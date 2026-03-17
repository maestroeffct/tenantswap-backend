import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { OauthService } from '../../common/services/oauth.service';
import { TermiiService } from '../../common/services/termii.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_LOGIN_MAX_ATTEMPTS') return 5;
      if (key === 'AUTH_LOGIN_WINDOW_MS') return 900_000;
      if (key === 'AUTH_LOGIN_LOCK_MS') return 900_000;
      if (key === 'EMAIL_VERIFICATION_TOKEN_TTL_MS') return 86_400_000;
      if (key === 'FRONTEND_VERIFY_EMAIL_URL')
        return 'http://localhost:3000/verify-email';
      return undefined;
    }),
  };

  const jwtMock = {
    sign: jest.fn(),
  };

  const emailServiceMock = {
    sendVerificationEmail: jest.fn(() => ({
      delivered: true,
      provider: 'smtp',
      attempts: 1,
      messageId: 'msg-1',
    })),
  };

  const termiiServiceMock = {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };

  const oauthServiceMock = {
    verifyIdentityToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: ConfigService,
          useValue: configMock,
        },
        {
          provide: JwtService,
          useValue: jwtMock,
        },
        {
          provide: EmailService,
          useValue: emailServiceMock,
        },
        {
          provide: TermiiService,
          useValue: termiiServiceMock,
        },
        {
          provide: OauthService,
          useValue: oauthServiceMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('revokes active tokens on logout', async () => {
    prismaMock.user.update.mockResolvedValue({
      id: 'user-1',
      tokenVersion: 3,
    });

    const result = await service.logout('user-1', '127.0.0.1');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        tokenVersion: true,
      },
    });
    expect(result.message).toBe('Logout successful');
  });
});
