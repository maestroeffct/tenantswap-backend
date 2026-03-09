import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  @Matches(/^\d+$/, {
    message: 'pin must contain only digits',
  })
  pin: string;
}
