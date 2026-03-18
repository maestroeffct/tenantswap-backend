import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateListingDto {
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

  @IsString()
  currentType: string;

  @IsString()
  currentState: string;

  @IsString()
  currentCity: string;

  @IsOptional()
  @IsString()
  currentArea?: string | null;

  @IsInt()
  currentRent: number;

  @IsBoolean()
  currentAvailable: boolean;

  @ValidateIf((object) => object.currentAvailable !== false)
  @IsDateString()
  currentAvailableOn?: string | null;

  @IsArray()
  features: string[];
}
