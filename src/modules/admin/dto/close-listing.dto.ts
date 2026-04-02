import { IsOptional, IsString } from 'class-validator';

export class CloseListingDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
