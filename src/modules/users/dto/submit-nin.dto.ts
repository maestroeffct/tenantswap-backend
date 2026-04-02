import { IsString, Matches, Length } from 'class-validator';

export class SubmitNinDto {
  @IsString()
  @Length(11, 11, { message: 'NIN must be exactly 11 digits' })
  @Matches(/^\d{11}$/, { message: 'NIN must contain only digits' })
  nin: string;
}
