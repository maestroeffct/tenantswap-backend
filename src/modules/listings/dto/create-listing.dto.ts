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

export class CreateListingDto {
  @IsOptional()
  @IsEnum(['SWAP', 'SEEKING'])
  listingType?: 'SWAP' | 'SEEKING';

  @IsOptional()
  @IsEnum(['NYSC', 'WORK', 'SCHOOL', 'FAMILY_HOME', 'OTHER'])
  seekerCategory?: 'NYSC' | 'WORK' | 'SCHOOL' | 'FAMILY_HOME' | 'OTHER';

  @IsString()
  desiredType: string;

  @IsString()
  desiredState: string;

  @IsString()
  desiredCity: string;

  @IsOptional()
  @IsString()
  desiredArea?: string | null;

  @IsInt()
  maxBudget: number;

  @IsString()
  timeline: string;

  @ValidateIf((o) => o.listingType !== 'SEEKING')
  @IsString()
  currentType?: string;

  @ValidateIf((o) => o.listingType !== 'SEEKING')
  @IsString()
  currentState?: string;

  @ValidateIf((o) => o.listingType !== 'SEEKING')
  @IsString()
  currentCity?: string;

  @IsOptional()
  @IsString()
  currentArea?: string | null;

  @ValidateIf((o) => o.listingType !== 'SEEKING')
  @IsInt()
  currentRent?: number;

  @ValidateIf((o) => o.listingType !== 'SEEKING')
  @IsBoolean()
  currentAvailable?: boolean;

  @ValidateIf((o) => o.listingType !== 'SEEKING' && o.currentAvailable !== false)
  @IsDateString()
  currentAvailableOn?: string | null;

  @ValidateIf((o) => o.listingType !== 'SEEKING')
  @IsArray()
  features?: string[];
}
