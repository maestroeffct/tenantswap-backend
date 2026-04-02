import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class VerifyListingDto {
  @IsEnum(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @ValidateIf((o) => o.action === 'REJECT')
  @IsString()
  rejectionNote?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
