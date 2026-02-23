import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../common/prisma.service';
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

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
