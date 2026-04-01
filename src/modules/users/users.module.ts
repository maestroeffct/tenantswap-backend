import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { ReliabilityService } from '../../common/services/reliability.service';
import { UploadService } from '../../common/services/upload.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [PrismaService, ReliabilityService, UsersService, UploadService],
})
export class UsersModule {}
