import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class VacancyAlertDto {
  @IsString()
  apartmentType: string;

  @IsString()
  state: string;

  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  area?: string | null;

  @IsArray()
  features: string[];
}

export class UpdateListingDto {
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

  @IsOptional()
  @ValidateNested()
  @Type(() => VacancyAlertDto)
  vacancyAlert?: VacancyAlertDto | null;
}
