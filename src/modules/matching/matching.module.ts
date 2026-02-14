import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { AiService } from './ai.service';

@Module({
  controllers: [MatchingController],
  providers: [MatchingService, PrismaService, AiService],
})
export class MatchingModule {}
