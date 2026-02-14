import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { PrismaService } from './common/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { MatchingModule } from './modules/matching/matching.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    PassportModule,

    UsersModule,

    AuthModule,

    ListingsModule,

    MatchingModule,
  ],
  providers: [PrismaService, JwtStrategy],
})
export class AppModule {}
