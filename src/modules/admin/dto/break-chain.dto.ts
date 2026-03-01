import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum AdminBreakReason {
  ADMIN_FORCE = 'ADMIN_FORCE',
  NO_SHOW = 'NO_SHOW',
  CONFLICT = 'CONFLICT',
  UNKNOWN = 'UNKNOWN',
}

export class BreakChainDto {
  @IsOptional()
  @IsEnum(AdminBreakReason)
  reason?: AdminBreakReason;

  @IsOptional()
  @IsUUID()
  offenderUserId?: string;
}
