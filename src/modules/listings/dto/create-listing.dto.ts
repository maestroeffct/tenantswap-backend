import { IsString, IsInt, IsDateString, IsArray, IsBoolean } from 'class-validator';

export class CreateListingDto {
  // LOOKING FOR
  @IsString()
  desiredType: string;

  @IsString()
  desiredCity: string;

  @IsInt()
  maxBudget: number;

  @IsString()
  timeline: string;

  // LEAVING
  @IsString()
  currentType: string;

  @IsString()
  currentCity: string;

  @IsInt()
  currentRent: number;

  @IsBoolean()
  currentAvailable: boolean;

  @IsDateString()
  currentAvailableOn: string;

  @IsArray()
  features: string[];
}
