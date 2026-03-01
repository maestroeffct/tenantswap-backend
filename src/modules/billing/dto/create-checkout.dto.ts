import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCheckoutDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;
}
