import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaService } from './common/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { MatchingModule } from './modules/matching/matching.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('THROTTLE_GLOBAL_TTL_MS') ?? 60_000,
          limit: config.get<number>('THROTTLE_GLOBAL_LIMIT') ?? 100,
        },
      ],
    }),

    PassportModule,
    UsersModule,
    AuthModule,
    ListingsModule,
    MatchingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    PrismaService,
    JwtStrategy,
  ],
})
export class AppModule {}
