import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export const SETTINGS_KEYS = {
  SUBSCRIPTION_ENFORCEMENT: 'subscription_enforcement',
  PAYMENT_PROVIDER: 'payment_provider',
  SUBSCRIPTION_AMOUNT_MINOR: 'subscription_amount_minor',
  SUBSCRIPTION_CURRENCY: 'subscription_currency',
  SUBSCRIPTION_PLAN_NAME: 'subscription_plan_name',
  SUBSCRIPTION_DURATION_DAYS: 'subscription_duration_days',
  EMAIL_BRANDING_JSON: 'email_branding_json',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

const DEFAULTS: Record<SettingsKey, string> = {
  [SETTINGS_KEYS.SUBSCRIPTION_ENFORCEMENT]: 'false',
  [SETTINGS_KEYS.PAYMENT_PROVIDER]: 'manual',
  [SETTINGS_KEYS.SUBSCRIPTION_AMOUNT_MINOR]: '5000',
  [SETTINGS_KEYS.SUBSCRIPTION_CURRENCY]: 'NGN',
  [SETTINGS_KEYS.SUBSCRIPTION_PLAN_NAME]: 'basic_monthly',
  [SETTINGS_KEYS.SUBSCRIPTION_DURATION_DAYS]: '30',
  [SETTINGS_KEYS.EMAIL_BRANDING_JSON]: '{}',
};

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: SettingsKey): Promise<string> {
    const row = await this.prisma.systemSettings.findUnique({ where: { key } });
    return row?.value ?? DEFAULTS[key];
  }

  async getAll(): Promise<Record<SettingsKey, string>> {
    const rows = await this.prisma.systemSettings.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<SettingsKey, string>>;
    const result = {} as Record<SettingsKey, string>;
    for (const k of Object.values(SETTINGS_KEYS)) {
      result[k] = map[k] ?? DEFAULTS[k];
    }
    return result;
  }

  async set(key: SettingsKey, value: string): Promise<void> {
    await this.prisma.systemSettings.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async setMany(entries: Partial<Record<SettingsKey, string>>): Promise<void> {
    await Promise.all(
      Object.entries(entries).map(([k, v]) =>
        this.set(k as SettingsKey, v as string),
      ),
    );
  }

  async isSubscriptionEnforced(): Promise<boolean> {
    const val = await this.get(SETTINGS_KEYS.SUBSCRIPTION_ENFORCEMENT);
    return val === 'true';
  }
}
