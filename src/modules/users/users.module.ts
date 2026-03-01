import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [PrismaService, ReliabilityService],
})
export class UsersModule {}
