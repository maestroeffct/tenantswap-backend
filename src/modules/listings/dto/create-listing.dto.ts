import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  IsArray,
} from 'class-validator';

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

  @IsDateString()
  availableOn: string;

  @IsArray()
  features: string[];
}
