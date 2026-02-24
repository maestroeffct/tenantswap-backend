import { IsOptional, IsString } from 'class-validator';

export class RequestInterestDto {
  @IsOptional()
  @IsString()
  requesterListingId?: string;
}
