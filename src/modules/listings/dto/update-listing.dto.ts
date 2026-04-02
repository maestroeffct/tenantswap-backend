import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class UpdateListingDto {
  @IsOptional()
  @IsEnum(['SWAP', 'SEEKING'])
  listingType?: 'SWAP' | 'SEEKING';

  @IsOptional()
  @IsEnum(['NYSC', 'WORK', 'SCHOOL', 'FAMILY_HOME', 'OTHER'])
  seekerCategory?: 'NYSC' | 'WORK' | 'SCHOOL' | 'FAMILY_HOME' | 'OTHER';

  @IsOptional()
  @IsString()
  desiredType?: string;

  @IsOptional()
  @IsString()
  desiredState?: string;

  @IsOptional()
  @IsString()
  desiredCity?: string;

  @IsOptional()
  @IsString()
  desiredArea?: string | null;

  @IsOptional()
  @IsInt()
  maxBudget?: number;

  @IsOptional()
  @IsString()
  timeline?: string;

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
  @IsString()
  currentArea?: string | null;

  @IsOptional()
  @IsInt()
  currentRent?: number;

  @IsOptional()
  @IsBoolean()
  currentAvailable?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  currentAvailableOn?: string | null;

  @IsOptional()
  @IsArray()
  features?: string[];
}
