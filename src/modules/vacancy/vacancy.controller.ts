import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { ReliabilityGuard } from '../../common/guards/reliability.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { VacancyService } from './vacancy.service';

@Controller('vacancy')
export class VacancyController {
  constructor(private readonly vacancyService: VacancyService) {}

  // ── Public endpoints (no auth) ─────────────────────────────────────────────

  @Get(':vacancyId')
  async getPublic(@Param('vacancyId') vacancyId: string) {
    const vacancy = await this.vacancyService.getPublicVacancy(vacancyId);
    if (!vacancy) throw new NotFoundException('Vacancy not found');
    return vacancy;
  }

  @Post(':vacancyId/click')
  async recordClick(@Param('vacancyId') vacancyId: string) {
    await this.vacancyService.recordClick(vacancyId);
    return { success: true };
  }

  @Post(':vacancyId/share')
  async recordShare(@Param('vacancyId') vacancyId: string) {
    await this.vacancyService.recordShare(vacancyId);
    return { success: true };
  }

  // ── Authenticated endpoints ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, SubscriptionGuard, ReliabilityGuard)
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateVacancyDto) {
    return this.vacancyService.createVacancy(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/all')
  getMine(@CurrentUser() user: CurrentUserPayload) {
    return this.vacancyService.getMyVacancies(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':vacancyId')
  delete(@CurrentUser() user: CurrentUserPayload, @Param('vacancyId') vacancyId: string) {
    return this.vacancyService.deleteVacancy(user.id, vacancyId);
  }

  @UseGuards(JwtAuthGuard, SubscriptionGuard, ReliabilityGuard)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post(':vacancyId/connect')
  connect(@CurrentUser() user: CurrentUserPayload, @Param('vacancyId') vacancyId: string) {
    return this.vacancyService.connectViaVacancy(user.id, vacancyId);
  }
}
