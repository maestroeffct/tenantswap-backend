import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReportReasonDto {
  AGENT_SUSPECTED = 'AGENT_SUSPECTED',
  FAKE_LISTING = 'FAKE_LISTING',
  HARASSMENT = 'HARASSMENT',
  SCAM = 'SCAM',
  OTHER = 'OTHER',
}

export class ReportUserDto {
  @IsEnum(ReportReasonDto)
  reason: ReportReasonDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
