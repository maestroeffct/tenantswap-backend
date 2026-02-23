import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaService } from '../../common/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function parseJwtExpiresInToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    return 900;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 's') return amount;
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 60 * 60;
  return amount * 60 * 60 * 24;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not configured');
        }

        const expiresInRaw = config.get<string>('JWT_EXPIRES_IN') ?? '15m';

        return {
          secret,
          signOptions: {
            expiresIn: parseJwtExpiresInToSeconds(expiresInRaw),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
})
export class AuthModule {}
