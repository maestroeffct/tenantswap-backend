import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationService } from '../matching/notification.service';
import { CreateVacancyDto } from './dto/create-vacancy.dto';

@Injectable()
export class VacancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly matchingService: MatchingService,
  ) {}

  private normalizeNullableString(value?: string | null) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  async createVacancy(userId: string, dto: CreateVacancyDto) {
    const vacancy = await this.prisma.vacancyAlert.create({
      data: {
        userId,
        apartmentType: dto.apartmentType,
        state: dto.state,
        city: dto.city,
        area: this.normalizeNullableString(dto.area),
        features: dto.features,
      },
    });

    // Notify users with active listings in matching location
    await this.notifyRecipients({ userId, vacancy });

    return vacancy;
  }

  async getMyVacancies(userId: string) {
    return this.prisma.vacancyAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteVacancy(userId: string, vacancyId: string) {
    const vacancy = await this.prisma.vacancyAlert.findUnique({
      where: { id: vacancyId },
    });

    if (!vacancy) {
      throw new BadRequestException('Vacancy alert not found');
    }

    if (vacancy.userId !== userId) {
      throw new ForbiddenException('Not your vacancy alert');
    }

    await this.prisma.vacancyAlert.delete({ where: { id: vacancyId } });
    return { success: true };
  }

  async listPublicVacancies(opts: { state?: string; city?: string; apartmentType?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.state) where.state = opts.state;
    if (opts.city) where.city = opts.city;
    if (opts.apartmentType) where.apartmentType = opts.apartmentType;

    const [total, vacancies] = await Promise.all([
      this.prisma.vacancyAlert.count({ where }),
      this.prisma.vacancyAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          apartmentType: true,
          state: true,
          city: true,
          area: true,
          features: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, profilePhotoUrl: true } },
        },
      }),
    ]);

    return { vacancies, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getPublicVacancy(vacancyId: string) {
    const vacancy = await this.prisma.vacancyAlert.findUnique({
      where: { id: vacancyId },
      select: {
        id: true,
        apartmentType: true,
        state: true,
        city: true,
        area: true,
        features: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            profilePhotoUrl: true,
          },
        },
      },
    });

    return vacancy ?? null;
  }

  async recordClick(vacancyId: string) {
    await this.prisma.vacancyAlert.updateMany({
      where: { id: vacancyId },
      data: { clickCount: { increment: 1 } },
    });
  }

  async recordShare(vacancyId: string) {
    await this.prisma.vacancyAlert.updateMany({
      where: { id: vacancyId },
      data: { shareCount: { increment: 1 } },
    });
  }

  async connectViaVacancy(viewerUserId: string, vacancyId: string) {
    const vacancy = await this.prisma.vacancyAlert.findUnique({
      where: { id: vacancyId },
      select: { userId: true },
    });

    if (!vacancy) {
      throw new BadRequestException('Vacancy not found');
    }

    if (vacancy.userId === viewerUserId) {
      throw new BadRequestException('You cannot connect to your own vacancy');
    }

    // Find owner's most recent listing — any status — vacancy posters don't need an active swap
    const ownerListing = await this.prisma.swapListing.findFirst({
      where: { userId: vacancy.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!ownerListing) {
      throw new BadRequestException('This person has not created a listing yet. Try again later.');
    }

    // Delegate to the full requestInterest flow — skip all status/availability checks:
    // - target status: vacancy poster may have a closed/expired listing, that's OK
    // - target availability: the vacancy signal is independent of their listing availability
    // - requester checks: viewer may have an expired or unavailable listing but still needs housing
    return this.matchingService.requestInterest(ownerListing.id, viewerUserId, undefined, true, true, true);
  }

  private async notifyRecipients(input: {
    userId: string;
    vacancy: { id: string; apartmentType: string; state: string; city: string; area: string | null; features: string[] };
  }) {
    const locationFilter = input.vacancy.area
      ? { desiredState: input.vacancy.state, desiredCity: input.vacancy.city, desiredArea: input.vacancy.area }
      : { desiredState: input.vacancy.state, desiredCity: input.vacancy.city };

    const currentFilter = input.vacancy.area
      ? { currentState: input.vacancy.state, currentCity: input.vacancy.city, currentArea: input.vacancy.area }
      : { currentState: input.vacancy.state, currentCity: input.vacancy.city };

    const matchingListings = await this.prisma.swapListing.findMany({
      where: { status: 'ACTIVE', userId: { not: input.userId }, OR: [locationFilter, currentFilter] },
      select: { userId: true },
      distinct: ['userId'],
    });

    if (matchingListings.length === 0) return;

    const locationLabel = input.vacancy.area ?? input.vacancy.city;
    await this.notificationService.notifyMany(
      matchingListings.map((l) => ({
        userId: l.userId,
        type: 'VACANCY_ALERT_SHARED',
        title: `Possible vacancy in ${locationLabel}`,
        message: `A tenant in ${locationLabel} just reported a possible ${input.vacancy.apartmentType} vacancy.`,
        payload: { vacancyAlertId: input.vacancy.id, apartmentType: input.vacancy.apartmentType, state: input.vacancy.state, city: input.vacancy.city, area: input.vacancy.area, features: input.vacancy.features },
        channels: ['IN_APP'],
      })),
    );
  }
}
