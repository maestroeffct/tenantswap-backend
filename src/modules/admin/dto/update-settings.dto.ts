import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  subscriptionEnforcement?: boolean;

  @IsOptional()
  @IsIn(['manual', 'paystack', 'flutterwave'])
  paymentProvider?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  subscriptionAmountMinor?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  subscriptionCurrency?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  subscriptionPlanName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  subscriptionDurationDays?: number;
}
