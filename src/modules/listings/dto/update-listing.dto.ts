import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  desiredType?: string;

  @IsOptional()
  @IsString()
  desiredCity?: string;

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
  currentCity?: string;

  @IsOptional()
  @IsInt()
  currentRent?: number;

  @IsOptional()
  @IsBoolean()
  currentAvailable?: boolean;

  @IsOptional()
  @IsDateString()
  currentAvailableOn?: string;

  @IsOptional()
  @IsArray()
  features?: string[];
}
