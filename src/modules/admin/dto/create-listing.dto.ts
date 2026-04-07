import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateListingDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsIn(['SWAP', 'SEEKING'])
  listingType: string;

  @IsString()
  desiredType: string;

  @IsString()
  desiredState: string;

  @IsString()
  desiredCity: string;

  @IsOptional()
  @IsString()
  desiredArea?: string;

  @IsNumber()
  maxBudget: number;

  @IsString()
  timeline: string;

  @IsOptional()
  @IsString()
  currentType?: string;

  @IsOptional()
  @IsString()
  currentState?: string;

  @IsOptional()
  @IsString()
  currentCity?: string;

  @IsOptional()
  @IsNumber()
  currentRent?: number;

  @IsOptional()
  @IsBoolean()
  currentAvailable?: boolean;

  @IsOptional()
  @IsArray()
  features?: string[];
}
