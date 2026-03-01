import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class ApplyPenaltyDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  scorePenalty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  blockHours?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
