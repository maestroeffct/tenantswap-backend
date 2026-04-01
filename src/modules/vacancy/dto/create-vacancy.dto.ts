import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateVacancyDto {
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
