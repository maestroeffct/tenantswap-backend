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

  @IsOptional()
  @ValidateNested()
  @Type(() => VacancyAlertDto)
  vacancyAlert?: VacancyAlertDto | null;
}
