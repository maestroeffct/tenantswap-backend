import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PaymentTransactionStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  private readonly enforceSubscription: boolean;
  private readonly testerAllowlist: string[];
  private readonly paymentProvider: string;
  private readonly webhookSecret: string;
  private readonly defaultPlan: string;
  private readonly defaultAmountMinor: number;
  private readonly defaultDurationDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.enforceSubscription =
      this.config.get<boolean>('SUBSCRIPTION_ENFORCEMENT') ?? false;
    this.testerAllowlist = this.config.get<string[]>('TESTER_ALLOWLIST') ?? [];
    this.paymentProvider =
      this.config.get<string>('PAYMENT_PROVIDER')?.toLowerCase() ?? 'manual';
    this.webhookSecret =
      this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? 'dev-webhook-secret';
    this.defaultPlan =
      this.config.get<string>('SUBSCRIPTION_DEFAULT_PLAN') ?? 'basic_monthly';
    this.defaultAmountMinor =
      this.config.get<number>('SUBSCRIPTION_DEFAULT_AMOUNT_MINOR') ?? 5000;
    this.defaultDurationDays =
      this.config.get<number>('SUBSCRIPTION_DEFAULT_DURATION_DAYS') ?? 30;
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('00')) {
      return `+${cleaned.slice(2)}`;
    }

    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isAllowlisted(email: string | null, phone: string): boolean {
    const normalizedEmail = email ? this.normalizeEmail(email) : null;
    const normalizedPhone = this.normalizePhone(phone).toLowerCase();

    const allowSet = new Set(
      this.testerAllowlist.map((entry) => entry.trim().toLowerCase()),
    );

    return (
      (normalizedEmail ? allowSet.has(normalizedEmail) : false) ||
      allowSet.has(normalizedPhone)
    );
  }

  private isSubscriptionActive(
    status: SubscriptionStatus,
    expiresAt: Date | null,
  ) {
    return status === 'ACTIVE' && (!expiresAt || expiresAt > new Date());
  }

  private parseDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseIntValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private resolveCurrency(value: unknown): string {
    return typeof value === 'string' && value.trim()
      ? value.trim().toUpperCase()
      : 'NGN';
  }

  private computeEndDate(startAt: Date, durationDays: number): Date {
    return new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  }

  private async resolveUserFromWebhookData(data: Record<string, unknown>) {
    const userId = typeof data.userId === 'string' ? data.userId.trim() : null;
    if (userId) {
      return this.prisma.user.findUnique({ where: { id: userId } });
    }

    const email =
      typeof data.email === 'string' ? this.normalizeEmail(data.email) : null;
    if (email) {
      return this.prisma.user.findUnique({ where: { email } });
    }

    const phone =
      typeof data.phone === 'string' ? this.normalizePhone(data.phone) : null;
    if (phone) {
      return this.prisma.user.findUnique({ where: { phone } });
    }

    return null;
  }

  private async upsertPaymentTransaction(input: {
    userId: string;
    provider: string;
    providerEventId: string;
    providerReference: string;
    amountMinor: number;
    currency: string;
    planCode: string | null;
    status: PaymentTransactionStatus;
    paidAt?: Date | null;
    subscriptionStartAt?: Date | null;
    subscriptionEndAt?: Date | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.paymentTransaction.upsert({
      where: {
        providerReference: input.providerReference,
      },
      update: {
        providerEventId: input.providerEventId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        planCode: input.planCode,
        status: input.status,
        paidAt: input.paidAt ?? null,
        subscriptionStartAt: input.subscriptionStartAt ?? null,
        subscriptionEndAt: input.subscriptionEndAt ?? null,
        metadata: input.metadata,
      },
      create: {
        userId: input.userId,
        provider: input.provider,
        providerEventId: input.providerEventId,
        providerReference: input.providerReference,
        amountMinor: input.amountMinor,
        currency: input.currency,
        planCode: input.planCode,
        status: input.status,
        paidAt: input.paidAt ?? null,
        subscriptionStartAt: input.subscriptionStartAt ?? null,
        subscriptionEndAt: input.subscriptionEndAt ?? null,
        metadata: input.metadata,
      },
    });
  }

  async getMySubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionProvider: true,
        subscriptionReference: true,
        subscriptionStartedAt: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const testerBypass = this.isAllowlisted(user.email, user.phone);
    const hasAccess =
      !this.enforceSubscription ||
      testerBypass ||
      this.isSubscriptionActive(user.subscriptionStatus, user.subscriptionExpiresAt);

    return {
      enforcementEnabled: this.enforceSubscription,
      testerBypass,
      hasAccess,
      subscription: {
        status: user.subscriptionStatus,
        plan: user.subscriptionPlan,
        provider: user.subscriptionProvider,
        reference: user.subscriptionReference,
        startedAt: user.subscriptionStartedAt,
        expiresAt: user.subscriptionExpiresAt,
      },
    };
  }

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const amountMinor = dto.amountMinor ?? this.defaultAmountMinor;
    const currency = dto.currency?.trim().toUpperCase() ?? 'NGN';
    const planCode = dto.planCode?.trim() || this.defaultPlan;
    const durationDays = dto.durationDays ?? this.defaultDurationDays;

    const reference = `TS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    await this.prisma.paymentTransaction.create({
      data: {
        userId: user.id,
        provider: this.paymentProvider,
        providerReference: reference,
        amountMinor,
        currency,
        planCode,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `[CHECKOUT_CREATED] userId=${user.id} provider=${this.paymentProvider} reference=${reference}`,
    );

    return {
      success: true,
      message: 'Checkout initialized',
      checkout: {
        provider: this.paymentProvider,
        reference,
        amountMinor,
        currency,
        planCode,
        durationDays,
        status: 'PENDING',
      },
      next: {
        webhookEventType: 'payment.succeeded',
      },
    };
  }

  async handleWebhook(
    payload: PaymentWebhookDto,
    signature: string | undefined,
  ) {
    if (!signature || signature !== this.webhookSecret) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const provider =
      (payload.provider?.trim().toLowerCase() || this.paymentProvider).trim();

    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_eventId: {
          provider,
          eventId: payload.eventId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingEvent) {
      return {
        success: true,
        duplicate: true,
      };
    }

    const result = await this.processWebhookEvent(provider, payload);

    await this.prisma.paymentWebhookEvent.create({
      data: {
        provider,
        eventId: payload.eventId,
        eventType: payload.type,
        signature,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `[PAYMENT_WEBHOOK] provider=${provider} eventId=${payload.eventId} type=${payload.type}`,
    );

    return {
      success: true,
      duplicate: false,
      result,
    };
  }

  private async processWebhookEvent(provider: string, payload: PaymentWebhookDto) {
    const data = payload.data;
    const type = payload.type.trim().toLowerCase();

    const parsedAmount = this.parseIntValue(data.amountMinor);
    const amountMinor = parsedAmount ?? this.defaultAmountMinor;
    const currency = this.resolveCurrency(data.currency);
    const durationDays =
      this.parseIntValue(data.durationDays) ?? this.defaultDurationDays;
    const planCode =
      typeof data.planCode === 'string' && data.planCode.trim()
        ? data.planCode.trim()
        : this.defaultPlan;
    const reference =
      typeof data.reference === 'string' && data.reference.trim()
        ? data.reference.trim()
        : `${provider}:${payload.eventId}`;

    const paidAt = this.parseDate(data.paidAt) ?? new Date();
    const subscriptionStartAt = this.parseDate(data.subscriptionStartAt) ?? paidAt;
    const subscriptionEndAt =
      this.parseDate(data.subscriptionEndAt) ??
      this.parseDate(data.expiresAt) ??
      this.computeEndDate(subscriptionStartAt, durationDays);

    const userFromData = await this.resolveUserFromWebhookData(data);

    if (
      ['payment.succeeded', 'subscription.activated', 'subscription.renewed'].includes(
        type,
      )
    ) {
      if (!userFromData) {
        throw new BadRequestException('Webhook user context was not resolved');
      }

      await this.upsertPaymentTransaction({
        userId: userFromData.id,
        provider,
        providerEventId: payload.eventId,
        providerReference: reference,
        amountMinor,
        currency,
        planCode,
        status: 'SUCCESS',
        paidAt,
        subscriptionStartAt,
        subscriptionEndAt,
        metadata: payload as unknown as Prisma.InputJsonValue,
      });

      await this.prisma.user.update({
        where: { id: userFromData.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: planCode,
          subscriptionProvider: provider,
          subscriptionReference: reference,
          subscriptionStartedAt: subscriptionStartAt,
          subscriptionExpiresAt: subscriptionEndAt,
        },
      });

      return {
        action: 'subscription_activated',
        userId: userFromData.id,
        status: 'ACTIVE',
      };
    }

    if (type === 'payment.failed') {
      if (userFromData) {
        await this.upsertPaymentTransaction({
          userId: userFromData.id,
          provider,
          providerEventId: payload.eventId,
          providerReference: reference,
          amountMinor,
          currency,
          planCode,
          status: 'FAILED',
          metadata: payload as unknown as Prisma.InputJsonValue,
        });

        await this.prisma.user.update({
          where: { id: userFromData.id },
          data: {
            subscriptionStatus: 'PAST_DUE',
          },
        });
      }

      return {
        action: 'payment_failed',
        userId: userFromData?.id ?? null,
      };
    }

    if (['subscription.canceled', 'subscription.expired'].includes(type)) {
      let userId = userFromData?.id ?? null;

      if (!userId) {
        const tx = await this.prisma.paymentTransaction.findUnique({
          where: { providerReference: reference },
          select: { userId: true },
        });
        userId = tx?.userId ?? null;
      }

      if (!userId) {
        throw new BadRequestException('Unable to resolve user for subscription state update');
      }

      const status: SubscriptionStatus =
        type === 'subscription.expired' ? 'EXPIRED' : 'CANCELED';

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: status,
          subscriptionExpiresAt: this.parseDate(data.expiresAt) ?? new Date(),
        },
      });

      await this.upsertPaymentTransaction({
        userId,
        provider,
        providerEventId: payload.eventId,
        providerReference: reference,
        amountMinor,
        currency,
        planCode,
        status: 'CANCELED',
        metadata: payload as unknown as Prisma.InputJsonValue,
      });

      return {
        action: 'subscription_deactivated',
        userId,
        status,
      };
    }

    return {
      action: 'ignored',
      reason: `Unsupported event type: ${payload.type}`,
    };
  }
}
